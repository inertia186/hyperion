class PostDisplayBody
  CROSS_POST_PREAMBLE_PATTERN = /\AThis is a cross post of \[[^\]]+\]\([^)]+\) by @[^.]+\.?(?:<br\s*\/?>\s*){2}/i
  CROSS_POST_REFERENCE_PATTERN = /\AThis is a cross post of \[[^\]]+\]\((?:https?:\/\/[^\/]+)?\/(?:[^\/\s)]+\/)?@(?<author>[^\/\s)]+)\/(?<permlink>[^)\s]+)\) by @[^.]+\.?(?:<br\s*\/?>\s*){2}/i
  DISPLAY_BODY_UNSET = Object.new.freeze

  def initialize(post)
    @post = post
  end

  def display_body(body_override = DISPLAY_BODY_UNSET)
    post_body = body_for(body_override)
    return post_body unless post_body.present?
    return post_body unless post.cross_post?

    copied_body = cross_post_copied_body(post_body)
    referenced_post = display_post(post_body)
    if referenced_post != post && referenced_post.body.present?
      original_body = referenced_post.body.to_s
      return original_body if copied_body.blank? || copied_body.strip == original_body.strip

      return [original_body, copied_body].join("\n\n---\n\n")
    end

    copied_body
  end

  def display_post(body_override = DISPLAY_BODY_UNSET)
    reference = cross_post_reference(body_override)
    return post unless reference

    referenced_post = post.class.find_by(author: reference[:author], permlink: reference[:permlink])
    referenced_post ||= post.class.new(
      author: reference[:author],
      permlink: reference[:permlink],
      title: "#{reference[:author]}/#{reference[:permlink]}",
      category: post.category,
      metadata: {},
      block_num: post.block_num,
      trx_id: '',
      created_at: post.created_at || Time.current
    )

    referenced_post.persisted? ? referenced_post.load_body! : referenced_post.fetch_latest
    referenced_post.body.present? ? referenced_post : post
  rescue => e
    Rails.logger.warn "Unable to resolve cross-post display source for #{post.author}/#{post.permlink}: #{e.class}: #{e.message}"
    post
  end

  def cross_post_reference(body_override = DISPLAY_BODY_UNSET)
    post_body = body_for(body_override)
    return nil unless post_body.match?(/\AThis is a cross post of /i)
    return nil unless post.cross_post?

    match = post_body.match(CROSS_POST_REFERENCE_PATTERN)
    return nil unless match

    {author: match[:author].delete_prefix('@'), permlink: match[:permlink]}
  end

  def cross_post_copied_body(body_override = DISPLAY_BODY_UNSET)
    post_body = body_for(body_override)
    return post_body unless post_body.present? && post.cross_post?

    stripped_body = post_body.sub(CROSS_POST_PREAMBLE_PATTERN, '')
    stripped_body.present? && stripped_body != post_body ? stripped_body : post_body
  end

private
  attr_reader :post

  def body_for(body_override)
    body_override.equal?(DISPLAY_BODY_UNSET) ? (post.has_attribute?(:body) ? post.body.to_s : '') : body_override.to_s
  end
end
