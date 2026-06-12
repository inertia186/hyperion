require 'test_helper'

class PostDisplayBodyTest < ActiveSupport::TestCase
  test 'parses cross-post references from copied body' do
    post = create_post(author: 'alice', permlink: 'cross-post', tags: %w(cross-post))
    post.body = 'This is a cross post of [@bob/original](/hive-1/@bob/original) by @alice.<br><br>Copied body'

    assert_equal({author: 'bob', permlink: 'original'}, PostDisplayBody.new(post).cross_post_reference)
  end

  test 'combines referenced original body with copied body when they differ' do
    original = create_post(author: 'bob', permlink: 'original')
    original.update!(body: 'Original body')
    post = create_post(author: 'alice', permlink: 'cross-post', tags: %w(cross-post))
    post.body = 'This is a cross post of [@bob/original](/hive-1/@bob/original) by @alice.<br><br>Copied body'

    assert_equal "Original body\n\n---\n\nCopied body", PostDisplayBody.new(post).display_body
  end

private
  def create_post(author:, permlink:, tags: [])
    post = Post.create!(
      author: author,
      permlink: permlink,
      title: permlink.titleize,
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 1,
      trx_id: '',
      created_at: Time.current
    )

    tags.each { |tag| post.tags.create!(tag: tag) }
    post
  end
end
