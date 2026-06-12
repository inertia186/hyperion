require 'test_helper'

class PostCurationSortTest < ActiveSupport::TestCase
  test 'sorts latest and oldest by creation time' do
    latest_titles = PostCurationSort.apply(Post.all, sort: 'latest', tag: '').limit(2).pluck(:title)
    oldest_titles = PostCurationSort.apply(Post.all, sort: 'oldest', tag: '').limit(2).pluck(:title)

    assert_equal Post.order(created_at: :desc).limit(2).pluck(:title), latest_titles
    assert_equal Post.order(created_at: :asc).limit(2).pluck(:title), oldest_titles
  end

  test 'falls back to latest for unknown sort names' do
    fallback_titles = PostCurationSort.apply(Post.all, sort: 'surprising', tag: '').limit(2).pluck(:title)

    assert_equal PostCurationSort.apply(Post.all, sort: 'latest', tag: '').limit(2).pluck(:title), fallback_titles
  end

  test 'applies payout ordering strategies' do
    posts(:allowed_unread).update!(payout_amount: 1.25)
    posts(:read_allowed).update!(payout_amount: 3.50)

    assert_equal posts(:read_allowed).id, PostCurationSort.apply(Post.where(id: [posts(:allowed_unread).id, posts(:read_allowed).id]), sort: 'highest_payout', tag: '').first.id
    assert_equal posts(:allowed_unread).id, PostCurationSort.apply(Post.where(id: [posts(:allowed_unread).id, posts(:read_allowed).id]), sort: 'lowest_payout', tag: '').first.id
  end
end
