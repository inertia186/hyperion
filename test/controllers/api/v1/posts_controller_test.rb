require 'test_helper'

class Api::V1::PostsControllerTest < ActionController::TestCase
  tests Api::V1::PostsController

  setup do
    account = accounts(:curated)
    def account.blacklist_sources
      ['fixture-curator']
    end
    @request.session[:current_account] = account
    posts(:blacklisted_allowed).update!(blacklist_reasons: [{'account' => 'fixture-curator'}])
  end

  test 'normal unread results exclude posts from current blacklist sources' do
    get :index, params: {sort: 'latest', limit: 30}

    assert_response :success
    titles = response_json.fetch('posts').map { |post| post.fetch('title') }

    assert_includes titles, 'Allowed Unread'
    assert_includes titles, 'Muted Unread'
    assert_not_includes titles, 'Read Allowed'
    assert_not_includes titles, 'Ignored Unread'
    assert_not_includes titles, 'Old Allowed'
    assert_not_includes titles, 'Deleted Allowed'
    assert_not_includes titles, 'Blacklisted Allowed'
  end

  test 'mode counts include current blacklist sources' do
    get :index, params: {sort: 'latest', limit: 30}

    assert_response :success
    assert_equal(
      {
        'unread' => 2,
        'read' => 1,
        'ignored' => 1,
        'deleted' => 1,
        'blacklisted' => 1
      },
      response_json.fetch('mode_counts')
    )
  end

  test 'mode counts respect tag filters' do
    get :index, params: {tag: 'haf', sort: 'latest', limit: 30}

    assert_response :success
    assert_equal(
      {
        'unread' => 2,
        'read' => 1,
        'ignored' => 0,
        'deleted' => 1,
        'blacklisted' => 1
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

  test 'normal unread results exclude posts below minimum reputation' do
    Post.update_all(author_reputation: 35)
    account = @request.session[:current_account]
    account.update_minimum_reputation!(30)
    low_rep = create_post_with_tag(author: 'new-author', permlink: 'low-reputation-post', title: 'Low Reputation Post', tag: 'haf', author_reputation: 12)

    get :index, params: {sort: 'latest', limit: 30}

    assert_response :success
    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_not_includes titles, low_rep.title
    assert_equal 2, response_json.fetch('mode_counts').fetch('unread')
    assert_equal 2, response_json.fetch('mode_counts').fetch('ignored')
    assert_equal 30, response_json.dig('query', 'minimum_reputation')
  end

  test 'ignored view includes posts below minimum reputation' do
    Post.update_all(author_reputation: 35)
    account = @request.session[:current_account]
    account.update_minimum_reputation!(30)
    low_rep = create_post_with_tag(author: 'new-author', permlink: 'low-reputation-post', title: 'Low Reputation Post', tag: 'haf', author_reputation: 12)

    get :index, params: {only_ignored: true, sort: 'latest', limit: 30}

    assert_response :success
    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_includes titles, 'Ignored Unread'
    assert_includes titles, low_rep.title
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
    assert_equal 3, response_json.fetch('mode_counts').fetch('unread')
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
    assert_equal 25, post.fetch('author_reputation')
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
    assert_equal ['Blacklisted Allowed'], response_json.fetch('posts').map { |post| post.fetch('title') }
  end

  test 'blacklisted list payload includes blacklist reasons' do
    get :index, params: {only_blacklisted: true}

    post = response_json.fetch('posts').first
    assert_equal true, post.fetch('blacklisted')
    assert_equal [{'account' => 'fixture-curator', 'name' => 'fixture-curator'}], post.fetch('blacklist_reasons')
  end

  test 'blacklist source excludes matching posts from normal mode' do
    get :index, params: {sort: 'latest', limit: 30}

    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_not_includes titles, 'Blacklisted Allowed'
    assert_equal 1, response_json.fetch('mode_counts').fetch('blacklisted')
  end

  test 'unfollowed blacklist source reasons do not hide posts' do
    posts(:blacklisted_allowed).update!(blacklist_reasons: [{'account' => 'other-source'}])

    get :index, params: {sort: 'latest', limit: 30}

    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_includes titles, 'Blacklisted Allowed'
    assert_equal 0, response_json.fetch('mode_counts').fetch('blacklisted')
  end

  test 'disabled hivewatchers blacklist reasons do not hide posts' do
    posts(:blacklisted_allowed).update!(blacklist_reasons: [{'account' => 'hivewatchers'}])

    get :index, params: {sort: 'latest', limit: 30}

    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_includes titles, 'Blacklisted Allowed'
    assert_equal 0, response_json.fetch('mode_counts').fetch('blacklisted')
  end

  test 'enabled hivewatchers blacklist reasons hide posts' do
    account = accounts(:curated)
    def account.blacklist_sources
      %w(fixture-curator hivewatchers)
    end
    @request.session[:current_account] = account
    posts(:blacklisted_allowed).update!(blacklist_reasons: [{'account' => 'hivewatchers'}])

    get :index, params: {sort: 'latest', limit: 30}

    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_not_includes titles, 'Blacklisted Allowed'
    assert_equal 1, response_json.fetch('mode_counts').fetch('blacklisted')
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
    assert_equal 'Loaded body', response_json.fetch('body_markdown')
    assert_equal content_sandbox_post_path(post, pp: :skip), response_json.fetch('content_sandbox_url')
    assert_equal "https://hive.blog/#{post.category}/@#{post.author}/#{post.permlink}", response_json.fetch('urls').fetch('hive_blog')
    assert_equal "https://peakd.com/#{post.category}/@#{post.author}/#{post.permlink}", response_json.fetch('urls').fetch('peakd')
    assert_equal "https://hivehub.dev/#{post.category}/@#{post.author}/#{post.permlink}", response_json.fetch('urls').fetch('hive_db')
    assert_not response_json.fetch('urls').key?('scribe')
  end

  test 'preview only renders hash headings when marker is followed by whitespace' do
    post = posts(:allowed_unread)
    post.update!(body: "# Real Heading\n\n#c-c-c #hivegc #gaming\n\n###Welcome without space")

    get :show, params: {id: post.id}

    assert_response :success
    body_html = response_json.fetch('body_html')
    assert_includes body_html, '<h1 id="real-heading">Real Heading</h1>'
    assert_includes body_html, '#c-c-c #hivegc #gaming'
    assert_includes body_html, '###Welcome without space'
    assert_not_includes body_html, '<h1 id="c-c-c-hivegc-gaming">'
    assert_not_includes body_html, '<h3 id="welcome-without-space">'
  end

  test 'preview hardens embedded iframe html' do
    post = posts(:allowed_unread)
    post.update!(body: '<iframe src="https://www.youtube.com/embed/abc" width="640" height="360"></iframe>')

    get :show, params: {id: post.id}

    assert_response :success
    body_html = response_json.fetch('body_html')
    assert_includes body_html, '<iframe'
    assert_includes body_html, 'src="https://www.youtube.com/embed/abc"'
    assert_includes body_html, 'loading="lazy"'
    assert_not_includes body_html, 'referrerpolicy='
    assert_not_includes body_html, 'sandbox='
  end

  test 'preview removes embedded iframe html with unsafe src' do
    post = posts(:allowed_unread)
    post.update!(body: '<iframe src="javascript:alert(1)"></iframe>Visible body')

    get :show, params: {id: post.id}

    assert_response :success
    body_html = response_json.fetch('body_html')
    assert_not_includes body_html, '<iframe'
    assert_includes body_html, 'Visible body'
  end

  test 'revisions returns rendered HAFBE revisions and local fallback' do
    post = posts(:allowed_unread)
    post.update!(body: 'Current **local** body')
    payload = {
      'operations_result' => [
        {'op' => {'type' => 'comment_operation', 'value' => {'author' => post.author, 'permlink' => post.permlink, 'title' => 'Old title', 'body' => "Hello world\nBye"}}, 'timestamp' => '2026-01-01T00:00:00', 'block' => 10, 'trx_id' => 'old-trx'},
        {'op' => {'type' => 'comment_operation', 'value' => {'author' => 'someone-else', 'permlink' => post.permlink, 'body' => 'Wrong body'}}, 'block' => 11},
        {'op' => {'type' => 'vote_operation', 'value' => {'author' => post.author, 'permlink' => post.permlink}}, 'block' => 12},
        {'op' => {'type' => 'comment_operation', 'value' => {'author' => post.author, 'permlink' => post.permlink, 'body' => "Hello world\nBye"}}, 'block' => 13},
        {'op' => {'type' => 'comment_operation', 'value' => {'author' => post.author, 'permlink' => post.permlink, 'body' => "@@ -1,15 +1,21 @@\n Hello \n+brave \n world%0ABye\n"}}, 'block' => 14},
        {'op' => {'type' => 'comment_operation', 'value' => {'author' => post.author, 'permlink' => post.permlink, 'body' => 'New body'}}, 'timestamp' => '2026-01-02T00:00:00', 'block' => 14}
      ]
    }
    response = Struct.new(:code, :body).new('200', payload.to_json)

    with_env('HAFBE_BASE_URL' => 'https://hafbe.example') do
      Net::HTTP.stub(:get_response, response) do
        get :revisions, params: {id: post.id}
      end
    end

    assert_response :success
    revisions = response_json.fetch('revisions')
    assert_equal 4, revisions.size
    assert_equal ['Revision 1', 'Revision 2', 'Revision 3', 'Revision 4'], revisions.map { |revision| revision.fetch('label') }
    assert_equal 10, revisions.first.fetch('block_num')
    assert_equal "Hello world\nBye", revisions.first.fetch('body')
    assert_equal "Hello brave world\nBye", revisions.second.fetch('body')
    assert_includes revisions.second.fetch('body_html'), 'Hello brave world'
    assert_includes revisions.last.fetch('body_html'), '<strong>local</strong>'
    assert_equal post.author, response_json.fetch('author')
    assert_equal post.permlink, response_json.fetch('permlink')
  end

  test 'revisions uses the default HAFBE URL when not configured' do
    posts(:allowed_unread).update!(body: 'Existing body')
    response = Struct.new(:code, :body).new('200', {'operations' => []}.to_json)
    captured_uri = nil

    with_env('HAFBE_BASE_URL' => nil) do
      Net::HTTP.stub(:get_response, ->(uri) {
        captured_uri = uri
        response
      }) do
        get :revisions, params: {id: posts(:allowed_unread).id}
      end
    end

    assert_response :success
    assert_equal 'https://api.hive.blog/hafbe-api/accounts/visible-author/operations/comments/allowed-unread', captured_uri.to_s
  end

  test 'preview payload includes blacklist reasons' do
    post = posts(:blacklisted_allowed)
    post.update!(body: 'Blacklisted body', blacklist_reasons: [{'account' => 'fixture-curator'}])

    get :show, params: {id: post.id}

    assert_response :success
    assert_equal true, response_json.fetch('blacklisted')
    assert_equal [{'account' => 'fixture-curator', 'name' => 'fixture-curator'}], response_json.fetch('blacklist_reasons')
    assert_equal 25, response_json.fetch('author_reputation')
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
  def create_post_with_tag(author:, permlink:, title:, tag:, created_at: Time.current, author_reputation: 25)
    post = Post.create!(
      author: author,
      permlink: permlink,
      title: title,
      body: "#{title} body",
      category: tag,
      metadata: {tags: [tag]},
      block_num: 1000 + Post.count,
      trx_id: "#{author}-#{permlink}",
      author_reputation: author_reputation,
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
