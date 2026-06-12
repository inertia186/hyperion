require 'test_helper'

class PostBlacklistTest < ActiveSupport::TestCase
  test 'collects reasons from account and followed blacklist sources' do
    api = FakeApi.new(
      ['fixture-curator', 'follow_blacklist'] => [follow('hive.blog')],
      ['fixture-curator', 'blacklisted'] => [follow('alice')],
      ['hive.blog', 'blacklisted'] => [follow('alice'), follow('bob')]
    )
    cache_store = FakeCacheStore.new

    reasons = blacklist(api: api, cache_store: cache_store).blacklist_reasons_by_account

    assert_equal [{'account' => 'fixture-curator'}, {'account' => 'hive.blog'}], reasons.fetch('alice')
    assert_equal [{'account' => 'hive.blog'}], reasons.fetch('bob')
    assert_equal reasons, cache_store.value
  end

  test 'combines hivewatchers accounts when enabled' do
    api = FakeApi.new(
      ['fixture-curator', 'follow_blacklist'] => [],
      ['fixture-curator', 'blacklisted'] => []
    )

    reasons = blacklist(
      api: api,
      hivewatchers_enabled: -> { true },
      hivewatchers_accounts: -> { %w(spammer SPAMMER badactor) }
    ).blacklist_reasons_by_account

    assert_equal [{'account' => 'hivewatchers'}], reasons.fetch('spammer')
    assert_equal [{'account' => 'hivewatchers'}], reasons.fetch('badactor')
  end

  test 'uses stale cache when every configured source fails' do
    api = FakeApi.new(
      ['fixture-curator', 'follow_blacklist'] => [],
      ['fixture-curator', 'blacklisted'] => RuntimeError.new('boom')
    )
    cache_store = FakeCacheStore.new({'cached' => [{'account' => 'fixture-curator'}]}, expires_at: 1.minute.ago)

    assert_equal ['cached'], blacklist(api: api, cache_store: cache_store).blacklist
  end

  test 'retries rate limited bridge requests' do
    api = FakeApi.new(
      ['fixture-curator', 'follow_blacklist'] => [],
      ['fixture-curator', 'blacklisted'] => [
        RuntimeError.new('429 Too Many Requests'),
        [follow('alice')]
      ]
    )
    sleeps = []

    assert_equal ['alice'], blacklist(api: api, sleeper: ->(delay) { sleeps << delay }).blacklist
    assert_equal [2], sleeps
  end

  test 'normalizes hivewatchers feed lines' do
    body = "# comment\n@Spammer\nbadactor extra\n\n"

    assert_equal %w(spammer badactor), blacklist.parse_hivewatchers_blacklist(body)
  end

private
  def blacklist(api: FakeApi.new, cache_store: FakeCacheStore.new, sleeper: ->(_delay) {}, hivewatchers_enabled: -> { false }, hivewatchers_accounts: -> { [] })
    PostBlacklist.new(
      api: api,
      cache_store: cache_store,
      api_reset: -> {},
      sleeper: sleeper,
      logger: Logger.new(nil),
      hivewatchers_enabled: hivewatchers_enabled,
      hivewatchers_accounts: hivewatchers_accounts
    )
  end

  def follow(account)
    Struct.new(:name).new(account)
  end

  class FakeCacheStore
    attr_reader :value

    def initialize(value = nil, expires_at: 1.hour.from_now)
      @value = value
      @expires_at = expires_at
    end

    def cached_blacklist_reasons_by_account(include_expired: false)
      return value if include_expired || (@value && @expires_at > Time.current)

      nil
    end

    def cache_blacklist_reasons_by_account(reasons)
      @value = reasons
      @expires_at = 1.hour.from_now
    end

    def clear_blacklist_cache!
      @value = nil
    end
  end

  class FakeApi
    Response = Struct.new(:result)

    def initialize(responses = {})
      @responses = responses
    end

    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :bridge
      raise "unexpected method: #{method}" unless method == :get_follow_list

      response = @responses.fetch([args.fetch(:observer), args.fetch(:follow_type)], [])
      response = response.shift if response.is_a?(Array) && response.any? { |item| item.is_a?(Exception) || item.is_a?(Array) }
      raise response if response.is_a?(Exception)

      Response.new(response)
    end
  end
end
