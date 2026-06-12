require 'timeout'

class PostChainPayload
  CACHE_TTL = 2.minutes
  TIMEOUT = ENV.fetch('CHAIN_STATS_TIMEOUT', 3).to_f

  def initialize(account:, api: Account.api, cache: Rails.cache, timeout: TIMEOUT)
    @account = account
    @api = api
    @cache = cache
    @timeout = timeout
  end

  def chain_stats(post, author, permlink, refresh: false)
    payload = cached_chain_stats_payload(author, permlink, refresh: refresh)
    votes = payload.fetch(:votes)
    replies = payload.fetch(:replies)
    content = payload.fetch(:content)
    current_vote = Array(votes).find { |vote| chain_value(vote, :voter) == account.name }
    payout = payout_value(content)
    persist_payout(post, payout)

    {
      status: 'ready',
      votes: Array(votes).count { |vote| chain_value(vote, :percent).to_i > 0 },
      replies: Array(replies).size,
      payout: payout,
      payout_amount: post.payout_amount&.to_s,
      payout_currency: post.payout_currency,
      payout_fetched_at: post.payout_fetched_at&.iso8601,
      payout_source: post.payout_source,
      current_vote: chain_value(current_vote, :percent)
    }
  end

  def payout(post, author, permlink)
    content = cached_payout_content(author, permlink)
    payout = payout_value(content)
    persist_payout(post, payout)

    {
      status: content.present? ? 'ready' : 'unavailable',
      payout: payout,
      payout_amount: post.payout_amount&.to_s,
      payout_currency: post.payout_currency,
      payout_fetched_at: post.payout_fetched_at&.iso8601,
      payout_source: post.payout_source
    }
  end

private
  attr_reader :account, :api, :cache, :timeout

  def cached_chain_stats_payload(author, permlink, refresh:)
    cache_key = ['chain-stats', author, permlink]
    if refresh
      payload = fetch_chain_stats_payload(author, permlink)
      cache.write(cache_key, payload, expires_in: CACHE_TTL)
      return payload
    end

    cache.fetch(cache_key, expires_in: CACHE_TTL, race_condition_ttl: 10.seconds) do
      fetch_chain_stats_payload(author, permlink)
    end
  end

  def fetch_chain_stats_payload(author, permlink)
    Timeout.timeout(timeout) do
      {
        votes: condenser_rpc(:get_active_votes, [author, permlink]),
        replies: condenser_rpc(:get_content_replies, [author, permlink]),
        content: condenser_rpc(:get_content, [author, permlink])
      }
    end
  end

  def cached_payout_content(author, permlink)
    cache.fetch(['post-payout', author, permlink], expires_in: CACHE_TTL, race_condition_ttl: 10.seconds) do
      Timeout.timeout(timeout) do
        condenser_rpc(:get_content, [author, permlink])
      end
    end
  end

  def condenser_rpc(method, args)
    response = api.rpc_client.rpc_execute(:condenser_api, method, args)
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

  def persist_payout(post, payout)
    post.capture_payout!(payout) if payout.present?
  end

  def chain_value(object, key)
    return nil unless object

    if object.respond_to?(key)
      object.public_send(key)
    elsif object.respond_to?(:[])
      object[key.to_s] || object[key.to_sym]
    end
  end
end
