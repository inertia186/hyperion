class Api::V1::PostSerializer
  def initialize(current_account:, url_helpers:, body_renderer:)
    @current_account = current_account
    @url_helpers = url_helpers
    @body_renderer = body_renderer
  end

  def list(post, result)
    display_post = post.display_post(result.post_bodies[post.id])
    thumbnail_url = display_post == post ? post.post_image_url(result.post_bodies[post.id]) : display_post.post_image_url

    {
      id: post.id,
      param: post.to_param,
      author: post.author,
      permlink: post.permlink,
      title: display_post.title,
      category: post.category,
      category_name: result.post_communities[post.category]&.fetch(:name, nil) || post.category,
      category_image_url: result.post_communities[post.category]&.fetch(:image_url, nil),
      tags: tags_json(post, result),
      tags_count: post.tags_count,
      thumbnail_url: thumbnail_url,
      author_avatar_url: post.author_avatar_url,
      placeholder_image_url: post.placeholder_image_url,
      canonical_url: post.canonical_url,
      app: post.app,
      created_at: post.created_at.iso8601,
      updated_at: post.updated_at.iso8601,
      deleted: post.deleted?,
      blacklisted: effective_blacklist_reasons(post.blacklist_reasons).any?,
      blacklist_reasons: blacklist_reasons_json(effective_blacklist_reasons(post.blacklist_reasons)),
      cross_post: cross_post_json(post, display_post),
      author_reputation: post.author_reputation,
      payout: post.payout,
      payout_amount: post.payout_amount&.to_s,
      payout_currency: post.payout_currency,
      payout_fetched_at: post.payout_fetched_at&.iso8601,
      payout_unavailable_at: post.payout_unavailable_at&.iso8601,
      payout_source: post.payout_source,
      read: result.read_post_ids.include?(post.id),
      muted_author: current_account.muted_authors.include?(post.author)
    }
  end

  def detail(post, display_post = post)
    community = Community.find_by(name: post.category)
    category_name = community&.title || post.category
    category_image_url = community&.profile_image_url

    {
      id: post.id,
      param: post.to_param,
      author: post.author,
      permlink: post.permlink,
      title: display_post.title,
      category: post.category,
      category_name: category_name,
      category_image_url: category_image_url,
      app: post.app,
      created_at: post.created_at.iso8601,
      deleted: post.deleted?,
      blacklisted: effective_blacklist_reasons(post.blacklist_reasons).any?,
      blacklist_reasons: blacklist_reasons_json(effective_blacklist_reasons(post.blacklist_reasons)),
      cross_post: cross_post_json(post, display_post),
      author_reputation: post.author_reputation,
      read: current_account.post_read?(post.id),
      body_markdown: display_post.display_body,
      body_html: body_renderer.call(post).to_s,
      content_sandbox_url: url_helpers.content_sandbox_post_path(post, pp: :skip),
      canonical_url: post.canonical_url,
      display_post: {
        id: display_post.id,
        author: display_post.author,
        permlink: display_post.permlink,
        title: display_post.title,
        category: display_post.category,
        category_name: display_post_category_name(display_post),
        category_image_url: display_post_category_image_url(display_post),
        app: display_post.app,
        canonical_url: display_post.canonical_url
      },
      urls: {
        canonical: post.canonical_url,
        hive_blog: "https://hive.blog/#{post.category}/@#{post.author}/#{post.permlink}",
        peakd: "https://peakd.com/#{post.category}/@#{post.author}/#{post.permlink}",
        hiveblocks: post.deleted? ? "https://hiveblocks.com/tx/#{post.trx_id}" : "https://hiveblocks.com/#{post.category}/@#{post.author}/#{post.permlink}",
        hive_db: "https://hivehub.dev/#{post.category}/@#{post.author}/#{post.permlink}"
      }
    }
  end

private
  attr_reader :current_account, :url_helpers, :body_renderer

  def tags_json(post, result)
    (result.post_tags[post.id] || []).map do |(_post_id, tag, category)|
      community = result.post_communities[tag] || {}
      {tag: tag, name: community[:name] || tag, image_url: community[:image_url], category: category}
    end
  end

  def blacklist_reasons_json(reasons)
    Array(reasons).map do |reason|
      account = reason['account'] || reason[:account]
      reason.merge('name' => account)
    end
  end

  def effective_blacklist_reasons(reasons)
    blacklist_sources = current_account.blacklist_sources
    return [] if blacklist_sources.empty?

    Array(reasons).select do |reason|
      blacklist_sources.include?(reason['account'] || reason[:account])
    end
  end

  def cross_post_json(post, display_post)
    return nil if display_post == post

    {
      author: post.author,
      permlink: post.permlink,
      source_author: display_post.author,
      source_permlink: display_post.permlink,
      source_title: display_post.title
    }
  end

  def display_post_category_name(display_post)
    community = Community.find_by(name: display_post.category)
    community&.title || display_post.category
  end

  def display_post_category_image_url(display_post)
    Community.find_by(name: display_post.category)&.profile_image_url
  end
end
