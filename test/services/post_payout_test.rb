require 'test_helper'

class PostPayoutTest < ActiveSupport::TestCase
  test 'parses payout amount and currency' do
    assert_equal [BigDecimal('1.234'), 'HBD'], PostPayout.parse('1.234 HBD')
    assert_equal [BigDecimal('-0.500'), 'HIVE'], PostPayout.parse(' -0.500 HIVE ')
    assert_equal [nil, nil], PostPayout.parse('not a payout')
  end

  test 'captures payout fields on a post' do
    post = posts(:allowed_unread)
    fetched_at = Time.utc(2026, 6, 12, 16, 0, 0)

    PostPayout.new(post).capture!('2.500 HBD', fetched_at: fetched_at, source: 'estimated')
    post.reload

    assert_equal '2.500 HBD', post.payout
    assert_equal BigDecimal('2.500'), post.payout_amount
    assert_equal 'HBD', post.payout_currency
    assert_equal fetched_at, post.payout_fetched_at
    assert_equal 'estimated', post.payout_source
    assert_nil post.payout_unavailable_at
  end

  test 'marks payout unavailable without clearing cached payout' do
    post = posts(:allowed_unread)
    post.update!(payout: '1.000 HBD', payout_amount: 1, payout_currency: 'HBD', payout_source: 'exact')
    unavailable_at = Time.utc(2026, 6, 12, 17, 0, 0)

    PostPayout.new(post).mark_unavailable!(unavailable_at: unavailable_at)
    post.reload

    assert_equal '1.000 HBD', post.payout
    assert_equal unavailable_at, post.payout_unavailable_at
    assert_nil post.payout_source
  end
end
