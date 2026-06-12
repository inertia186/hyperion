require 'open-uri'

class PostBlacklist
  RETRY_DELAYS = [2, 5, 10].freeze
  HIVEWATCHERS_SOURCE = 'hivewatchers'
  HIVEWATCHERS_BLACKLIST_URL = 'https://spaminator.me/api/bl/all.txt'

  def initialize(api:, cache_store:, api_reset:, sleeper: ->(delay) { sleep delay }, logger: Rails.logger, hivewatchers_enabled: nil, hivewatchers_accounts: nil)
    @api = api
    @cache_store = cache_store
    @api_reset = api_reset
    @sleeper = sleeper
    @logger = logger
    @hivewatchers_enabled = hivewatchers_enabled
    @hivewatchers_accounts = hivewatchers_accounts
    @blacklist = nil
    @blacklist_reasons_by_account = nil
    @blacklist_refresh_failed = false
  end

  def blacklist(reload = false)
    reset! if reload
    return @blacklist if @blacklist

    @blacklist = blacklist_reasons_by_account.keys
  end

  def blacklist_reasons_by_account(reload = false)
    @blacklist_refresh_failed = false if reload
    reset! if reload
    return @blacklist_reasons_by_account if @blacklist_reasons_by_account

    if (cached_reasons = cache_store.cached_blacklist_reasons_by_account)
      @blacklist_reasons_by_account = cached_reasons
      return @blacklist_reasons_by_account
    end

    reasons = Hash.new { |hash, key| hash[key] = [] }
    successful_fetches = 0

    blacklist_source_accounts.each do |source_account|
      blacklisted_accounts = bridge_follow_list_accounts_for(source_account, 'blacklisted')
      next if blacklisted_accounts.nil?

      successful_fetches += 1
      add_source_reasons(reasons, blacklisted_accounts, source_account)
    end

    if hivewatchers_blacklist_enabled?
      hivewatchers_accounts = hivewatchers_blacklist_accounts
      if hivewatchers_accounts.nil?
        @blacklist_refresh_failed = true
      else
        successful_fetches += 1
        add_source_reasons(reasons, hivewatchers_accounts, HIVEWATCHERS_SOURCE)
      end
    end

    if successful_fetches.zero?
      stale_reasons = cache_store.cached_blacklist_reasons_by_account(include_expired: true)
      return @blacklist_reasons_by_account = stale_reasons if stale_reasons

      @blacklist_refresh_failed = blacklist_source_accounts.any?
      return @blacklist_reasons_by_account = {}
    end

    @blacklist_reasons_by_account = reasons.transform_values { |account_reasons| account_reasons.sort_by { |reason| reason.fetch('account') } }
    cache_store.cache_blacklist_reasons_by_account(@blacklist_reasons_by_account)
    @blacklist_reasons_by_account
  end

  def refresh_failed?
    !!@blacklist_refresh_failed
  end

  def reasons_for(author)
    blacklist_reasons_by_account[author.to_s.downcase] || []
  end

  def blacklist_source_accounts
    @blacklist_source_accounts ||= begin
      account_names = Account.pluck(:name).map(&:to_s).map(&:downcase).reject(&:blank?).uniq
      sources = []

      account_names.each do |account|
        followed_blacklists = bridge_follow_list_accounts_for(account, 'follow_blacklist')
        next if followed_blacklists.nil?

        sources << account
        sources += followed_blacklists if followed_blacklists
      end

      sources.reject(&:blank?).uniq
    end
  rescue => e
    logger.warn "Unable to refresh blacklist source accounts: #{e.class}: #{e.message}"
    []
  end

  def hivewatchers_blacklist_enabled?
    return hivewatchers_enabled.call if hivewatchers_enabled

    Account.where("settings->>? IN ('true', '1')", Account::HIVEWATCHERS_BLACKLIST_SETTING).exists?
  end

  def hivewatchers_blacklist_accounts
    return hivewatchers_accounts.call if hivewatchers_accounts

    body = URI.open(HIVEWATCHERS_BLACKLIST_URL, &:read)
    parse_hivewatchers_blacklist(body)
  rescue => e
    logger.warn "Unable to refresh Hivewatchers blacklist from #{HIVEWATCHERS_BLACKLIST_URL}: #{e.class}: #{e.message}"
    nil
  end

  def parse_hivewatchers_blacklist(body)
    body.lines.map do |line|
      line.to_s.strip.downcase.split(/\s+/).first.to_s.delete_prefix('@')
    end.reject(&:blank?).reject { |account| account.start_with?('#') }.uniq
  end

private
  attr_reader :api, :cache_store, :api_reset, :sleeper, :logger, :hivewatchers_enabled, :hivewatchers_accounts

  def reset!
    @blacklist = @blacklist_reasons_by_account = @blacklist_source_accounts = nil
    cache_store.clear_blacklist_cache!
  end

  def add_source_reasons(reasons, accounts, source_account)
    accounts.each do |account|
      account = account.to_s.downcase
      next if account.blank?

      reason = {'account' => source_account}
      reasons[account] << reason unless reasons[account].include?(reason)
    end
  end

  def bridge_follow_list_accounts_for(account, type)
    response = get_bridge_follow_list_with_retry(account, type)
    Array(response).map { |follow| follow.respond_to?(:name) ? follow.name : follow['name'] || follow[:name] }.
      map(&:to_s).
      map(&:downcase).
      reject(&:blank?).
      uniq
  rescue => e
    logger.warn "Unable to refresh #{type} follow list for #{account}: #{e.class}: #{e.message}"
    nil
  end

  def get_bridge_follow_list_with_retry(account, type)
    attempts = 0

    begin
      response = api.rpc_client.rpc_execute(:bridge, :get_follow_list, {observer: account, follow_type: type})
      raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

      response.result
    rescue => e
      raise e unless rate_limited_error?(e) && attempts < RETRY_DELAYS.size

      delay = RETRY_DELAYS[attempts]
      attempts += 1
      logger.warn "Rate limited refreshing #{type} follow list for #{account}; retrying in #{delay}s"
      sleeper.call(delay)
      api_reset.call
      retry
    end
  end

  def rate_limited_error?(error)
    error.to_s.include?('429') || error.to_s.include?('Too Many Requests')
  end
end
