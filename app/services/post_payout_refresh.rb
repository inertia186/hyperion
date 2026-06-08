class PostPayoutRefresh
  DEFAULT_WINDOW = 7.days
  DEFAULT_LIMIT = 100

  Result = Struct.new(:checked, :updated, :unavailable, :failed, :errors, keyword_init: true)

  def initialize(window: DEFAULT_WINDOW, limit: DEFAULT_LIMIT, api: Account.api, logger: Rails.logger)
    @window = window
    @limit = [limit.to_i, 1].max
    @api = api
    @logger = logger
  end

  def call
    result = Result.new(checked: 0, updated: 0, unavailable: 0, failed: 0, errors: [])

    posts.each do |post|
      result.checked += 1
      payout = payout_for(post)

      if payout.present?
        post.capture_payout!(payout)
        result.updated += 1
      else
        post.mark_payout_unavailable!
        result.unavailable += 1
      end
    rescue => e
      if expected_fetch_error?(e)
        post.mark_payout_unavailable! if terminal_payout_unavailable_error?(e)
        result.unavailable += 1
      else
        result.failed += 1
        result.errors << {id: post.id, author: post.author, permlink: post.permlink, error: "#{e.class}: #{e.message}"}
      end
      log_fetch_error(post, e)
    end

    result
  end

private
  attr_reader :window, :limit, :api, :logger

  def posts
    Post.
      where('posts.created_at >= ?', window.ago).
      where(payout_unavailable_at: nil).
      order(Arel.sql('payout_fetched_at ASC NULLS FIRST'), created_at: :desc).
      limit(limit)
  end

  def payout_for(post)
    content = condenser_content(post.author, post.permlink)
    payout_value(content)
  end

  def condenser_content(author, permlink)
    response = api.rpc_client.rpc_execute(:condenser_api, :get_content, [author, permlink])
    raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

    response.result
  end

  def payout_value(content)
    return nil unless content

    if chain_value(content, :cashout_time).to_s == '1969-12-31T23:59:59'
      chain_value(content, :total_payout_value)
    else
      chain_value(content, :pending_payout_value)
    end
  end

  def chain_value(object, key)
    return nil unless object

    if object.respond_to?(key)
      object.public_send(key)
    elsif object.respond_to?(:[])
      object[key.to_s] || object[key.to_sym]
    end
  end

  def log_fetch_error(post, error)
    message = "Unable to refresh payout for post #{post.id} #{post.author}/#{post.permlink}: #{error.class}: #{error.message}"

    if expected_fetch_error?(error)
      logger.debug message
    else
      logger.warn message
    end
  end

  def expected_fetch_error?(error)
    error.is_a?(Timeout::Error) ||
      (defined?(Hive::ArgumentError) && error.is_a?(Hive::ArgumentError))
  end

  def terminal_payout_unavailable_error?(error)
    defined?(Hive::ArgumentError) && error.is_a?(Hive::ArgumentError)
  end
end
