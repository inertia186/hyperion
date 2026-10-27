require 'test_helper'

class PostCurationAssociationsTest < ActiveSupport::TestCase
  test 'loads list associations and tag metadata for curation results' do
    account = accounts(:curated)
    posts = [posts(:allowed_unread), posts(:read_allowed)]
    account.favorite_tags.find_or_create_by!(tag: 'haf')

    result = PostCurationAssociations.new(
      account: account,
      posts: posts,
      post_ids: posts.map(&:id),
      all_posts: Post.where(id: posts.map(&:id)),
      tag: 'haf',
      author: nil
    ).call

    assert_includes result.read_post_ids, posts(:read_allowed).id
    assert_equal posts.map(&:id).sort, result.post_bodies.keys.sort
    assert result.post_tags[posts(:allowed_unread).id].any?
    assert_includes result.related_authors, posts(:allowed_unread).author
    assert_includes result.favorite_tag_set, 'haf'
  end

  test 'formats community-backed related and past tags' do
    account = accounts(:curated)
    community = communities(:side_community)
    account.past_tags.find_or_create_by!(tag: community.name)

    result = PostCurationAssociations.new(
      account: account,
      posts: [posts(:allowed_unread)],
      post_ids: [posts(:allowed_unread).id],
      all_posts: Post.where(id: posts(:allowed_unread).id),
      tag: 'haf',
      author: nil
    ).call

    past_tag = result.past_tags.find { |tag| tag.fetch(:tag) == community.name }
    assert_equal community.title, past_tag.fetch(:name)
    assert past_tag.fetch(:image_url).present?
  end

  test 'loaded tags preserve response order and resolve cross posts without per-post queries' do
    metadata_cross_post = posts(:allowed_unread)
    metadata_cross_post.update!(metadata: {'tags' => ['cross-post']})
    tagged_cross_post = posts(:read_allowed)
    tagged_cross_post.update!(metadata: {})
    tagged_cross_post.tags.create!(tag: 'cross-post')
    untagged_post = posts(:muted_unread)
    untagged_post.update!(metadata: {})
    untagged_post.tags.destroy_all
    ids = [metadata_cross_post.id, tagged_cross_post.id, untagged_post.id]
    page = Post.where(id: ids).select(Post::LIST_COLUMNS).to_a
    expected_tags = Tag.where(post_id: ids).order(:id).pluck(:post_id, :tag, :category).group_by(&:first)

    result = PostCurationAssociations.new(
      account: accounts(:curated), posts: page, post_ids: ids,
      all_posts: Post.where(id: ids), tag: '', author: nil
    ).call

    assert_equal expected_tags, result.post_tags
    assert_no_queries do
      assert_equal(
        {metadata_cross_post.id => true, tagged_cross_post.id => true, untagged_post.id => false},
        page.to_h { |post| [post.id, post.cross_post?] }
      )
    end
  end
end
