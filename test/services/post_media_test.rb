require 'test_helper'

class PostMediaTest < ActiveSupport::TestCase
  test 'prefers metadata image over body image' do
    post = create_post(metadata: {'image' => ['https://example.com/metadata.jpg']})
    post.body = 'Body image https://example.com/body.png'

    assert_equal 'https://example.com/metadata.jpg', PostMedia.new(post).post_image_url
  end

  test 'uses first image from display body' do
    post = create_post

    assert_equal 'https://example.com/body.png', PostMedia.new(post).post_image_url('Body https://example.com/body.png')
  end

  test 'falls back to youtube thumbnail and placeholder' do
    post = create_post
    media = PostMedia.new(post)

    assert_equal 'https://img.youtube.com/vi/video-id/0.jpg', media.post_image_url('https://youtu.be/video-id')
    assert media.thumbnail_url('').starts_with?('data:image/gif')
  end

  test 'builds author avatar url' do
    assert_equal 'https://images.hive.blog/u/alice/avatar', PostMedia.new(create_post(author: 'alice')).author_avatar_url
  end

private
  def create_post(author: 'alice', metadata: {})
    Post.new(
      author: author,
      permlink: 'media-post',
      title: 'Media post',
      body: '',
      category: 'test',
      metadata: metadata,
      block_num: 1,
      trx_id: '',
      created_at: Time.current
    )
  end
end
