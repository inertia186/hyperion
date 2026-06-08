require 'timeout'

class Api::V1::PostsController < Api::V1::BaseController
  CHAIN_STATS_CACHE_TTL = 2.minutes
  CHAIN_STATS_TIMEOUT = ENV.fetch('CHAIN_STATS_TIMEOUT', 3).to_f

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

  def chain_stats
    post = Post.find(params[:id])
    author, permlink = chain_identity(post)

    render json: chain_stats_json(post, author, permlink)
  rescue StandardError => e
    log_chain_fetch_error(:chain_stats, e)
    render json: {
      status: 'unavailable',
      votes: nil,
      replies: nil,
      payout: nil,
      current_vote: nil
    }
  end

  def payout
    post = Post.find(params[:id])
    author, permlink = chain_identity(post, allow_override: false)

    render json: payout_json(post, author, permlink)
  rescue StandardError => e
    log_chain_fetch_error(:payout, e)
    render json: {
      status: 'unavailable',
      payout: nil
    }
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

  def chain_identity(post, allow_override: true)
    author = allow_override ? params[:author].presence : nil
    permlink = allow_override ? params[:permlink].presence : nil

    return [author, permlink] if valid_chain_identity?(author, permlink)

    [post.author, post.permlink]
  end

  def valid_chain_identity?(author, permlink)
    author.to_s.match?(/\A[a-z0-9](?:[a-z0-9.-]{1,14}[a-z0-9])?\z/) &&
      permlink.to_s.match?(/\A[a-z0-9][a-z0-9-]{0,255}\z/)
  end

  def log_chain_fetch_error(endpoint, error)
    message = "Unable to fetch #{endpoint.to_s.tr('_', ' ')} for post #{params[:id]}: #{error.class}: #{error.message}"

    if expected_chain_fetch_error?(error)
      Rails.logger.debug message
    else
      Rails.logger.warn message
    end
  end

  def expected_chain_fetch_error?(error)
    error.is_a?(Timeout::Error) ||
      (defined?(Hive::ArgumentError) && error.is_a?(Hive::ArgumentError))
  end

  def chain_stats_json(post, author, permlink)
    payload = cached_chain_stats_payload(author, permlink)
    votes = payload.fetch(:votes)
    replies = payload.fetch(:replies)
    content = payload.fetch(:content)
    current_vote = Array(votes).find { |vote| chain_value(vote, :voter) == current_account.name }
    payout = payout_value(content)
    persist_payout(post, payout)

    {
      status: 'ready',
      votes: Array(votes).count { |vote| chain_value(vote, :percent).to_i > 0 },
      replies: Array(replies).size,
      payout: payout,
      payout_amount: post.payout_amount&.to_s,
      payout_currency: post.payout_currency,
      payout_fetched_at: post.payout_fetched_at&.iso8601,
      current_vote: chain_value(current_vote, :percent)
    }
  end

  def cached_chain_stats_payload(author, permlink)
    cache_key = ['chain-stats', author, permlink]
    if truthy?(params[:refresh])
      payload = fetch_chain_stats_payload(author, permlink)
      Rails.cache.write(cache_key, payload, expires_in: CHAIN_STATS_CACHE_TTL)
      return payload
    end

    Rails.cache.fetch(cache_key, expires_in: CHAIN_STATS_CACHE_TTL, race_condition_ttl: 10.seconds) do
      fetch_chain_stats_payload(author, permlink)
    end
  end

  def fetch_chain_stats_payload(author, permlink)
    Timeout.timeout(CHAIN_STATS_TIMEOUT) do
      {
        votes: condenser_rpc(:get_active_votes, [author, permlink]),
        replies: condenser_rpc(:get_content_replies, [author, permlink]),
        content: condenser_rpc(:get_content, [author, permlink])
      }
    end
  end

  def payout_json(post, author, permlink)
    content = cached_payout_content(author, permlink)
    payout = payout_value(content)
    persist_payout(post, payout)

    {
      status: content.present? ? 'ready' : 'unavailable',
      payout: payout,
      payout_amount: post.payout_amount&.to_s,
      payout_currency: post.payout_currency,
      payout_fetched_at: post.payout_fetched_at&.iso8601
    }
  end

  def persist_payout(post, payout)
    post.capture_payout!(payout) if payout.present?
  end

  def cached_payout_content(author, permlink)
    Rails.cache.fetch(['post-payout', author, permlink], expires_in: CHAIN_STATS_CACHE_TTL, race_condition_ttl: 10.seconds) do
      Timeout.timeout(CHAIN_STATS_TIMEOUT) do
        condenser_rpc(:get_content, [author, permlink])
      end
    end
  end

  def condenser_rpc(method, args)
    response = Account.api.rpc_client.rpc_execute(:condenser_api, method, args)
    raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

    response.result
  end

  def payout_value(content)
    return nil unless content

    if chain_value(content, :cashout_time).to_s == '1969-12-31T23:59:59'
      chain_value(content, :total_payout_value)
    else
      chain_value(content, :pending_payout_value)
    end
  end

  def chain_value(object, key)
    return nil unless object

    if object.respond_to?(key)
      object.public_send(key)
    elsif object.respond_to?(:[])
      object[key.to_s] || object[key.to_sym]
    end
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
      author_reputation: display_post.author_reputation,
      payout: post.payout,
      payout_amount: post.payout_amount&.to_s,
      payout_currency: post.payout_currency,
      payout_fetched_at: post.payout_fetched_at&.iso8601,
      payout_unavailable_at: post.payout_unavailable_at&.iso8601,
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
      author_reputation: display_post.author_reputation,
      read: current_account.post_read?(post.id),
      body_markdown: display_post.display_body,
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
end
