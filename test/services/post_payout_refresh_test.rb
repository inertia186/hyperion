require 'test_helper'

class PostPayoutRefreshTest < ActiveSupport::TestCase
  test 'refreshes payouts for recent posts up to the limit' do
    posts(:allowed_unread).update!(created_at: 2.days.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)
    posts(:muted_unread).update!(created_at: 1.day.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)
    posts(:old_allowed).update!(created_at: 10.days.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)

    api = PayoutApi.new(
      [posts(:allowed_unread).author, posts(:allowed_unread).permlink] => {cashout_time: '2026-06-07T00:00:00', pending_payout_value: '1.234 HBD', total_payout_value: '0.000 HBD'},
      [posts(:muted_unread).author, posts(:muted_unread).permlink] => {cashout_time: '2026-06-07T00:00:00', pending_payout_value: '2.000 HBD', total_payout_value: '0.000 HBD'}
    )

    result = PostPayoutRefresh.new(window: 7.days, limit: 1, api: api).call

    assert_equal 1, result.checked
    assert_equal 1, result.updated
    assert_equal '2.000 HBD', posts(:muted_unread).reload.payout
    assert_nil posts(:allowed_unread).reload.payout
    assert_nil posts(:old_allowed).reload.payout
  end

  test 'counts unavailable comments without failing' do
    api = PayoutApi.new({})

    result = PostPayoutRefresh.new(window: 7.days, limit: 1, api: api).call

    assert_equal 1, result.checked
    assert_equal 0, result.updated
    assert_equal 1, result.unavailable
    assert_equal 0, result.failed
    assert posts(:allowed_unread).reload.payout_unavailable_at.present?
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
    assert posts(:allowed_unread).reload.payout_unavailable_at.present?
  end

  test 'skips posts already marked payout unavailable' do
    Post.where.not(id: [posts(:allowed_unread).id, posts(:muted_unread).id]).update_all(created_at: 10.days.ago)
    posts(:allowed_unread).update!(created_at: 1.day.ago, payout_unavailable_at: 10.minutes.ago)
    posts(:muted_unread).update!(created_at: 1.day.ago, payout: nil, payout_amount: nil, payout_currency: nil, payout_fetched_at: nil, payout_unavailable_at: nil)
    api = PayoutApi.new(
      [posts(:muted_unread).author, posts(:muted_unread).permlink] => {cashout_time: '2026-06-07T00:00:00', pending_payout_value: '2.000 HBD', total_payout_value: '0.000 HBD'}
    )

    result = PostPayoutRefresh.new(window: 7.days, limit: 10, api: api).call

    assert_equal [[posts(:muted_unread).author, posts(:muted_unread).permlink]], api.calls
    assert_equal 1, result.checked
    assert_equal 1, result.updated
    assert_equal 0, result.unavailable
    assert_equal 0, result.failed
  end

private
  PayoutResult = Struct.new(:result, keyword_init: true)

  class PayoutApi
    attr_reader :calls

    def initialize(responses)
      @responses = responses
      @calls = []
    end

    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_content

      @calls << args
      PayoutResult.new(result: @responses[args])
    end
  end

  class InvalidParameterApi
    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_content

      raise Hive::ArgumentError, '{"error":"condenser_api.get_content: Invalid parameters"}'
    end
  end
end
