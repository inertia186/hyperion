require 'test_helper'

class PostsControllerTest < ActionDispatch::IntegrationTest
  def test_routings
    assert_routing 'posts', controller: 'posts', action: 'index'
    assert_routing posts_tagged_path(tag: 'tag', sort: 'latest', limit: '30'), controller: 'posts', action: 'index', tag: 'tag', sort: 'latest', limit: '30'
    assert_routing posts_authored_path(author: 'author', sort: 'latest', limit: '30'), controller: 'posts', action: 'index', tag: '@author', sort: 'latest', limit: '30'
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
end
