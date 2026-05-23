require 'test_helper'

class PostTest < ActiveSupport::TestCase
  test 'thumbnail url tolerates projected records without body' do
    Post.create!(
      author: 'alice',
      permlink: 'projected',
      title: 'Projected',
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 1,
      trx_id: '',
      created_at: Time.current
    )

    post = Post.select(Post::LIST_COLUMNS).find_by!(author: 'alice', permlink: 'projected')

    assert post.thumbnail_url.starts_with?('data:')
  end

  test 'orders by tag count without raw SQL' do
    low = create_post(author: 'alice', permlink: 'low-tags', tags_count: 1)
    high = create_post(author: 'alice', permlink: 'high-tags', tags_count: 3)

    posts = Post.where(permlink: %w(low-tags high-tags))

    assert_equal [high, low], posts.order_by_tag_count(:desc).to_a
    assert_equal [low, high], posts.order_by_tag_count(:asc).to_a
  end

  test 'orders by prolific author without raw SQL' do
    create_post(author: 'alice', permlink: 'alice-first')
    create_post(author: 'alice', permlink: 'alice-second')
    create_post(author: 'bob', permlink: 'bob-first')

    posts = Post.where(permlink: %w(alice-first alice-second bob-first))

    assert_equal %w(alice alice bob), posts.order_by_prolific(nil, :desc).map(&:author)
    assert_equal %w(bob alice alice), posts.order_by_prolific(nil, :asc).map(&:author)
  end

  test 'orders by prolific author for tag without interpolating tag SQL' do
    create_post(author: 'alice', permlink: 'ruby-first', tags: %w(ruby))
    create_post(author: 'alice', permlink: 'ruby-second', tags: %w(ruby))
    create_post(author: 'bob', permlink: 'ruby-third', tags: %w(ruby))
    create_post(author: 'bob', permlink: 'js-first', tags: %w(javascript))

    posts = Post.where(permlink: %w(ruby-first ruby-second ruby-third js-first))

    assert_equal %w(alice alice bob bob), posts.order_by_prolific('ruby', :desc).map(&:author)
    assert_nothing_raised do
      posts.order_by_prolific("ruby') OR 1=1 --", :desc).load
    end
  end

  test 'unread can include muted authors' do
    account = Account.create!(name: 'curator', muted_authors: %w(muted))
    visible = create_post(author: 'visible', permlink: 'visible-post')
    muted = create_post(author: 'muted', permlink: 'muted-post')
    posts = Post.where(permlink: %w(visible-post muted-post))

    assert_equal [visible], posts.unread(by: account).order(:author).to_a
    assert_equal [muted, visible], posts.unread(by: account, include_muted: true).order(:author).to_a
  end

  test 'including muted authors does not include ignored tags' do
    account = Account.create!(name: 'curator', muted_authors: %w(muted))
    visible = create_post(author: 'visible', permlink: 'visible-post', tags: %w(allowed))
    muted = create_post(author: 'muted', permlink: 'muted-post', tags: %w(allowed))
    create_post(author: 'visible', permlink: 'ignored-post', tags: %w(ignored))
    account.ignored_tags.create!(tag: 'ignored')
    account.reload
    posts = Post.where(permlink: %w(visible-post muted-post ignored-post))

    assert_equal [visible], posts.unread(by: account).order(:author).to_a
    assert_equal [muted, visible], posts.unread(by: account, include_muted: true).order(:author).to_a
  end

  test 'curated fixtures preserve read ignored and muted filters' do
    account = accounts(:curated)
    unread_with_muted = Post.active.blacklisted(false).unread(by: account, include_muted: true)
    unread_without_muted = unread_with_muted.where.not(author: account.muted_authors)

    assert_includes unread_with_muted, posts(:allowed_unread)
    assert_includes unread_with_muted, posts(:muted_unread)
    assert_not_includes unread_with_muted, posts(:ignored_unread)
    assert_not_includes unread_with_muted, posts(:read_allowed)
    assert_not_includes unread_with_muted, posts(:old_allowed)
    assert_not_includes unread_with_muted, posts(:deleted_allowed)
    assert_not_includes unread_with_muted, posts(:blacklisted_allowed)

    assert_includes unread_without_muted, posts(:allowed_unread)
    assert_not_includes unread_without_muted, posts(:muted_unread)
  end

private
  def create_post(author:, permlink:, tags_count: 0, tags: [])
    post = Post.create!(
      author: author,
      permlink: permlink,
      title: permlink.titleize,
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 1,
      trx_id: '',
      tags_count: tags_count,
      created_at: Time.current
    )

    tags.each { |tag| post.tags.create!(tag: tag) }

    post
  end
end
