class PostMedia
  IMAGE_URL_PATTERN = /(http(s?):\/\/.*\.(jpeg|jpg|gif|png))/
  YOUTUBE_SHORT_URL_PATTERN = /http(s?):\/\/youtu.be\/(.*)/
  YOUTUBE_LONG_URL_PATTERN = /http(s?):\/\/.*youtube.com\/.*?.*v=(.*)(&?).*/
  PLACEHOLDER_IMAGE_URL = 'data:image/gif;base64,R0lGODdhAQABAPAAAMPDwwAAACwAAAAAAQABAAACAkQBADs='

  def initialize(post)
    @post = post
  end

  def post_image_url(body_override = Post::DISPLAY_BODY_UNSET)
    thumbnail_url = [post.metadata.fetch('image')].flatten[0] rescue nil
    post_body = post.display_body(body_override)

    thumbnail_url ||= if (matches = post_body.match(IMAGE_URL_PATTERN))
      matches[1]
    end

    thumbnail_url ||= if (matches = post_body.match(YOUTUBE_SHORT_URL_PATTERN))
      "https://img.youtube.com/vi/#{matches[2]}/0.jpg"
    end

    thumbnail_url ||= if (matches = post_body.match(YOUTUBE_LONG_URL_PATTERN))
      "https://img.youtube.com/vi/#{matches[2]}/0.jpg"
    end

    thumbnail_url = URI.parse(thumbnail_url).to_s rescue nil
    thumbnail_url = nil unless thumbnail_url.present?

    thumbnail_url
  end

  def thumbnail_url(body_override = Post::DISPLAY_BODY_UNSET)
    post_image_url(body_override) || PLACEHOLDER_IMAGE_URL
  end

  def placeholder_image_url
    PLACEHOLDER_IMAGE_URL
  end

  def author_avatar_url
    "https://images.hive.blog/u/#{post.author}/avatar"
  end

private
  attr_reader :post
end
