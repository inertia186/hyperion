class Api::V1::PostsController < Api::V1::BaseController
  def index
    result = PostCurationQuery.new(account: current_account, params: params, session: session).call

    render json: {
      query: result.query_state,
      pagination: {
        page: result.page,
        limit: result.limit,
        total_count: result.total_count,
        total_pages: (result.total_count.to_f / result.limit).ceil
      },
      mode_counts: result.mode_counts,
      posts: result.posts.map { |post| post_json(post, result) },
      related_tags: result.related_tags,
      related_authors: result.related_authors,
      ignored_tags: result.ignored_tags,
      poisoned_pill_tags: result.poisoned_pill_tags,
      favorite_tags: result.favorite_tag_set.to_a,
      past_tags: result.past_tags,
      counts: {
        read_posts: current_account.read_posts.count,
        ignored_tags: result.ignored_tags.size,
        poisoned_pill_tags: result.poisoned_pill_tags.size,
        muted_posts: result.muted_posts_count,
        tags: TagCount.count
      }
    }
  end

  def show
    post = Post.find(params[:id])
    post.load_body!

    if post.body.to_s =~ Post::DIFF_MATCH_PATCH_PATTERN
      post.fetch_latest
      post.save
    end

    render json: post_detail_json(post, post.display_post)
  end

  def revisions
    post = Post.find(params[:id])
    post.load_body!
    display_post = post.display_post
    display_post.load_body! if display_post.persisted?

    revisions = HafbePostRevisions.new.call(
      post: display_post,
      local_body: display_post.display_body,
      render_body: ->(body) { render_post_body(display_post, body) }
    )

    render json: {
      post_id: post.id,
      author: display_post.author,
      permlink: display_post.permlink,
      title: display_post.title,
      revisions: revisions
    }
  rescue HafbePostRevisions::MissingBaseUrl
    render json: {error: 'Diff service is not configured.'}, status: :service_unavailable
  rescue HafbePostRevisions::FetchError => e
    render json: {error: e.message}, status: :bad_gateway
  end

  def mark_read
    current_account.mark_post_as_read!(params[:id])

    render json: {id: params[:id].to_i, read: true, read_posts_count: current_account.read_posts.count}
  end

  def mark_unread
    current_account.mark_post_as_unread!(params[:id])

    render json: {id: params[:id].to_i, read: false, read_posts_count: current_account.read_posts.count}
  end

  def mark_many_read
    if truthy?(params[:all_matching])
      query_params = params[:query].presence || {}
      result = PostCurationQuery.new(account: current_account, params: query_params.merge(page: 1), session: session, track_past_tags: false).call
      marked_count = 0

      result.all_posts.find_each do |post|
        current_account.mark_post_as_read!(post.id)
        marked_count += 1
      end

      render json: {all_matching: true, marked_count: marked_count, read: true, read_posts_count: current_account.read_posts.count}
      return
    end

    post_ids = [params[:post_ids]].flatten.compact
    post_ids.each { |id| current_account.mark_post_as_read!(id) }

    render json: {post_ids: post_ids.map(&:to_i), read: true, read_posts_count: current_account.read_posts.count}
  end

private
  def truthy?(value)
    value == true || value.to_s == 'true' || value.to_s == '1'
  end

  def post_json(post, result)
    display_post = post.display_post(result.post_bodies[post.id])
    display_community = display_post == post ? nil : Community.find_by(name: display_post.category)
    display_category_name = display_community&.title || (result.post_communities[display_post.category] || {})[:name] || display_post.category
    display_category_image_url = display_community&.profile_image_url || (result.post_communities[display_post.category] || {})[:image_url]
    thumbnail_url = display_post == post ? post.post_image_url(result.post_bodies[post.id]) : display_post.post_image_url

    tags = (result.post_tags[post.id] || []).map do |(_post_id, tag, category)|
      community = result.post_communities[tag] || {}
      {tag: tag, name: community[:name] || tag, image_url: community[:image_url], category: category}
    end

    {
      id: post.id,
      param: post.to_param,
      author: display_post.author,
      permlink: display_post.permlink,
      title: display_post.title,
      category: display_post.category,
      category_name: display_category_name,
      category_image_url: display_category_image_url,
      tags: tags,
      tags_count: post.tags_count,
      thumbnail_url: thumbnail_url,
      author_avatar_url: display_post.author_avatar_url,
      placeholder_image_url: post.placeholder_image_url,
      canonical_url: display_post.canonical_url,
      app: display_post.app,
      created_at: display_post.created_at.iso8601,
      updated_at: display_post.updated_at&.iso8601 || post.updated_at.iso8601,
      deleted: post.deleted?,
      blacklisted: effective_blacklist_reasons(post.blacklist_reasons).any?,
      blacklist_reasons: blacklist_reasons_json(effective_blacklist_reasons(post.blacklist_reasons)),
      read: result.read_post_ids.include?(post.id),
      muted_author: current_account.muted_authors.include?(display_post.author)
    }
  end

  def post_detail_json(post, display_post = post)
    display_community = Community.find_by(name: display_post.category)
    display_category_name = display_community&.title || display_post.category
    display_category_image_url = display_community&.profile_image_url

    {
      id: post.id,
      param: post.to_param,
      author: display_post.author,
      permlink: display_post.permlink,
      title: display_post.title,
      category: display_post.category,
      category_name: display_category_name,
      category_image_url: display_category_image_url,
      app: display_post.app,
      created_at: display_post.created_at.iso8601,
      deleted: post.deleted?,
      blacklisted: effective_blacklist_reasons(post.blacklist_reasons).any?,
      blacklist_reasons: blacklist_reasons_json(effective_blacklist_reasons(post.blacklist_reasons)),
      read: current_account.post_read?(post.id),
      body_html: post_body(post).to_s,
      content_sandbox_url: content_sandbox_post_path(post, pp: :skip),
      canonical_url: display_post.canonical_url,
      display_post: {
        id: display_post.id,
        author: display_post.author,
        permlink: display_post.permlink,
        title: display_post.title,
        category: display_post.category,
        category_name: display_category_name,
        category_image_url: display_category_image_url,
        app: display_post.app,
        canonical_url: display_post.canonical_url
      },
      urls: {
        canonical: display_post.canonical_url,
        hive_blog: "https://hive.blog/#{display_post.category}/@#{display_post.author}/#{display_post.permlink}",
        peakd: "https://peakd.com/#{display_post.category}/@#{display_post.author}/#{display_post.permlink}",
        hiveblocks: display_post.deleted? ? "https://hiveblocks.com/tx/#{display_post.trx_id}" : "https://hiveblocks.com/#{display_post.category}/@#{display_post.author}/#{display_post.permlink}",
        hive_db: "https://hivehub.dev/#{display_post.category}/@#{display_post.author}/#{display_post.permlink}"
      }
    }
  end

  def blacklist_reasons_json(reasons)
    reasons = Array(reasons)
    community_names = reasons.map { |reason| reason['community'] || reason[:community] }.compact
    communities = Community.where(name: community_names).pluck(:name, :title).to_h

    reasons.map do |reason|
      community = reason['community'] || reason[:community]
      reason.merge('name' => communities[community] || community)
    end
  end

  def effective_blacklist_reasons(reasons)
    enabled_sources = current_account.enabled_blacklist_sources
    return [] if enabled_sources.empty?

    Array(reasons).select do |reason|
      enabled_sources.include?(reason['community'] || reason[:community])
    end
  end
end
