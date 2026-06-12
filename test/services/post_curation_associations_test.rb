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
end
