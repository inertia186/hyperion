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

  test 'post image url prefers metadata image' do
    post = create_post(author: 'alice', permlink: 'metadata-image')
    post.metadata = {'image' => ['https://example.com/metadata.jpg']}
    post.body = 'https://example.com/body.jpg'

    assert_equal 'https://example.com/metadata.jpg', post.post_image_url
  end

  test 'post image url falls back to first body image' do
    post = create_post(author: 'alice', permlink: 'body-image')

    assert_equal 'https://example.com/body.png', post.post_image_url('body https://example.com/body.png')
  end

  test 'display body leaves normal posts unchanged' do
    post = create_post(author: 'alice', permlink: 'normal-body')
    post.body = 'Plain post body'

    assert_equal 'Plain post body', post.display_body
  end

  test 'display body uses referenced post for cross posts' do
    original = create_post(author: 'alice', permlink: 'original')
    original.update!(body: 'Original post content')
    post = create_post(author: 'alice', permlink: 'cross-post-body', tags: %w(cross-post))
    post.body = 'This is a cross post of [@alice/original](/hive-1/@alice/original) by @bob.<br><br>Actual post content'

    assert_equal "Original post content\n\n---\n\nActual post content", post.display_body
  end

  test 'display body avoids duplicating matching cross post copy' do
    original = create_post(author: 'alice', permlink: 'matching-original')
    original.update!(body: 'Same post content')
    post = create_post(author: 'alice', permlink: 'matching-cross-post-body', tags: %w(cross-post))
    post.body = 'This is a cross post of [@alice/matching-original](/hive-1/@alice/matching-original) by @bob.<br><br>Same post content'

    assert_equal 'Same post content', post.display_body
  end

  test 'display body keeps malformed cross post bodies unchanged' do
    post = create_post(author: 'alice', permlink: 'malformed-cross-post-body', tags: %w(cross-post))
    post.body = 'This is a cross post of something without the expected separator'

    assert_equal post.body, post.display_body
  end

  test 'post image url uses display body for cross posts' do
    original = create_post(author: 'alice', permlink: 'image-original')
    original.update!(body: 'Original image https://example.com/original.png')
    post = create_post(author: 'alice', permlink: 'cross-post-image', tags: %w(cross-post))
    post.body = 'This is a cross post of [@alice/image-original](/hive-1/@alice/image-original) by @bob.<br><br>Actual image https://example.com/cross.png'

    assert_equal 'https://example.com/original.png', post.post_image_url
  end

  test 'display post falls back to stripped body when referenced post is unavailable' do
    referenced_post = create_post(author: 'alice', permlink: 'missing-original')
    post = create_post(author: 'alice', permlink: 'missing-cross-post-body', tags: %w(cross-post))
    post.body = 'This is a cross post of [@alice/missing-original](/hive-1/@alice/missing-original) by @bob.<br><br>Copied post content'

    referenced_post.stub(:load_body!, nil) do
      Post.stub(:find_by, referenced_post) do
        assert_equal 'Copied post content', post.display_body
      end
    end
  end

  test 'post image url falls back to youtube thumbnail' do
    post = create_post(author: 'alice', permlink: 'youtube-image')

    assert_equal 'https://img.youtube.com/vi/video-id/0.jpg', post.post_image_url('https://youtu.be/video-id')
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
