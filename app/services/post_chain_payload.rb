require 'timeout'

class PostChainPayload
  CACHE_TTL = 2.minutes
  TIMEOUT = ENV.fetch('CHAIN_STATS_TIMEOUT', 3).to_f
  ACTIVE_VOTES_LIMIT = 1_000

  def initialize(account:, api: nil, cache: Rails.cache, timeout: TIMEOUT)
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
      current_vote: vote_percent(votes)
    }
  end

  def current_votes(identities)
    votes = {}
    return votes if identities.empty?

    Timeout.timeout(timeout) do
      client = api.rpc_client
      identities.uniq.each_slice(Hive::RPC::HttpClient::JSON_RPC_BATCH_SIZE_MAXIMUM) do |batch|
        requests = batch.map { |identity| client.put(:condenser_api, :get_active_votes, identity).first }
        identities_by_id = requests.to_h { |request| [request.fetch(:id), request.fetch(:params)] }

        client.rpc_batch_execute(api_name: :condenser_api, request_object: requests) do |result, error, id|
          identity = identities_by_id[id]
          next unless identity && error.blank? && result.is_a?(Array)

          percent = vote_percent(result)
          # A capped list can prove a vote exists, but cannot prove its absence.
          next if percent.nil? && result.size >= ACTIVE_VOTES_LIMIT

          votes[identity] = percent
        end
      end
    end

    votes
  rescue StandardError => e
    Rails.logger.warn "Unable to fetch digest votes: #{e.class}: #{e.message}"
    votes
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
  attr_reader :account, :cache, :timeout

  def api
    @api ||= Account.api
  end

  def vote_percent(votes)
    vote = Array(votes).find { |candidate| chain_value(candidate, :voter) == account.name }
    chain_value(vote, :percent)
  end

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
