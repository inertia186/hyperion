require 'test_helper'

class PostPayoutRefreshTest < ActiveSupport::TestCase
  test 'refreshes payouts for recent posts up to the limit' do
    posts(:allowed_unread).update!(created_at: 2.days.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)
    posts(:muted_unread).update!(created_at: 1.day.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)
    posts(:old_allowed).update!(created_at: 10.days.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)

    api = PayoutApi.new(
      cashout_infos: {
        [posts(:allowed_unread).author, posts(:allowed_unread).permlink] => {net_rshares: 2, reward_weight: 10_000, max_accepted_payout: hbd_asset('1000000.000')},
        [posts(:muted_unread).author, posts(:muted_unread).permlink] => {net_rshares: 4, reward_weight: 10_000, max_accepted_payout: hbd_asset('1000000.000')}
      }
    )

    result = PostPayoutRefresh.new(window: 7.days, limit: 1, api: api).call

    assert_equal [[[posts(:muted_unread).author, posts(:muted_unread).permlink]]], api.pending_calls
    assert_empty api.content_calls
    assert_equal 1, api.reward_fund_calls
    assert_equal 1, api.price_feed_calls
    assert_equal 1, result.checked
    assert_equal 1, result.updated
    assert_equal '2.000 HBD', posts(:muted_unread).reload.payout
    assert_equal BigDecimal('2.000'), posts(:muted_unread).payout_amount
    assert_equal 'HBD', posts(:muted_unread).payout_currency
    assert_equal 'estimated', posts(:muted_unread).payout_source
    assert_equal BigDecimal('4'), posts(:muted_unread).net_rshares
    assert_nil posts(:allowed_unread).reload.payout
    assert_nil posts(:old_allowed).reload.payout
  end

  test 'counts unavailable comments without failing' do
    api = PayoutApi.new(cashout_infos: {})

    result = PostPayoutRefresh.new(window: 7.days, limit: 1, api: api).call

    assert_equal 1, api.pending_calls.size
    assert_empty api.content_calls
    assert_equal 1, result.checked
    assert_equal 0, result.updated
    assert_equal 1, result.unavailable
    assert_equal 0, result.failed
    assert posts(:allowed_unread).reload.payout_unavailable_at.present?
  end

  test 'splits pending payout preflight by payload size' do
    selected_posts = [posts(:allowed_unread), posts(:muted_unread), posts(:read_allowed)]
    Post.where.not(id: selected_posts.map(&:id)).update_all(created_at: 10.days.ago)
    selected_posts.each_with_index do |post, index|
      post.update!(
        created_at: (index + 1).hours.ago,
        payout: nil,
        payout_amount: nil,
        payout_currency: nil,
        payout_fetched_at: nil,
        payout_unavailable_at: nil,
        payout_source: nil
      )
    end
    api = PayoutApi.new(
      cashout_infos: selected_posts.index_with do
        {net_rshares: 2, reward_weight: 10_000, max_accepted_payout: hbd_asset('1000000.000')}
      end.transform_keys { |post| [post.author, post.permlink] }
    )

    result = PostPayoutRefresh.new(window: 7.days, limit: 3, api: api, pending_payout_payload_limit: 60).call

    assert_equal 3, result.checked
    assert_equal 3, result.updated
    assert_operator api.pending_calls.size, :>, 1
    assert_equal selected_posts.sort_by(&:created_at).reverse.map { |post| [post.author, post.permlink] }, api.pending_calls.flatten(1)
    assert_empty api.content_calls
    assert_equal 1, api.reward_fund_calls
    assert_equal 1, api.price_feed_calls
  end

  test 'splits pending payout preflight by comment count' do
    selected_posts = [posts(:allowed_unread), posts(:muted_unread), posts(:read_allowed)]
    Post.where.not(id: selected_posts.map(&:id)).update_all(created_at: 10.days.ago)
    selected_posts.each_with_index do |post, index|
      post.update!(
        created_at: (index + 1).hours.ago,
        payout: nil,
        payout_amount: nil,
        payout_currency: nil,
        payout_fetched_at: nil,
        payout_unavailable_at: nil,
        payout_source: nil
      )
    end
    api = PayoutApi.new(
      cashout_infos: selected_posts.index_with do
        {net_rshares: 2, reward_weight: 10_000, max_accepted_payout: hbd_asset('1000000.000')}
      end.transform_keys { |post| [post.author, post.permlink] }
    )

    result = PostPayoutRefresh.new(window: 7.days, limit: 3, api: api, pending_payout_comment_limit: 2).call

    assert_equal 3, result.checked
    assert_equal 3, result.updated
    assert_equal 2, api.pending_calls.size
    assert_equal [2, 1], api.pending_calls.map(&:size)
    assert_empty api.content_calls
    assert_equal 1, api.reward_fund_calls
    assert_equal 1, api.price_feed_calls
  end

  test 'counts invalid Hive parameters as unavailable instead of failed' do
    posts(:allowed_unread).update!(payout_unavailable_at: nil)
    api = InvalidParameterApi.new

    result = PostPayoutRefresh.new(window: 7.days, limit: 1, api: api).call

    assert_equal 1, result.checked
    assert_equal 0, result.updated
    assert_equal 1, result.unavailable
    assert_equal 0, result.failed
    assert_empty result.errors
    assert_nil posts(:allowed_unread).reload.payout_unavailable_at
  end

  test 'skips posts already marked payout unavailable' do
    Post.where.not(id: [posts(:allowed_unread).id, posts(:muted_unread).id]).update_all(created_at: 10.days.ago)
    posts(:allowed_unread).update!(created_at: 1.day.ago, payout_unavailable_at: 10.minutes.ago)
    posts(:muted_unread).update!(created_at: 1.day.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)
    api = PayoutApi.new(
      cashout_infos: {
        [posts(:muted_unread).author, posts(:muted_unread).permlink] => {net_rshares: 4, reward_weight: 10_000, max_accepted_payout: hbd_asset('1000000.000')}
      }
    )

    result = PostPayoutRefresh.new(window: 7.days, limit: 10, api: api).call

    assert_equal [[[posts(:muted_unread).author, posts(:muted_unread).permlink]]], api.pending_calls
    assert_empty api.content_calls
    assert_equal 1, result.checked
    assert_equal 1, result.updated
    assert_equal 0, result.unavailable
    assert_equal 0, result.failed
  end

  test 'batch preflight timeout does not permanently mark posts unavailable' do
    posts(:allowed_unread).update!(payout_unavailable_at: nil)
    api = TimeoutPreflightApi.new

    result = PostPayoutRefresh.new(window: 7.days, limit: 1, api: api).call

    assert_equal 1, result.checked
    assert_equal 0, result.updated
    assert_equal 1, result.unavailable
    assert_equal 0, result.failed
    assert_empty result.errors
    assert_nil posts(:allowed_unread).reload.payout_unavailable_at
  end

  test 'default API path uses account failover wrapper' do
    posts(:allowed_unread).update!(created_at: 1.day.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)
    success_api = PayoutApi.new(
      cashout_infos: {
        [posts(:allowed_unread).author, posts(:allowed_unread).permlink] => {net_rshares: 2, reward_weight: 10_000, max_accepted_payout: hbd_asset('1000000.000')}
      }
    )
    failure_api = TimeoutPreflightApi.new
    apis = [failure_api, success_api]
    attempts = 0
    failover_calls = 0

    Account.stub(:api, -> { apis.fetch(attempts) }) do
      Account.stub(:with_simple_failover, ->(&block) {
        failover_calls += 1
        begin
          block.call
        rescue Timeout::Error
          attempts += 1
          block.call
        end
      }) do
        result = PostPayoutRefresh.new(window: 7.days, limit: 1).call

        assert_equal 1, result.checked
        assert_equal 1, result.updated
        assert_equal 0, result.failed
      end
    end

    assert_operator failover_calls, :>=, 1
    assert_equal 1, attempts
    assert_equal 1, success_api.pending_calls.size
  end

  test 'estimated payout clamps negative rshares and caps max accepted payout' do
    Post.where.not(id: [posts(:allowed_unread).id, posts(:muted_unread).id]).update_all(created_at: 10.days.ago)
    posts(:allowed_unread).update!(created_at: 2.days.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil, payout_source: nil)
    posts(:muted_unread).update!(created_at: 1.day.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil, payout_source: nil)
    api = PayoutApi.new(
      cashout_infos: {
        [posts(:allowed_unread).author, posts(:allowed_unread).permlink] => {net_rshares: -10, reward_weight: 10_000, max_accepted_payout: hbd_asset('1000000.000')},
        [posts(:muted_unread).author, posts(:muted_unread).permlink] => {net_rshares: 400, reward_weight: 10_000, max_accepted_payout: hbd_asset('3.000')}
      }
    )

    result = PostPayoutRefresh.new(window: 7.days, limit: 2, api: api).call

    assert_equal 2, result.checked
    assert_equal 2, result.updated
    assert_equal '3.000 HBD', posts(:muted_unread).reload.payout
    assert_equal '0.000 HBD', posts(:allowed_unread).reload.payout
    assert_equal BigDecimal('400'), posts(:muted_unread).net_rshares
    assert_equal BigDecimal('-10'), posts(:allowed_unread).net_rshares
  end

