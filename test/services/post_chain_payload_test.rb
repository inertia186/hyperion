require 'test_helper'
require_relative '../support/vote_api'

class PostChainPayloadTest < ActiveSupport::TestCase
  test 'looks up signed vote weights for only the authenticated account' do
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
