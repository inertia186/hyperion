require 'test_helper'

class Api::V1::PostsControllerTest < ActionController::TestCase
  tests Api::V1::PostsController

  setup do
    @request.session[:current_account] = accounts(:curated)
    posts(:blacklisted_allowed).update!(blacklist_reasons: [{'community' => 'hive-163399'}])
  end

  test 'normal unread results include globally blacklisted posts when no blacklist sources are enabled' do
    get :index, params: {sort: 'latest', limit: 30}

    assert_response :success
    titles = response_json.fetch('posts').map { |post| post.fetch('title') }

    assert_includes titles, 'Allowed Unread'
    assert_includes titles, 'Muted Unread'
    assert_not_includes titles, 'Read Allowed'
    assert_not_includes titles, 'Ignored Unread'
    assert_not_includes titles, 'Old Allowed'
    assert_not_includes titles, 'Deleted Allowed'
    assert_includes titles, 'Blacklisted Allowed'
  end

  test 'mode counts default blacklisted count to zero when no blacklist sources are enabled' do
    get :index, params: {sort: 'latest', limit: 30}

    assert_response :success
    assert_equal(
      {
        'unread' => 3,
        'read' => 1,
        'ignored' => 1,
        'deleted' => 1,
        'blacklisted' => 0
      },
      response_json.fetch('mode_counts')
    )
  end

  test 'mode counts respect tag filters' do
    get :index, params: {tag: 'haf', sort: 'latest', limit: 30}

    assert_response :success
    assert_equal(
      {
        'unread' => 3,
        'read' => 1,
        'ignored' => 0,
        'deleted' => 1,
        'blacklisted' => 0
      },
      response_json.fetch('mode_counts')
    )
  end

  test 'counts include muted posts for the current filter' do
    get :index, params: {sort: 'latest', limit: 30}

    assert_response :success
    assert_equal 1, response_json.fetch('counts').fetch('muted_posts')
    assert_equal 0, response_json.fetch('counts').fetch('poisoned_pill_tags')
    assert_empty response_json.fetch('poisoned_pill_tags')
  end

  test 'poisoned pill tags suppress active authors from normal inbox' do
    account = accounts(:curated)
    account.poisoned_pill_tags.create!(tag: 'deplorable')
    bob_pill = create_post_with_tag(author: 'bob', permlink: 'deplorable-post', title: 'Bob Used Deplorable', tag: 'deplorable')
    bob_noise = create_post_with_tag(author: 'bob', permlink: 'ordinary-post', title: 'Bob Ordinary Noise', tag: 'haf')
    carol_expired_pill = create_post_with_tag(author: 'carol', permlink: 'expired-deplorable-post', title: 'Carol Old Deplorable', tag: 'deplorable', created_at: 8.days.ago)
    carol_noise = create_post_with_tag(author: 'carol', permlink: 'ordinary-post', title: 'Carol Ordinary Post', tag: 'haf')

    get :index, params: {sort: 'latest', limit: 30}

    assert_response :success
    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_not_includes titles, bob_pill.title
    assert_not_includes titles, bob_noise.title
    assert_not_includes titles, carol_expired_pill.title
    assert_includes titles, carol_noise.title
    assert_includes response_json.fetch('poisoned_pill_tags'), 'deplorable'
    assert_equal 4, response_json.fetch('mode_counts').fetch('unread')
    assert_equal 3, response_json.fetch('mode_counts').fetch('ignored')
  end

  test 'ignored view includes active posts by poisoned authors' do
    account = accounts(:curated)
    account.poisoned_pill_tags.create!(tag: 'deplorable')
    create_post_with_tag(author: 'bob', permlink: 'deplorable-post', title: 'Bob Used Deplorable', tag: 'deplorable')
    create_post_with_tag(author: 'bob', permlink: 'ordinary-post', title: 'Bob Ordinary Noise', tag: 'haf')
    create_post_with_tag(author: 'carol', permlink: 'expired-deplorable-post', title: 'Carol Old Deplorable', tag: 'deplorable', created_at: 8.days.ago)
    create_post_with_tag(author: 'carol', permlink: 'ordinary-post', title: 'Carol Ordinary Post', tag: 'haf')

    get :index, params: {only_ignored: true, sort: 'latest', limit: 30}

    assert_response :success
    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_includes titles, 'Ignored Unread'
    assert_includes titles, 'Bob Used Deplorable'
    assert_includes titles, 'Bob Ordinary Noise'
    assert_not_includes titles, 'Carol Old Deplorable'
    assert_not_includes titles, 'Carol Ordinary Post'
  end

  test 'community names are included for secondary hive tags' do
    get :index, params: {sort: 'latest', limit: 30}

    post = response_json.fetch('posts').find { |candidate| candidate.fetch('title') == 'Allowed Unread' }
    community_tag = post.fetch('tags').find { |tag| tag.fetch('tag') == 'hive-19999' }

    assert_equal 'HAF', post.fetch('category_name')
    assert_equal 'https://example.com/haf-community.png', post.fetch('category_image_url')
    assert_equal 'Side Community', community_tag.fetch('name')
    assert_equal 'https://example.com/side-community.png', community_tag.fetch('image_url')
    assert_equal false, community_tag.fetch('category')
  end

  test 'related tags include post counts for word cloud sizing' do
    get :index, params: {sort: 'latest', limit: 30}

    related_tag = response_json.fetch('related_tags').find { |tag| tag.fetch('tag') == 'haf' }

    assert related_tag
    assert related_tag.fetch('count') > 0
  end

  test 'related and past community tags include profile images' do
    get :index, params: {sort: 'latest', limit: 30}

    related_tag = response_json.fetch('related_tags').find { |tag| tag.fetch('tag') == 'hive-13323' }
    past_tag = response_json.fetch('past_tags').find { |tag| tag.fetch('tag') == 'haf' }

    assert_equal 'https://example.com/haf-community.png', related_tag.fetch('image_url')
    assert_nil past_tag.fetch('image_url')
  end

  test 'post list image payload includes body image avatar and placeholder' do
    posts(:allowed_unread).update!(body: 'body https://example.com/allowed.png', metadata: {tags: %w(haf hive-13323)})

    get :index, params: {sort: 'latest', limit: 30}

    post = response_json.fetch('posts').find { |candidate| candidate.fetch('title') == 'Allowed Unread' }

    assert_equal 'https://example.com/allowed.png', post.fetch('thumbnail_url')
    assert_equal 'https://images.hive.blog/u/visible-author/avatar', post.fetch('author_avatar_url')
    assert post.fetch('placeholder_image_url').starts_with?('data:image/gif')
    assert_not post.key?('body')
  end

  test 'post list thumbnail uses cross post display body' do
    original = Post.create!(
      author: 'alice',
      permlink: 'original',
      title: 'Original',
      body: 'Original image https://example.com/original.png',
      category: 'hive-13323',
      metadata: {},
      block_num: 300,
      trx_id: 'original-trx',
      created_at: Time.current
    )
    post = posts(:allowed_unread)
    post.update!(
      body: 'This is a cross post of [@alice/original](/hive-1/@alice/original) by @bob.<br><br>Actual image https://example.com/cross.png',
      metadata: {tags: %w(cross-post)}
    )
    post.tags.find_or_create_by!(tag: 'cross-post', category: false)

    get :index, params: {sort: 'latest', limit: 30}

    payload = response_json.fetch('posts').find { |candidate| candidate.fetch('id') == post.id }

    assert_equal original.title, payload.fetch('title')
    assert_equal original.author, payload.fetch('author')
    assert_equal 'https://example.com/original.png', payload.fetch('thumbnail_url')
  end

  test 'muted authors disappear when mute is enabled' do
    @request.session[:muted_authors_enabled] = true

    get :index, params: {sort: 'latest', limit: 30}

    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_includes titles, 'Allowed Unread'
    assert_not_includes titles, 'Muted Unread'
  end

  test 'specialized views return their sets' do
    get :index, params: {only_read: true}
    assert_equal ['Read Allowed'], response_json.fetch('posts').map { |post| post.fetch('title') }

    get :index, params: {only_ignored: true}
    assert_equal ['Ignored Unread'], response_json.fetch('posts').map { |post| post.fetch('title') }

    get :index, params: {only_deleted: true}
    assert_equal ['Deleted Allowed'], response_json.fetch('posts').map { |post| post.fetch('title') }

    get :index, params: {only_blacklisted: true}
    assert_equal [], response_json.fetch('posts').map { |post| post.fetch('title') }
  end

  test 'blacklisted list payload includes blacklist reasons' do
    accounts(:curated).update_enabled_blacklist_sources!(%w(hive-163399))

    get :index, params: {only_blacklisted: true}

    post = response_json.fetch('posts').first
    assert_equal true, post.fetch('blacklisted')
    assert_equal [{'community' => 'hive-163399', 'name' => 'Trusted Safety'}], post.fetch('blacklist_reasons')
  end

  test 'enabled blacklist source excludes matching posts from normal mode' do
    accounts(:curated).update_enabled_blacklist_sources!(%w(hive-163399))

    get :index, params: {sort: 'latest', limit: 30}

    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_not_includes titles, 'Blacklisted Allowed'
    assert_equal 1, response_json.fetch('mode_counts').fetch('blacklisted')
  end

  test 'disabled blacklist source reasons do not hide posts' do
    accounts(:curated).update_enabled_blacklist_sources!(%w(hive-136001))

    get :index, params: {sort: 'latest', limit: 30}

    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_includes titles, 'Blacklisted Allowed'
    assert_equal 0, response_json.fetch('mode_counts').fetch('blacklisted')
  end

  test 'read mutations update read state' do
    post :mark_read, params: {id: posts(:allowed_unread).id}

    assert_response :success
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert_equal true, response_json.fetch('read')

    delete :mark_unread, params: {id: posts(:allowed_unread).id}

    assert_response :success
    assert_not accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert_equal false, response_json.fetch('read')
  end

  test 'mark many read updates all requested posts' do
    patch :mark_many_read, params: {post_ids: [posts(:allowed_unread).id, posts(:muted_unread).id]}

    assert_response :success
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert accounts(:curated).post_read?(posts(:muted_unread).id)
  end

  test 'mark many read can apply to all posts matching current filter without pagination' do
    patch :mark_many_read, params: {all_matching: true, query: {tag: 'haf', limit: 1, page: 1}}

    assert_response :success
    assert_equal true, response_json.fetch('all_matching')
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert accounts(:curated).post_read?(posts(:muted_unread).id)
    assert_not accounts(:curated).post_read?(posts(:ignored_unread).id)
  end

  test 'preview lazy loads missing body' do
    post = posts(:allowed_unread)

    post.stub(:load_body!, -> { post.body = 'Loaded body' }) do
      Post.stub(:find, post) do
        get :show, params: {id: post.id}
      end
    end

    assert_response :success
    assert_includes response_json.fetch('body_html'), 'Loaded body'
    assert_equal content_sandbox_post_path(post, pp: :skip), response_json.fetch('content_sandbox_url')
    assert_equal "https://hive.blog/#{post.category}/@#{post.author}/#{post.permlink}", response_json.fetch('urls').fetch('hive_blog')
    assert_equal "https://peakd.com/#{post.category}/@#{post.author}/#{post.permlink}", response_json.fetch('urls').fetch('peakd')
    assert_equal "https://hive-db.com/#{post.category}/@#{post.author}/#{post.permlink}", response_json.fetch('urls').fetch('hive_db')
  end

  test 'preview payload includes blacklist reasons' do
    accounts(:curated).update_enabled_blacklist_sources!(%w(hive-163399 hive-136001))
    post = posts(:blacklisted_allowed)
    post.update!(body: 'Blacklisted body', blacklist_reasons: [{'community' => 'hive-163399'}, {'community' => 'hive-136001'}])

    get :show, params: {id: post.id}

    assert_response :success
    assert_equal true, response_json.fetch('blacklisted')
    assert_equal [{'community' => 'hive-163399', 'name' => 'Trusted Safety'}, {'community' => 'hive-136001', 'name' => 'Ban Hammer'}], response_json.fetch('blacklist_reasons')
  end

  test 'preview renders referenced post for cross posts' do
    original = Post.create!(
      author: 'alice',
      permlink: 'original',
      title: 'Original Post',
      body: 'Original post content',
      category: 'hive-13323',
      metadata: {app: 'peakd/1.0'},
      block_num: 300,
      trx_id: 'original-trx',
      created_at: Time.current
    )
    post = posts(:allowed_unread)
    post.update!(
      body: 'This is a cross post of [@alice/original](/hive-1/@alice/original) by @bob.<br><br>Actual post content',
      metadata: {tags: %w(cross-post)}
    )
    post.tags.find_or_create_by!(tag: 'cross-post', category: false)

    get :show, params: {id: post.id}

    assert_response :success
    assert_equal post.id, response_json.fetch('id')
    assert_equal original.author, response_json.fetch('author')
    assert_equal original.permlink, response_json.fetch('permlink')
    assert_equal original.title, response_json.fetch('title')
    assert_includes response_json.fetch('body_html'), 'Original post content'
    assert_not_includes response_json.fetch('body_html'), 'This is a cross post'
    assert_equal "https://hive.blog/#{original.category}/@#{original.author}/#{original.permlink}", response_json.fetch('urls').fetch('hive_blog')
  end

private
  def create_post_with_tag(author:, permlink:, title:, tag:, created_at: Time.current)
    post = Post.create!(
      author: author,
      permlink: permlink,
      title: title,
      body: "#{title} body",
      category: tag,
      metadata: {tags: [tag]},
      block_num: 1000 + Post.count,
      trx_id: "#{author}-#{permlink}",
      created_at: created_at,
      updated_at: created_at
    )
    post.tags.create!(tag: tag, category: true)
    post
  end

  def response_json
    JSON.parse(response.body)
  end
end
