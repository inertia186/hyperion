require 'test_helper'

class PostsControllerTest < ActionController::TestCase
  tests PostsController

  setup do
    @request.session[:current_account] = accounts(:curated)
  end

  def test_routings
    assert_routing 'posts', controller: 'posts', action: 'index'
    assert_routing posts_tagged_path(tag: 'tag', sort: 'latest', limit: '30'), controller: 'posts', action: 'index', tag: 'tag', sort: 'latest', limit: '30'
    assert_routing posts_authored_path(author: 'author', sort: 'latest', limit: '30'), controller: 'posts', action: 'index', tag: '@author', sort: 'latest', limit: '30'
    assert_routing '/posts/@web2.support/latest/30', controller: 'posts', action: 'index', author: 'web2.support', sort: 'latest', limit: '30'
    assert_routing 'posts/42/content_sandbox', controller: 'posts', action: 'content_sandbox', id: '42'
    assert_routing 'posts/content_loading', controller: 'posts', action: 'content_loading'
    assert_routing({ method: 'patch', path: '/posts/clear_read' }, controller: 'posts', action: 'clear_read')
    assert_routing({ method: 'patch', path: '/posts/clear_past_tags' }, controller: 'posts', action: 'clear_past_tags')
    assert_routing({ method: 'patch', path: '/posts/mark_all_as_read' }, controller: 'posts', action: 'mark_all_as_read')
    assert_routing({ method: 'patch', path: '/posts/ignore_all' }, controller: 'posts', action: 'ignore_all')
    assert_routing({ method: 'patch', path: '/posts/clear_ignored_tags' }, controller: 'posts', action: 'clear_ignored_tags')
    assert_routing({ method: 'patch', path: '/posts/toggle_mutes' }, controller: 'posts', action: 'toggle_mutes')
    assert_routing({ method: 'patch', path: '/posts/toggle_only_favorite_tags' }, controller: 'posts', action: 'toggle_only_favorite_tags')
    assert_routing({ method: 'patch', path: '/posts/42/mark_as_read' }, controller: 'posts', action: 'mark_as_read', id: '42')
    assert_routing({ method: 'patch', path: '/posts/42/mark_as_unread' }, controller: 'posts', action: 'mark_as_unread', id: '42')
    assert_routing({ method: 'delete', path: '/posts/tag/clear_past_tag' }, controller: 'posts', action: 'clear_past_tag', id: 'tag')
  end

  test 'index renders the legacy inbox preview controls' do
    get :index

    assert_response :success
    assert_includes response.body, 'Diff'
    assert_includes response.body, 'file-diff'
    assert_not_includes response.body, 'scribe.hivekings.com'
  end

  test 'legacy index hides active posts by poisoned pill authors' do
    accounts(:curated).poisoned_pill_tags.create!(tag: 'deplorable')
    create_post_with_tag(author: 'bob', permlink: 'deplorable-post', title: 'Bob Used Deplorable', tag: 'deplorable')
    create_post_with_tag(author: 'bob', permlink: 'ordinary-post', title: 'Bob Ordinary Noise', tag: 'haf')
    create_post_with_tag(author: 'carol', permlink: 'expired-deplorable-post', title: 'Carol Old Deplorable', tag: 'deplorable', created_at: 8.days.ago)
    create_post_with_tag(author: 'carol', permlink: 'ordinary-post', title: 'Carol Ordinary Post', tag: 'haf')

    get :index

    assert_response :success
    assert_not_includes response.body, 'Bob Used Deplorable'
    assert_not_includes response.body, 'Bob Ordinary Noise'
    assert_not_includes response.body, 'Carol Old Deplorable'
    assert_includes response.body, 'Carol Ordinary Post'
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
end
