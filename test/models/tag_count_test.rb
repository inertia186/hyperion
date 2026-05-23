require 'test_helper'

class TagCountTest < ActiveSupport::TestCase
  test 'tag counts are maintained when tags are created and destroyed' do
    post = Post.create!(
      author: 'alice',
      permlink: 'tag-counts',
      title: 'Tag Counts',
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 1,
      trx_id: '',
      created_at: Time.current
    )

    tag = post.tags.create!(tag: 'fast', category: false)

    assert_equal 1, TagCount.find_by!(tag: 'fast').posts_count

    tag.destroy!

    assert_equal 0, TagCount.find_by!(tag: 'fast').posts_count
  end
end
