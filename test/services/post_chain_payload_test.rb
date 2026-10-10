require 'test_helper'
require_relative '../support/vote_api'

class PostChainPayloadTest < ActiveSupport::TestCase
  test 'looks up signed vote weights from reversed HTTP batch responses for only the authenticated account' do
    identities = %w[up down removed other-voter next-post-only].map { |permlink| ['author', permlink] }
    api = VoteApi.new(
      ['author', 'up', 'fixture-curator'] => 10000,
      ['author', 'down', 'fixture-curator'] => -2500,
      ['author', 'removed', 'fixture-curator'] => 0,
      ['author', 'other-voter', 'someone-else'] => 10000,
      ['author', 'zzz-later-post', 'fixture-curator'] => 5000
    )

    votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(identities)

    assert_equal [10000, -2500, 0, nil, nil], identities.map { |identity| votes.fetch(identity) }
    assert_equal [{start: ['author', 'up', 'fixture-curator'], limit: 1, order: 'by_comment_voter'}], api.batches.first.first(1).map { |request| request[:params] }
  end

  test 'does not treat unknown duplicate missing failed or malformed responses as absent votes' do
    identities = %w[known duplicate missing failed null-result empty-error null-error].map { |permlink| ['author', permlink] }
    vote = ->(permlink, percent) { {votes: [{author: 'author', permlink: permlink, voter: 'fixture-curator', vote_percent: percent}]} }
    api = VoteApi.new
    http_response = lambda do |request|
      ids = JSON.parse(request.body).map { |entry| entry['id'] }
      responses = [
        {id: ids[0], result: vote.('known', 4200)},
        {id: ids[1], result: {votes: []}},
        {id: ids[1], result: vote.('duplicate', 10000)},
        {id: ids[3], error: {code: -32000, message: 'unavailable'}},
        {id: ids[4], result: nil},
        {id: ids[5], error: {}, result: {votes: []}},
        {id: ids[6], error: nil, result: {votes: []}},
        {id: 'unknown', result: {votes: []}}
      ]
      VoteApi::Response.new('200', responses.reverse.to_json)
    end

    api.stub(:http_request, http_response) do
      votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(identities)
      assert_equal({identities.first => 4200}, votes)
    end
  end

  test 'keeps vote status unknown for HTTP failures, invalid JSON, or a whole-batch error' do
    api = VoteApi.new
    service = PostChainPayload.new(account: accounts(:curated), api: api)
    responses = [
      VoteApi::Response.new('503', '[]'),
      VoteApi::Response.new('200', '<html>unavailable</html>'),
      VoteApi::Response.new('200', {jsonrpc: '2.0', id: nil, error: {code: -32600, message: 'Invalid Request'}}.to_json)
    ]

    responses.each do |response|
      api.stub(:http_request, response) do
        assert_equal({}, service.current_votes([['author', 'post']]))
      end
    end
  end

  test 'malformed vote entries remain unknown while an empty list confirms no vote' do
    matching = {author: 'author', voter: 'fixture-curator'}
    results = {
      'array-result' => [],
      'missing-votes' => {},
      'string-votes' => {votes: 'none'},
      'null-vote' => {votes: [nil]},
      'string-vote' => {votes: ['vote']},
      'string-percent' => {votes: [matching.merge(permlink: 'string-percent', vote_percent: '10000')]},
      'null-percent' => {votes: [matching.merge(permlink: 'null-percent', vote_percent: nil)]},
      'empty' => {votes: []}
    }
    api = VoteApi.new
    http_response = lambda do |request|
      responses = JSON.parse(request.body).map { |entry| {id: entry['id'], result: results.fetch(entry.dig('params', 'start', 1))} }
      VoteApi::Response.new('200', responses.to_json)
    end

    api.stub(:http_request, http_response) do
      votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(results.keys.map { |permlink| ['author', permlink] })
      assert_equal({['author', 'empty'] => nil}, votes)
    end
  end

  test 'deduplicates identities and splits requests at the client batch limit' do
    identities = 51.times.map { |index| ['author', "post-#{index}"] }
    api = VoteApi.new

    votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(identities + identities)

    assert_equal [50, 1], api.batches.map(&:size)
    assert_equal identities, votes.keys.sort_by { |identity| identity.last.delete_prefix('post-').to_i }
    assert_equal identities, api.batches.flatten.map { |request| request.dig(:params, :start).first(2) }
  end

  test 'bounds the entire lookup and preserves completed batches on timeout' do
    identities = 51.times.map { |index| ['author', "post-#{index}"] }
    api = VoteApi.new do
      sleep 2 if api.batches.size == 2
    end

    votes = PostChainPayload.new(account: accounts(:curated), api: api, timeout: 0.5).current_votes(identities)

    assert_equal 50, votes.size
    assert_not votes.key?(identities.last)
  end

  test 'returns unknown votes on an RPC failure and does not call Hive for an empty digest' do
    api = VoteApi.new { raise Hive::UnknownError, 'node unavailable' }
    service = PostChainPayload.new(account: accounts(:curated), api: api)

    assert_equal({}, service.current_votes([]))
    assert_empty api.batches
    assert_equal({}, service.current_votes([['author', 'post']]))
  end

  test 'retries a failed vote batch on another node through account failover' do
    failing = VoteApi.new { raise Hive::UnknownError, 'node unavailable' }
    working = VoteApi.new(['author', 'post', 'fixture-curator'] => 7500)
    clients = [failing, working]
    failures = 0

    Account.stub(:api, -> { clients.first }) do
      Account.stub(:record_hive_node_failure, -> { failures += 1 }) do
        Account.stub(:api_reset, -> { clients.shift }) do
          votes = PostChainPayload.new(account: accounts(:curated)).current_votes([['author', 'post']])
          assert_equal({['author', 'post'] => 7500}, votes)
        end
      end
    end

    assert_equal 1, failures
    assert_equal [1, 1], [failing.batches.size, working.batches.size]
  end
end
