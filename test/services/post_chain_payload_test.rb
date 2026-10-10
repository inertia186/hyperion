require 'test_helper'
require_relative '../support/vote_api'

class PostChainPayloadTest < ActiveSupport::TestCase
  test 'looks up signed vote weights from reversed HTTP batch responses for only the authenticated account' do
    identities = %w[up down removed absent].map { |permlink| ['author', permlink] }
    api = VoteApi.new(
      identities[0] => [{'voter' => 'fixture-curator', 'percent' => 10000}],
      identities[1] => [{voter: 'fixture-curator', percent: -2500}],
      identities[2] => [{voter: 'fixture-curator', percent: 0}],
      identities[3] => [{voter: 'someone-else', percent: 10000}]
    )

    votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(identities)

    assert_equal [10000, -2500, 0, nil], identities.map { |identity| votes.fetch(identity) }
  end

  test 'does not treat unknown duplicate missing failed or malformed responses as absent votes' do
    identities = %w[known duplicate missing failed malformed empty-error null-error].map { |permlink| ['author', permlink] }
    api = VoteApi.new
    http_response = lambda do |request|
      requests = JSON.parse(request.body)
      responses = [
        {id: requests[0]['id'], result: [{voter: 'fixture-curator', percent: 4200}]},
        {id: requests[1]['id'], result: []},
        {id: requests[1]['id'], result: [{voter: 'fixture-curator', percent: 10000}]},
        {id: requests[3]['id'], error: {code: -32000, message: 'unavailable'}},
        {id: requests[4]['id'], result: nil},
        {id: requests[5]['id'], error: {}, result: []},
        {id: requests[6]['id'], error: nil, result: []},
        {id: 'unknown', result: []}
      ]
      VoteApi::Response.new('200', responses.reverse.to_json)
    end

    api.stub(:http_request, http_response) do
      votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(identities)
      assert_equal({identities.first => 4200}, votes)
    end
  end

  test 'keeps vote status unknown for HTTP failures or invalid JSON' do
    api = VoteApi.new
    service = PostChainPayload.new(account: accounts(:curated), api: api)

    [VoteApi::Response.new('503', '[]'), VoteApi::Response.new('200', '<html>unavailable</html>')].each do |response|
      api.stub(:http_request, response) do
        assert_equal({}, service.current_votes([['author', 'post']]))
      end
    end
  end

  test 'malformed vote entries remain unknown while an empty list confirms no vote' do
    malformed = [
      nil,
      {},
      {voter: 'fixture-curator'},
      {voter: '', percent: 10000},
      {voter: 123, percent: 10000},
      {voter: 'fixture-curator', percent: '10000'},
      {voter: 'fixture-curator', percent: 10000.0},
      {voter: 'fixture-curator', percent: false},
      {voter: 'fixture-curator', percent: 10001},
      {voter: 'fixture-curator', percent: -10001},
      {voter: 'another-account', percent: nil}
    ]
    results = malformed.each_with_index.to_h { |vote, index| [['author', "malformed-#{index}"], [vote]] }
    empty_identity = ['author', 'empty']
    results[empty_identity] = []

    votes = PostChainPayload.new(account: accounts(:curated), api: VoteApi.new(results)).current_votes(results.keys)

    assert_equal({empty_identity => nil}, votes)
  end

  test 'deduplicates identities and splits requests at the client batch limit' do
    identities = 51.times.map { |index| ['author', "post-#{index}"] }
    api = VoteApi.new

    votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(identities + identities)

    assert_equal [50, 1], api.batches.map(&:size)
    assert_equal identities, votes.keys.sort_by { |identity| identity.last.delete_prefix('post-').to_i }
    assert_equal identities, api.batches.flatten.map { |request| request.fetch(:params) }
  end

  test 'does not turn a capped or malformed vote response into an unvoted result' do
    capped_votes = 1000.times.map { |index| {voter: "voter-#{index}", percent: 10000} }
    identities = %w[capped found malformed].map { |permlink| ['author', permlink] }
    api = VoteApi.new(
      identities[0] => capped_votes,
      identities[1] => capped_votes.drop(1) + [{voter: 'fixture-curator', percent: 4200}],
      identities[2] => nil
    )

    votes = PostChainPayload.new(account: accounts(:curated), api: api).current_votes(identities)

    assert_equal({identities[1] => 4200}, votes)
  end

  test 'bounds the entire lookup and preserves completed batches on timeout' do
    identities = 51.times.map { |index| ['author', "post-#{index}"] }
    api = VoteApi.new do
      sleep 1 if api.batches.size == 2
    end

    votes = PostChainPayload.new(account: accounts(:curated), api: api, timeout: 0.05).current_votes(identities)

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
end