private
  PayoutResult = Struct.new(:result, keyword_init: true)

  class PayoutApi
    attr_reader :content_calls, :pending_calls, :price_feed_calls, :reward_fund_calls

    def initialize(cashout_infos:)
      @cashout_infos = cashout_infos
      @pending_calls = []
      @content_calls = []
      @price_feed_calls = 0
      @reward_fund_calls = 0
    end

    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      if api == :database_api && method == :get_comment_pending_payouts
        @pending_calls << args.fetch(:comments)
        return PayoutResult.new(result: {
          cashout_infos: @cashout_infos.map { |(author, permlink), cashout_info| {author: author, permlink: permlink, cashout_info: cashout_info} }
        })
      end
      if api == :database_api && method == :get_reward_funds
        @reward_fund_calls += 1
        return PayoutResult.new(result: {funds: [{name: 'post', recent_claims: '1000', reward_balance: hive_asset('1000.000')}]})
      end
      if api == :database_api && method == :get_current_price_feed
        @price_feed_calls += 1
        return PayoutResult.new(result: {base: hbd_asset('0.500'), quote: hive_asset('1.000')})
      end

      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_content

      @content_calls << args
      PayoutResult.new(result: nil)
    end

  private
    def hbd_asset(value)
      asset(value, '@@000000013')
    end

    def hive_asset(value)
      asset(value, '@@000000021')
    end

    def asset(value, nai)
      amount = (BigDecimal(value) * 1000).to_i.to_s
      {amount: amount, precision: 3, nai: nai}
    end
  end

  def hbd_asset(value)
    asset(value, '@@000000013')
  end

  def hive_asset(value)
    asset(value, '@@000000021')
  end

  def asset(value, nai)
    amount = (BigDecimal(value) * 1000).to_i.to_s
    {amount: amount, precision: 3, nai: nai}
  end

  class InvalidParameterApi
    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :database_api
      raise "unexpected method: #{method}" unless method == :get_comment_pending_payouts

      raise Hive::ArgumentError, '{"error":"database_api.get_comment_pending_payouts: Invalid parameters"}'
    end
  end

  class TimeoutPreflightApi
    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :database_api
      raise "unexpected method: #{method}" unless method == :get_comment_pending_payouts

      raise Timeout::Error, 'execution expired'
    end
  end
end
