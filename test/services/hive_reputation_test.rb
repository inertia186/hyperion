require 'test_helper'

class HiveReputationTest < ActiveSupport::TestCase
  test 'formats raw reputation like condenser' do
    assert_equal 25, HiveReputation.score(nil)
    assert_equal 25, HiveReputation.score('0')
    assert_equal 25, HiveReputation.score('999999999')
    assert_equal 34, HiveReputation.score('10000000000')
    assert_equal 52, HiveReputation.score('1000000000000')
    assert_equal 15, HiveReputation.score('-10000000000')
  end

  test 'fetches scores keyed by lowercase author' do
    api = FakeApi.new([
      Struct.new(:account, :reputation).new('alice', '10000000000')
    ])

    scores = HiveReputation.scores_for(%w(alice bob), api: api)

    assert_equal 34, scores.fetch('alice')
    assert_equal 25, scores.fetch('bob')
    assert_equal [%w(alice bob)], api.batches
  end

  test 'returns default scores when account lookup fails' do
    api = FailingApi.new

    scores = HiveReputation.scores_for(%w(alice bob), api: api)

    assert_equal({'alice' => 25, 'bob' => 25}, scores)
    assert_equal 1, api.calls
  end

  test 'fetches scores in batches' do
    authors = (1..1001).map { |index| "author-#{index}" }
    api = FakeApi.new(
      authors.map { |author| Struct.new(:account, :reputation).new(author, '10000000000') }
    )

    scores = HiveReputation.scores_for(authors, api: api)

    assert_equal 2, api.calls
    assert_equal [1000, 1], api.batches.map(&:size)
    assert_equal 34, scores.fetch('author-1')
    assert_equal 34, scores.fetch('author-1001')
  end

  test 'scores for indexing reuse stored non-default reputations' do
    Post.create!(
      author: 'KnownAuthor',
      permlink: 'known-reputation',
      title: 'Known reputation',
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 1,
      trx_id: 'known-reputation',
      author_reputation: 72,
      created_at: Time.current
    )

    fetched_authors = nil
    HiveReputation.stub(:scores_for, ->(authors, api:, fallback_on_error:) {
      fetched_authors = authors
      {'missingauthor' => 34}
    }) do
      scores = HiveReputation.scores_for_indexing(%w(KnownAuthor MissingAuthor))

      assert_equal 72, scores.fetch('knownauthor')
      assert_equal 34, scores.fetch('missingauthor')
    end

    assert_equal ['missingauthor'], fetched_authors
  end

  test 'scores for indexing refresh stale low reputations' do
    AuthorReputation.create!(
      account: 'lowauthor',
      reputation: 18,
      refreshed_at: 13.hours.ago
    )

    fetched_authors = nil
    HiveReputation.stub(:scores_for, ->(authors, api:, fallback_on_error:) {
      fetched_authors = authors
      {'lowauthor' => 20}
    }) do
      scores = HiveReputation.scores_for_indexing(%w(lowauthor))

      assert_equal 20, scores.fetch('lowauthor')
    end

    assert_equal ['lowauthor'], fetched_authors
    assert_equal 20, AuthorReputation.find_by!(account: 'lowauthor').reputation
  end

  test 'scores for indexing keeps fresh high reputations longer' do
    AuthorReputation.create!(
      account: 'highauthor',
      reputation: 72,
      refreshed_at: 6.days.ago
    )

    HiveReputation.stub(:scores_for, ->(*) { flunk 'unexpected reputation lookup' }) do
      scores = HiveReputation.scores_for_indexing(%w(highauthor))

      assert_equal 72, scores.fetch('highauthor')
    end
  end

  test 'reputation refresh window grows with reputation' do
    assert_equal 12.hours, HiveReputation.refresh_window_for(10)
    assert_equal 1.day, HiveReputation.refresh_window_for(25)
    assert_equal 3.days, HiveReputation.refresh_window_for(40)
    assert_equal 1.week, HiveReputation.refresh_window_for(55)
    assert_equal 1.month, HiveReputation.refresh_window_for(70)
  end

private
  class FakeApi
    Response = Struct.new(:result)

    def initialize(reputations)
      @reputations = reputations.sort_by(&:account)
      @calls = 0
      @batches = []
    end

    attr_reader :calls, :batches

    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_accounts

      accounts = args.first
      @calls += 1
      @batches << accounts
      Response.new(@reputations.select { |account| accounts.include?(account.account) })
    end
  end

  class FailingApi
    attr_reader :calls

    def initialize
      @calls = 0
    end

    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      @calls += 1
      raise Hive::UnknownError, 'boom'
    end
  end
end
