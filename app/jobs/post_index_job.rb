require 'open-uri'

class PostIndexJob < ApplicationJob
  extend Immutable
  extend Memoist
  
  DEPLORABLES = %w(crystalliu anfeng nchain crystalan crystal.liu crystalliuyifei hkex liuyifei lyf)
  
  queue_as :default
  
  DEFAULT_NODE_URLS = (ENV['HYPERION_NODE_URLS'] || 'https://api.hive.blog').split(',')
  HIVE_MAX_WITNESSES = 21
  BLOCK_INTERVAL_SEC = 3
  BLOCK_INTERVAL_7_DAYS = (Time.now.utc - 7.days.ago) / BLOCK_INTERVAL_SEC
  BLOCK_INTERVAL_DAY = (Time.now.utc - 1.day.ago) / BLOCK_INTERVAL_SEC
  BLOCK_INTERVAL_SHUFFLE_WINDOW = BLOCK_INTERVAL_SEC * HIVE_MAX_WITNESSES
  MAX_TAGS = 50
  BLACKLIST_CACHE_TTL = 30.minutes
  BLACKLIST_RETRY_DELAYS = [2, 5, 10].freeze
  HIVEWATCHERS_SOURCE = 'hivewatchers'
  HIVEWATCHERS_BLACKLIST_URL = 'https://spaminator.me/api/bl/all.txt'

  class << self
    def cached_blacklist_reasons_by_account(include_expired: false)
      cache = @blacklist_reasons_cache
      return nil unless cache
      return cache[:value] if include_expired || cache[:expires_at] > Time.current

      nil
    end

    def cache_blacklist_reasons_by_account(reasons)
      @blacklist_reasons_cache = {value: reasons, expires_at: BLACKLIST_CACHE_TTL.from_now}
    end

    def clear_blacklist_cache!
      @blacklist_reasons_cache = nil
    end
  end
  
  def perform(*args)
    if hafsql_indexer_enabled?
      HafsqlPostIndexer.new.perform
    else
      perform_with_rpc(*args)
    end
  end

  def perform_with_rpc(*args)
    head_block_num, blockchain_time = PostIndexJob::database_api.get_dynamic_global_properties do |dgpo|
      [dgpo.head_block_number, Time.parse(dgpo.time + 'Z')]
    end
    start_block_num = (head_block_num - BLOCK_INTERVAL_7_DAYS).to_i
    
    Rails.logger.info "Active posts must be after block_num: #{start_block_num}"
    
    if start_block_num < (maximum_block_num = Post.maximum(:block_num) || 0)
      Rails.logger.info "Resuming index after block_num: #{maximum_block_num}"
      
      start_block_num = maximum_block_num + 1
    else
      Rails.logger.info "Skipping #{start_block_num - maximum_block_num} blocks (too old to index)."
    end
    
    Rails.logger.info "Starting on block_num: #{start_block_num}"
    Rails.logger.info "Blacklist size: #{blacklist(true).size}" # reload blacklist
    
    catch :retry do
      PostIndexJob::stream.blocks(at_block_num: start_block_num) do |block, block_num|
        if block.nil?
          puts "Retrying at block number: #{start_block_num} ..."
          sleep 3
          
          PostIndexJob::api_reset
          throw :retry
        end
        
        # Over one shuffle window of catch-up, don't bother to check with
        # "in_blog?"" method.
        overdue_catch_up = head_block_num - block_num > BLOCK_INTERVAL_SHUFFLE_WINDOW
        
        Post.transaction do
          start_block_num = block_num
          timestamp = Time.parse(block.timestamp + 'Z')
          transactions = block.transactions
          comment_batch = {}
          delete_comments = []
          follow_updates = []
          
          transactions.each_with_index do |trx, index|
            trx_id = block.transaction_ids[index]
            ops = trx.operations
            comment_batch[trx_id] ||= []
            comment_batch[trx_id] += ops.map do |op|
              next unless op.type == 'comment_operation'
              next unless op.value.parent_author.to_s == ''
              next if DEPLORABLES.include? op.value.author
              
              op.value
            end.compact
            
            delete_comments += ops.map do |op|
              next unless op.type == 'delete_comment_operation'
              next if DEPLORABLES.include? op.value.author
              
              op.value
            end.compact
            
            follow_updates += ops.map do |op|
              next unless op.type == 'custom_json_operation'
              next if op.value.required_posting_auths.empty?
              next if (DEPLORABLES & op.value.required_posting_auths).any?
              
              author = op.value.required_posting_auths[0]
              # next if Account.where(name: author).none?
              
              payload = JSON[op.value.json] rescue []
              next unless payload[0] == 'follow'
              
              payload[1]
            end.compact
          end
          
          process_comments(comment_batch, block_num, timestamp, overdue_catch_up)
          process_delete_comments(delete_comments, timestamp)
          process_follow_updates(follow_updates)
        end
      end
    rescue Hive::UnknownError => e
      if e.to_s.include? 'Request Entity Too Large'
        Hive::BlockApi.const_set 'MAX_RANGE_SIZE', 1
        throw :retry
      else
        raise e
      end
    end
  end

  def hafsql_indexer_enabled?
    ActiveModel::Type::Boolean.new.cast(ENV.fetch('HAFSQL_INDEXER_ENABLED', 'true'))
  end
  
  def process_comments(comment_batch, block_num, timestamp, overdue_catch_up = false)
    comment_batch.each do |trx_id, comments|
      author_reputations = author_reputations_for(comments.map { |comment| comment[:author] || comment['author'] })

      comments.each do |comment|
        comment = comment.with_indifferent_access
        comment_params = comment.slice(:title, :body)
        comment_params[:category] = comment[:parent_permlink]
        comment_params[:metadata] = JSON[comment[:json_metadata]] rescue {}
        comment_params[:block_num] = block_num
        comment_params[:trx_id] = trx_id
        comment_params[:created_at] = timestamp
        
        comment_params = comment_params.with_indifferent_access
        
        post = Post.find_or_initialize_by(comment.slice(:author, :permlink))
        reasons = blacklist_reasons_for(comment[:author])
        comment_params[:blacklisted] = post.blacklisted? || reasons.any?
        comment_params[:blacklist_reasons] = reasons if reasons.any?
        comment_params[:author_reputation] = author_reputations[comment[:author].to_s.downcase] || HiveReputation::DEFAULT_REPUTATION
        post.update(comment_params)
        
        if !(post.body =~ Post::DIFF_MATCH_PATCH_PATTERN) && post.body =~ /@@/
          Rails.logger.warn "[#{post.author}/#{post.permlink}] - Non-regex edit match."
        end
        
        if post.body.nil?
          Rails.logger.info "[#{post.author}] - Fixing previous fetch.  Fetching latest ..."
          
          post.fetch_latest
          post.save
        elsif post.body =~ Post::DIFF_MATCH_PATCH_PATTERN
          Rails.logger.info "[#{post.author}] - Looks like an edit.  Fetching latest ..."
          
          # Detect if the body contains an edit.  Need to fetch the full
          # body because there's no guarantee we saw the complete previous
          # version at any point.
          
          post.fetch_latest
          post.save
        elsif !post.in_blog?(overdue_catch_up ? 1000 : 100)
          if overdue_catch_up
            Rails.logger.info "[#{post.author}/#{post.permlink}] - Not in the last blog entry (trying to catch up).  Fetching latest ..."
          else
            Rails.logger.info "[#{post.author}/#{post.permlink}] - Not in the last blog entry.  Fetching latest ..."
          end
          
          # Attempt to determine if this post is in the latest blog for
          # this author.  If not, fetch the latest version because it
          # might be a non-standard edit.
          
          # If it's a non-standard edit, likely someone is using a tool
          # to update an old post, perhaps to add/update metadata like a
          # canonical url.  But this looks identical to a new post, from
          # the stream's perspective.
          
          post.fetch_latest
          post.save
        else
          Rails.logger.info "[#{post.author}/#{post.permlink}] - New post."
        end
        
        if post.persisted?
          tags = [comment[:parent_permlink]] + ([post.metadata.fetch('tags')].flatten rescue [])
          tags = tags.map(&:downcase) rescue [] # Deals with malformed tags.
          
          tags.uniq.first(MAX_TAGS).each do |tag|
            next if tag.size > 32
            
            post.tags.find_or_create_by(tag: tag, category: tag == comment[:parent_permlink])
          end
        else
          Rails.logger.error post.errors.messages
        end
      end
    end
  end
  
  def process_delete_comments(delete_comments, timestamp)
    delete_comments.each do |delete_comment|
      delete_comment = delete_comment.with_indifferent_access
      count = Post.where(delete_comment.slice(:author, :permlink)).update_all(deleted_at: timestamp)
      
      if count > 0
        Rails.logger.info "[#{delete_comment[:author]}] - Deleted post."
        
        PostCleanupJob.perform_later
      end
    end
  end
  
  def process_follow_updates(follow_updates)
    follow_updates.each do |follow_update|
      what = [follow_update['what']].flatten.map(&:to_s)
      account = Account.find_by(name: follow_update['follower'])
      
      AccountRefreshJob.perform_later(account.to_param) if account && what.include?('ignore')

      if (what & %w(blacklist unblacklist reset_blacklist follow_blacklist unfollow_blacklist reset_follow_blacklist)).any?
        PostIndexJob.clear_blacklist_cache!
        PostCleanupJob.perform_later
      end
    end
  end
  
  def blacklist(reload = false)
    @blacklist = @blacklist_reasons_by_account = nil if reload
    PostIndexJob.clear_blacklist_cache! if reload
    return @blacklist if @blacklist

    @blacklist = blacklist_reasons_by_account.keys
  end

  def blacklist_reasons_by_account(reload = false)
    @blacklist_refresh_failed = false if reload
    @blacklist = @blacklist_reasons_by_account = nil if reload
    PostIndexJob.clear_blacklist_cache! if reload
    return @blacklist_reasons_by_account if @blacklist_reasons_by_account

    if (cached_reasons = PostIndexJob.cached_blacklist_reasons_by_account)
      @blacklist_reasons_by_account = cached_reasons
      return @blacklist_reasons_by_account
    end

    reasons = Hash.new { |hash, key| hash[key] = [] }
    successful_fetches = 0

    blacklist_source_accounts.each do |source_account|
      blacklisted_accounts = bridge_follow_list_accounts_for(source_account, 'blacklisted')
      next if blacklisted_accounts.nil?

      successful_fetches += 1
      blacklisted_accounts.each do |account|
        account = account.to_s.downcase
        next if account.blank?

        reason = {'account' => source_account}
        reasons[account] << reason unless reasons[account].include?(reason)
      end
    end

    if hivewatchers_blacklist_enabled?
      hivewatchers_accounts = hivewatchers_blacklist_accounts
      if hivewatchers_accounts.nil?
        @blacklist_refresh_failed = true
      else
        successful_fetches += 1
        hivewatchers_accounts.each do |account|
          account = account.to_s.downcase
          next if account.blank?

          reason = {'account' => HIVEWATCHERS_SOURCE}
          reasons[account] << reason unless reasons[account].include?(reason)
        end
      end
    end

    if successful_fetches.zero?
      stale_reasons = PostIndexJob.cached_blacklist_reasons_by_account(include_expired: true)
      return @blacklist_reasons_by_account = stale_reasons if stale_reasons

      @blacklist_refresh_failed = blacklist_source_accounts.any?
      return @blacklist_reasons_by_account = {}
    end

    @blacklist_reasons_by_account = reasons.transform_values { |account_reasons| account_reasons.sort_by { |reason| reason.fetch('account') } }
    PostIndexJob.cache_blacklist_reasons_by_account(@blacklist_reasons_by_account)
    @blacklist_reasons_by_account
  end

  def blacklist_refresh_failed?
    !!@blacklist_refresh_failed
  end

  def blacklist_reasons_for(author)
    blacklist_reasons_by_account[author.to_s.downcase] || []
  end

  def author_reputations_for(authors)
    HiveReputation.scores_for_indexing(authors, api: PostIndexJob::api)
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
    Rails.logger.warn "Unable to refresh blacklist source accounts: #{e.class}: #{e.message}"
    []
  end

  def hivewatchers_blacklist_enabled?
    Account.where("settings->>? IN ('true', '1')", Account::HIVEWATCHERS_BLACKLIST_SETTING).exists?
  end

  def hivewatchers_blacklist_accounts
    body = URI.open(HIVEWATCHERS_BLACKLIST_URL, &:read)
    parse_hivewatchers_blacklist(body)
  rescue => e
    Rails.logger.warn "Unable to refresh Hivewatchers blacklist from #{HIVEWATCHERS_BLACKLIST_URL}: #{e.class}: #{e.message}"
    nil
  end

  def parse_hivewatchers_blacklist(body)
    body.lines.map do |line|
      line.to_s.strip.downcase.split(/\s+/).first.to_s.delete_prefix('@')
    end.reject(&:blank?).reject { |account| account.start_with?('#') }.uniq
  end

  def following_accounts_for(account, type)
    accounts = []
    last = ''

    loop do
      page = get_following_with_retry(account, last, type) || []
      break if page.empty?

      accounts += page.map { |follow| follow.respond_to?(:following) ? follow.following : follow['following'] || follow[:following] }.map(&:to_s)

      next_last = accounts.last.to_s
      break if page.size < 1000 || next_last.blank? || next_last == last

      last = next_last
    end

    accounts.map(&:downcase).reject(&:blank?).uniq
  rescue => e
    Rails.logger.warn "Unable to refresh #{type} follows for #{account}: #{e.class}: #{e.message}"
    nil
  end

  def bridge_follow_list_accounts_for(account, type)
    response = get_bridge_follow_list_with_retry(account, type)
    Array(response).map { |follow| follow.respond_to?(:name) ? follow.name : follow['name'] || follow[:name] }.
      map(&:to_s).
      map(&:downcase).
      reject(&:blank?).
      uniq
  rescue => e
    Rails.logger.warn "Unable to refresh #{type} follow list for #{account}: #{e.class}: #{e.message}"
    nil
  end

  def get_bridge_follow_list_with_retry(account, type)
    attempts = 0

    begin
      response = PostIndexJob::api.rpc_client.rpc_execute(:bridge, :get_follow_list, {observer: account, follow_type: type})
      raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

      response.result
    rescue => e
      raise e unless rate_limited_error?(e) && attempts < BLACKLIST_RETRY_DELAYS.size

      delay = BLACKLIST_RETRY_DELAYS[attempts]
      attempts += 1
      Rails.logger.warn "Rate limited refreshing #{type} follow list for #{account}; retrying in #{delay}s"
      sleep delay
      PostIndexJob::api_reset
      retry
    end
  end

  def get_following_with_retry(account, last, type)
    attempts = 0

    begin
      response = PostIndexJob::api.rpc_client.rpc_execute(:condenser_api, :get_following, [account, last, type, 1000])
      raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

      response.result
    rescue => e
      raise e unless rate_limited_error?(e) && attempts < BLACKLIST_RETRY_DELAYS.size

      delay = BLACKLIST_RETRY_DELAYS[attempts]
      attempts += 1
      Rails.logger.warn "Rate limited refreshing #{type} follows for #{account}; retrying in #{delay}s"
      sleep delay
      PostIndexJob::api_reset
      retry
    end
  end

  def rate_limited_error?(error)
    error.to_s.include?('429') || error.to_s.include?('Too Many Requests')
  end
  memoize :blacklist
end
