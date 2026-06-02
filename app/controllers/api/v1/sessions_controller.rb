class Api::V1::SessionsController < Api::V1::BaseController
  VOTING_POWER_REGENERATION_SECONDS = 5.days.to_i

  skip_before_action :sign_in, only: :show

  def show
    unless current_account
      render json: {authenticated: false, login_url: new_session_url}
      return
    end

    render json: {
      authenticated: true,
      account: {
        id: current_account.id,
        name: current_account.name,
        avatar_url: "https://images.hive.blog/u/#{current_account.name}/avatar"
      },
      preferences: {
        muted_authors_enabled: !!session[:muted_authors_enabled],
        only_favorite_tags: !!session[:only_favorite_tags],
        theme: current_account.theme,
        minimum_reputation: current_account.minimum_reputation,
        hivewatchers_blacklist_enabled: current_account.hivewatchers_blacklist_enabled?,
        hivesigner_available: session[:hivesigner_access_token].present?
      },
      blacklist_sources: current_account.blacklist_source_catalog,
      offchain_blacklist_sources: current_account.offchain_blacklist_source_catalog,
      counts: {
        read_posts: current_account.read_posts.count,
        ignored_tags: ignored_tags.size,
        poisoned_pill_tags: poisoned_pill_tags.size,
        favorite_tags: favorite_tags.size,
        past_tags: past_tags.size,
        tags: tags_count
      },
      muted_authors: current_account.muted_authors,
      ignored_tags: ignored_tags,
      poisoned_pill_tags: poisoned_pill_tags,
      favorite_tags: favorite_tags,
      past_tags: current_account.past_tags.left_outer_joins(:community).select('account_tags.tag', 'communities.title', 'communities.community_account').map { |tag| {name: tag.title || tag.tag, tag: tag.tag, image_url: Community.profile_image_from_account(tag.community_account)} }
    }
  end

  def voting_power
    value = current_voting_power

    render json: {
      status: 'ready',
      value: value,
      percent: (value / 100.0).round(1),
      fetched_at: Time.now.utc.iso8601
    }
  rescue StandardError => e
    Rails.logger.warn "Unable to fetch voting power for #{current_account&.name}: #{e.class}: #{e.message}"
    render json: {
      status: 'unavailable',
      value: nil,
      percent: nil,
      fetched_at: Time.now.utc.iso8601
    }
  end

private
  def current_voting_power
    account = nil

    [fetch_database_api_account, fetch_condenser_api_account].compact.each do |account|
      value = voting_power_from_account(account)
      return value if value
    end

    raise 'Hive account voting power is missing'
  end

  def voting_power_from_account(account)
    raw_voting_power = account_value(account, :voting_power)
    last_vote_time = account_value(account, :last_vote_time)
    return nil if raw_voting_power.nil? || last_vote_time.blank?

    voting_power = Integer(raw_voting_power)
    elapsed_seconds = [Time.now.utc - parse_hive_time(last_vote_time), 0].max
    regenerated = voting_power + (elapsed_seconds * 10_000 / VOTING_POWER_REGENERATION_SECONDS)

    [[regenerated.floor, 0].max, 10_000].min
  rescue ArgumentError, TypeError
    nil
  end

  def fetch_database_api_account
    account = nil

    Account.with_simple_failover do
      Account.database_api.find_accounts(accounts: [current_account.name]) do |result|
        account = result.accounts.first
      end
    end

    account
  rescue StandardError => e
    Rails.logger.warn "Unable to fetch voting power via database_api for #{current_account&.name}: #{e.class}: #{e.message}"
    nil
  end

  def fetch_condenser_api_account
    response = Account.api.rpc_client.rpc_execute(:condenser_api, :get_accounts, [[current_account.name]])
    raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

    Array(response.result).first
  end

  def account_value(account, key)
    if account.respond_to?(key)
      account.public_send(key)
    elsif account.respond_to?(:[])
      account[key.to_s] || account[key.to_sym]
    end
  end

  def parse_hive_time(value)
    text = value.to_s
    text = "#{text}Z" unless text.match?(/[zZ]\z|[+-]\d{2}:?\d{2}\z/)
    Time.parse(text)
  end
end
