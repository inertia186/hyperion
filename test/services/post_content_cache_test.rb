require 'test_helper'

class PostContentCacheTest < ActiveSupport::TestCase
  Response = Struct.new(:result)

  class Api
    attr_accessor :generation, :vote, :delay, :failure
    attr_reader :calls

    def initialize
      @calls = []
      @generation = 1
      @vote = 4200
      @delay = 0
    end

    def rpc_client = self

    def rpc_execute(_api, method, args)
      @calls << [method, args]
      raise Timeout::Error, 'fixed content timeout' if failure == method
      sleep delay if delay.positive?
      value = case method
      when :get_active_votes then [{voter: 'fixture-curator', percent: vote}, {voter: 'other-cache', percent: -1000}]
      when :get_content_replies then []
      when :get_content then {cashout_time: '2026-10-27T12:00:00', pending_payout_value: "#{generation}.000 HBD"}
      else raise "Unexpected method #{method}"
      end
      Response.new(value)
    end
  end

  setup do
    @api = Api.new
    @cache = ActiveSupport::Cache::MemoryStore.new
    @post = posts(:allowed_unread)
  end

  %i(stats_first payout_first).each do |order|
    test "cold #{order} shares content across separate service instances" do
      values = order == :stats_first ? [stats, payout] : [payout, stats]
      assert_equal ['1.000 HBD', '1.000 HBD'], values.pluck(:payout)
      assert_equal 1, content_calls
      assert_equal 3, @api.calls.size
      assert_equal '1.000 HBD', @post.reload.payout
    end
  end

  test 'shared content expires at 120 seconds while warm reads issue no RPCs' do
    freeze_time do
      stats
      payout
      travel 119.seconds
      stats
      payout
      assert_equal 1, content_calls
      @api.generation = 2
      travel 1.second
      assert_equal '2.000 HBD', stats.fetch(:payout)
      assert_equal '2.000 HBD', payout.fetch(:payout)
      assert_equal 2, content_calls
    end
  end

  test 'stats sees content refreshed by payout while votes and replies are still cached' do
    freeze_time do
      payout
      travel 60.seconds
      stats
      @api.generation = 2
      travel 61.seconds
      assert_equal '2.000 HBD', payout.fetch(:payout)
      assert_equal '2.000 HBD', stats.fetch(:payout)
      assert_equal 2, content_calls
      assert_equal 1, @api.calls.count { |method, _| method == :get_active_votes }
    end
  end

  test 'forced stats refresh publishes fresh content to payout and refreshes vote state' do
    stats
    payout
    @api.generation = 2
    @api.vote = 7500
    refreshed = stats(refresh: true)
    assert_equal 7500, refreshed.fetch(:current_vote)
    assert_equal '2.000 HBD', refreshed.fetch(:payout)
    assert_equal '2.000 HBD', payout.fetch(:payout)
    assert_equal 2, content_calls
    assert_equal 6, @api.calls.size
  end

  test 'a failed forced refresh preserves valid cached content and stored payout until recovery' do
    stats
    payout
    @api.failure = :get_content
    assert_raises(Timeout::Error) { stats(refresh: true) }
    assert_equal '1.000 HBD', @post.reload.payout
    assert_equal '1.000 HBD', payout.fetch(:payout)

    @api.failure = nil
    @api.generation = 2
    assert_equal '2.000 HBD', stats(refresh: true).fetch(:payout)
    assert_equal '2.000 HBD', payout.fetch(:payout)
    assert_equal 3, content_calls
  end

  test 'shared raw data keeps account votes and content identities isolated' do
    assert_equal 4200, stats.fetch(:current_vote)
    other = PostChainPayload.new(account: Account.new(name: 'other-cache'), api: @api, cache: @cache)
    assert_equal(-1000, other.chain_stats(@post, @post.author, @post.permlink).fetch(:current_vote))
    assert_equal 1, content_calls
    another = posts(:muted_unread)
    assert_equal '1.000 HBD', other.payout(another, another.author, another.permlink).fetch(:payout)
    assert_equal 2, content_calls
    assert_equal [[@post.author, @post.permlink], [another.author, another.permlink]],
      @api.calls.filter_map { |method, args| args if method == :get_content }
  end

  test 'one total deadline covers metadata and content and a later call can recover' do
    @api.delay = 0.04
    service = PostChainPayload.new(account: accounts(:curated), api: @api, cache: @cache, timeout: 0.1)
    assert_raises(Timeout::Error) { service.chain_stats(@post, @post.author, @post.permlink) }
    assert_nil @cache.read(['post-payout', @post.author, @post.permlink])
    @api.delay = 0
    assert_equal 'ready', stats.fetch(:status)
    assert_equal '1.000 HBD', @post.reload.payout
  end

  test 'new stats cache leaves the legacy full-payload cache intact during rollout' do
    old = {votes: [], replies: [], content: {pending_payout_value: '9.000 HBD'}}
    key = ['chain-stats', @post.author, @post.permlink]
    @cache.write(key, old, expires_in: 2.minutes)
    assert_equal '1.000 HBD', stats.fetch(:payout)
    assert_equal old, @cache.read(key)
    assert_equal '1.000 HBD', payout.fetch(:payout)
    assert_equal 1, content_calls
  end

private
  def stats(refresh: false)
    PostChainPayload.new(account: accounts(:curated), api: @api, cache: @cache).
      chain_stats(@post, @post.author, @post.permlink, refresh: refresh)
  end

  def payout
    PostChainPayload.new(account: accounts(:curated), api: @api, cache: @cache).
      payout(@post, @post.author, @post.permlink)
  end

  def content_calls
    @api.calls.count { |method, _| method == :get_content }
  end
end
