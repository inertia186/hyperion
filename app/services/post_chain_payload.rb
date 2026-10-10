require 'timeout'

class PostChainPayload
  CACHE_TTL = 2.minutes
  TIMEOUT = ENV.fetch('CHAIN_STATS_TIMEOUT', 3).to_f
  VOTE_BATCH_SIZE = Hive::RPC::HttpClient::JSON_RPC_BATCH_SIZE_MAXIMUM

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
    identities = identities.uniq
    return votes if identities.empty?

    Timeout.timeout(timeout) do
      identities.each_slice(VOTE_BATCH_SIZE) do |batch|
        responses = vote_batch_responses(batch)

        batch.each_with_index do |identity, id|
          entries = responses[id]
          next unless entries&.one? && !entries.first.key?('error')

          result = entries.first['result']
          next unless result.is_a?(Hash) && result['votes'].is_a?(Array)

          # by_comment_voter returns the next vote in index order when this voter has none.
          vote = result['votes'].first
          if result['votes'].empty? || (vote.is_a?(Hash) && vote.values_at('author', 'permlink', 'voter') != [*identity, account.name])
            votes[identity] = nil
          elsif vote.is_a?(Hash) && vote['vote_percent'].is_a?(Integer)
            votes[identity] = vote['vote_percent']
          end
        end
      end
    end

    # Single posts fail routinely (e.g. deleted on chain); warn only when none resolved.
    unresolved = identities.size - votes.size
    if unresolved.positive?
      Rails.logger.public_send(votes.empty? ? :warn : :debug, "Digest vote lookup left #{unresolved} of #{identities.size} posts unavailable")
    end
    votes
  rescue StandardError => e
    # Same policy as Api::V1::PostsController#expected_chain_fetch_error?.
    expected = e.is_a?(Timeout::Error) || e.is_a?(Hive::ArgumentError)
    Rails.logger.public_send(expected ? :debug : :warn, "Unable to fetch digest votes: #{e.class}: #{e.message}")
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

  # Not memoized: Account resets its client when failover moves to another node.
  def api
    @api || Account.api
  end

  def vote_percent(votes)
    vote = Array(votes).find { |candidate| chain_value(candidate, :voter) == account.name }
    chain_value(vote, :percent)
  end

  # Returns batch responses grouped by request id (the identity's index in batch).
  def vote_batch_responses(batch)
    requests = batch.each_with_index.map do |(author, permlink), id|
      {jsonrpc: '2.0', id: id, method: 'database_api.list_votes', params: {start: [author, permlink, account.name], limit: 1, order: 'by_comment_voter'}}
    end
    return post_vote_batch(@api.rpc_client, requests) if @api

    Account.with_simple_failover { post_vote_batch(Account.api.rpc_client, requests) }
  end

  def post_vote_batch(client, requests)
    # hive-ruby 1.0.6 validates batch IDs by position; JSON-RPC permits any order.
    request = client.http_post(:database_api)
    request.body = requests.to_json
    response = client.http_request(request)
    raise Hive::UnknownError, "Vote batch returned HTTP #{response.code}" unless response.code == '200'

    results = JSON.parse(response.body)
    # A whole-batch failure is a single error object; raise so failover tries another node.
    raise Hive::UnknownError, "Vote batch failed: #{response.body.truncate(200)}" unless results.is_a?(Array)

    results.grep(Hash).group_by { |result| result['id'] }
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
