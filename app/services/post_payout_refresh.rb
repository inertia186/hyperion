class PostPayoutRefresh
  DEFAULT_WINDOW = 7.days
  DEFAULT_LIMIT = 100
  PENDING_PAYOUT_COMMENT_LIMIT = 1_000
  PENDING_PAYOUT_PAYLOAD_LIMIT = 80_000
  HBD_NAI = '@@000000013'
  HIVE_NAI = '@@000000021'

  Result = Struct.new(:checked, :updated, :unavailable, :failed, :errors, keyword_init: true)

  def initialize(window: DEFAULT_WINDOW, limit: DEFAULT_LIMIT, api: Account.api, logger: Rails.logger, pending_payout_comment_limit: PENDING_PAYOUT_COMMENT_LIMIT, pending_payout_payload_limit: PENDING_PAYOUT_PAYLOAD_LIMIT)
    @window = window
    @limit = [limit.to_i, 1].max
    @api = api
    @logger = logger
    @pending_payout_comment_limit = pending_payout_comment_limit
    @pending_payout_payload_limit = pending_payout_payload_limit
  end

  def call
    result = Result.new(checked: 0, updated: 0, unavailable: 0, failed: 0, errors: [])
    selected_posts = posts.to_a
    result.checked = selected_posts.size
    return result if selected_posts.empty?

    context = nil

    pending_payout_batches(selected_posts).each do |batch|
      begin
        pending_payouts = pending_payouts_for(batch)
        context ||= payout_context
        batch.each do |post|
          refresh_post(post, pending_payouts, context, result)
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
      rescue => e
        if expected_fetch_error?(e)
          result.unavailable += batch.size
        else
          result.failed += batch.size
          batch.each do |post|
            result.errors << {id: post.id, author: post.author, permlink: post.permlink, error: "#{e.class}: #{e.message}"}
          end
        end
        log_batch_fetch_error(e)
      end
    end

    result
  rescue => e
    failed_posts = selected_posts || []
    result.failed += failed_posts.size
    failed_posts.each do |post|
      result.errors << {id: post.id, author: post.author, permlink: post.permlink, error: "#{e.class}: #{e.message}"}
    end
    result.errors << {error: "#{e.class}: #{e.message}"} if failed_posts.empty?
    log_batch_fetch_error(e)
    result
  end

private
  attr_reader :window, :limit, :api, :logger, :pending_payout_comment_limit, :pending_payout_payload_limit

  def posts
    Post.
      where('posts.created_at >= ?', window.ago).
      where(payout_unavailable_at: nil).
      order(Arel.sql('payout_fetched_at ASC NULLS FIRST'), created_at: :desc).
      limit(limit)
  end

  def pending_payout_batches(posts)
    posts.each_with_object([]) do |post, batches|
      current_batch = batches.last
      if current_batch.blank? ||
          current_batch.size >= pending_payout_comment_limit ||
          pending_payout_payload_size(current_batch + [post]) > pending_payout_payload_limit
        batches << [post]
      else
        current_batch << post
      end
    end
  end

  def pending_payout_payload_size(posts)
    JSON.generate(comments: posts.map { |post| [post.author, post.permlink] }).bytesize
  end

  def refresh_post(post, pending_payouts, payout_context, result)
    cashout_info = pending_payouts[post_key(post)]
    unless cashout_info
      post.mark_payout_unavailable!
      result.unavailable += 1
      return
    end

    payout = estimated_payout(cashout_info, payout_context)

    if payout.present?
      post.capture_payout!(payout, source: 'estimated')
      result.updated += 1
    else
      post.mark_payout_unavailable!
      result.unavailable += 1
    end
  end

  def pending_payouts_for(posts)
    comments = posts.map { |post| [post.author, post.permlink] }
    response = api.rpc_client.rpc_execute(:database_api, :get_comment_pending_payouts, {comments: comments})
    raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

    cashout_infos = chain_value(response.result, :cashout_infos)
    Array(cashout_infos).each_with_object({}) do |cashout_info, map|
      author = chain_value(cashout_info, :author)
      permlink = chain_value(cashout_info, :permlink)
      next if author.blank? || permlink.blank?
      next unless chain_value(cashout_info, :cashout_info).present?

      map[[author, permlink]] = chain_value(cashout_info, :cashout_info)
    end
  end

  def post_key(post)
    [post.author, post.permlink]
  end

  def payout_context
    reward_fund = post_reward_fund
    price_feed = current_price_feed

    {
      recent_claims: BigDecimal(chain_value(reward_fund, :recent_claims).to_s),
      reward_balance_hive: asset_amount(chain_value(reward_fund, :reward_balance), expected_nai: HIVE_NAI),
      hbd_per_hive: price_ratio(price_feed)
    }
  end

  def post_reward_fund
    response = api.rpc_client.rpc_execute(:database_api, :get_reward_funds, {})
    raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

    Array(chain_value(response.result, :funds)).find { |fund| chain_value(fund, :name).to_s == 'post' } ||
      raise(Hive::UnknownError, 'post reward fund not found')
  end

  def current_price_feed
    response = api.rpc_client.rpc_execute(:database_api, :get_current_price_feed, {})
    raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

    response.result
  end

  def estimated_payout(cashout_info, context)
    recent_claims = context.fetch(:recent_claims)
    return nil if recent_claims <= 0

    net_rshares = [BigDecimal(chain_value(cashout_info, :net_rshares).to_s), BigDecimal('0')].max
    reward_weight = BigDecimal(chain_value(cashout_info, :reward_weight).presence || '10000') / 10_000
    estimate = net_rshares / recent_claims * context.fetch(:reward_balance_hive) * context.fetch(:hbd_per_hive) * reward_weight
    max_payout = asset_amount(chain_value(cashout_info, :max_accepted_payout), expected_nai: HBD_NAI)
    estimate = [estimate, max_payout].min if max_payout
    estimate = [estimate, BigDecimal('0')].max.round(3)

    format('%.3f HBD', estimate)
  end

  def asset_amount(asset, expected_nai: nil)
    return nil unless asset

    if asset.respond_to?(:[])
      nai = asset['nai'] || asset[:nai]
      return nil if expected_nai && nai.present? && nai != expected_nai
      amount = asset['amount'] || asset[:amount]
      precision = asset['precision'] || asset[:precision] || 3
      BigDecimal(amount.to_s) / (10 ** precision.to_i)
    else
      match = asset.to_s.match(/\A(?<amount>-?\d+(?:\.\d+)?)\s+(?<currency>[A-Z]+)\z/)
      return nil unless match
      return nil if expected_nai == HBD_NAI && match[:currency] != 'HBD'
      return nil if expected_nai == HIVE_NAI && match[:currency] != 'HIVE'

      BigDecimal(match[:amount])
    end
  end

  def price_ratio(feed)
    base = chain_value(feed, :base)
    quote = chain_value(feed, :quote)
    base_amount = asset_amount(base, expected_nai: HBD_NAI)
    quote_amount = asset_amount(quote, expected_nai: HIVE_NAI)
    return nil unless base_amount && quote_amount&.positive?

    base_amount / quote_amount
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

  def log_batch_fetch_error(error)
    message = "Unable to preflight payout refresh batch: #{error.class}: #{error.message}"

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
