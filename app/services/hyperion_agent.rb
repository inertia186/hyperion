class HyperionAgent
  DEFAULT_DIGEST_LIMIT = 10
  DEFAULT_VOTE_WEIGHT = 10_000
  MAX_VOTE_WEIGHT = 10_000
  EXCERPT_LENGTH = 280

  attr_reader :account, :session, :url_helpers

  def initialize(account:, session:, url_helpers:)
    @account = account
    @session = session
    @url_helpers = url_helpers
  end

  def session_payload
    return unauthenticated_payload unless account

    {
      authenticated: true,
      account: account_payload,
      preferences: preferences_payload,
      ignored_tags: ignored_tags,
      favorite_tags: favorite_tags,
      voting_power_url: url_helpers.voting_power_api_v1_session_path
    }
  end

  def digest(params = {})
    query_params = normalize_query_params(params).merge(sort: 'interesting')
    result = PostCurationQuery.new(account: account, params: query_params, session: session).call

    {
      query: result.query_state,
      pagination: {
        page: result.page,
        limit: result.limit,
        total_count: result.total_count,
        total_pages: (result.total_count.to_f / result.limit).ceil
      },
      posts: result.posts.map { |post| digest_post_payload(post, result) },
      ignored_tags: result.ignored_tags,
      favorite_tags: result.favorite_tag_set.to_a
    }
  end

  def post_payload(post_id)
    post = Post.find(post_id)
    post.load_body!
    display_post = post.display_post

    {
      id: post.id,
      author: display_post.author,
      permlink: display_post.permlink,
      title: display_post.title,
      excerpt: excerpt(display_post.display_body, fallback: display_post.title),
      category: display_post.category,
      tags: post.tags.order(:id).map { |tag| {tag: tag.tag, category: tag.category} },
      created_at: display_post.created_at.iso8601,
      canonical_url: display_post.canonical_url,
      body_markdown: display_post.display_body,
      read: account.post_read?(post.id),
      vote_links: vote_links(display_post)
    }
  end

  def vote_link(post_id, weight = DEFAULT_VOTE_WEIGHT)
    post = Post.find(post_id)
    display_post = post.display_post
    normalized_weight = normalize_vote_weight(weight)

    {
      id: post.id,
      voter: account.name,
      author: display_post.author,
      permlink: display_post.permlink,
      weight: normalized_weight,
      hivesigner_url: hivesigner_vote_url(display_post, normalized_weight)
    }
  end

  def mark_read(params = {})
    if truthy?(params[:all_matching])
      query_params = normalize_query_params(params[:query] || {}).merge(page: 1)
      result = PostCurationQuery.new(account: account, params: query_params, session: session, track_past_tags: false).call
      marked_count = 0

      result.all_posts.find_each do |post|
        account.mark_post_as_read!(post.id)
        marked_count += 1
      end

      return {all_matching: true, marked_count: marked_count, read: true, read_posts_count: account.read_posts.count}
    end

    post_ids = normalize_post_ids(params)
    marked_count = 0

    post_ids.each do |post_id|
      account.mark_post_as_read!(post_id)
      marked_count += 1
    end

    {post_ids: post_ids, marked_count: marked_count, read: true, read_posts_count: account.read_posts.count}
  end

  def ignore_tags(tags)
    tag_values(tags).each { |tag| account.ignored_tags.find_or_create_by!(tag: tag) }

    tag_state_payload
  end

  def unignore_tags(tags)
    account.ignored_tags.where(tag: tag_values(tags)).destroy_all

    tag_state_payload
  end

  def self.normalize_vote_weight(value)
    Integer(value.presence || DEFAULT_VOTE_WEIGHT).clamp(-MAX_VOTE_WEIGHT, MAX_VOTE_WEIGHT)
  rescue ArgumentError, TypeError
    DEFAULT_VOTE_WEIGHT
  end

private
  def unauthenticated_payload
    {
      authenticated: false,
      login_url: url_helpers.new_session_path,
      auth_challenge_url: url_helpers.api_v1_agent_auth_challenges_path
    }
  end

  def account_payload
    {
      id: account.id,
      name: account.name,
      avatar_url: "https://images.hive.blog/u/#{account.name}/avatar"
    }
  end

  def preferences_payload
    {
      muted_authors_enabled: !!session[:muted_authors_enabled],
      only_favorite_tags: !!session[:only_favorite_tags],
      theme: account.theme,
      minimum_reputation: account.minimum_reputation,
      hivesigner_available: session[:hivesigner_access_token].present?
    }
  end

  def digest_post_payload(post, result)
    display_post = post.display_post(result.post_bodies[post.id])
    body = digest_body(post, display_post, result.post_bodies[post.id])

    {
      id: post.id,
      author: display_post.author,
      permlink: display_post.permlink,
      title: display_post.title,
      excerpt: excerpt(body, fallback: display_post.title),
      category: display_post.category,
      tags: tags_payload(post, result),
      created_at: display_post.created_at.iso8601,
      canonical_url: display_post.canonical_url,
      payout: post.payout,
      payout_amount: post.payout_amount&.to_s,
      payout_currency: post.payout_currency,
      author_reputation: display_post.author_reputation,
      read: result.read_post_ids.include?(post.id),
      muted_author: account.muted_authors.include?(display_post.author),
      current_vote: nil,
      vote_links: vote_links(display_post),
      interest_reasons: interest_reasons(post, display_post)
    }
  end

  def tags_payload(post, result)
    (result.post_tags[post.id] || []).map do |(_post_id, tag, category)|
      community = result.post_communities[tag] || {}
      {tag: tag, name: community[:name] || tag, category: category}
    end
  end

  def digest_body(post, display_post, indexed_body)
    body = display_post.display_body(display_post == post ? indexed_body : Post::DISPLAY_BODY_UNSET)
    return body if body.present?
    return body unless display_post.persisted?

    full_post = Post.find(display_post.id)
    full_post.load_body!
    full_post.display_body
  rescue => e
    Rails.logger.warn "Unable to load digest body for post #{post.id}: #{e.class}: #{e.message}"
    body.to_s
  end

  def interest_reasons(post, display_post)
    reasons = []
    reasons << 'unread'
    reasons << 'known_payout' if post.payout_amount.present?
    reasons << 'high_reputation_author' if display_post.author_reputation.to_i >= 60
    reasons << 'recent' if display_post.created_at > 2.days.ago
    reasons
  end

  def vote_links(post)
    {
      upvote: hivesigner_vote_url(post, DEFAULT_VOTE_WEIGHT),
      downvote: hivesigner_vote_url(post, -DEFAULT_VOTE_WEIGHT)
    }
  end

  def hivesigner_vote_url(post, weight)
    query = URI.encode_www_form(
      authority: 'post',
      voter: account.name,
      author: post.author,
      permlink: post.permlink,
      weight: weight
    )

    "https://hivesigner.com/sign/vote?#{query}"
  end

  def excerpt(body, fallback: '')
    text = ActionController::Base.helpers.strip_tags(body.to_s)
    text = text.gsub(/\s+/, ' ').strip
    text = fallback.to_s if text.blank?
    ActionController::Base.helpers.truncate(text, length: EXCERPT_LENGTH, separator: ' ')
  end

  def tag_state_payload
    {
      ignored_tags: ignored_tags,
      favorite_tags: favorite_tags,
      past_tags: account.past_tags.pluck(:tag)
    }
  end

  def ignored_tags
    account.ignored_tags.pluck(:tag)
  end

  def favorite_tags
    account.favorite_tags.pluck(:tag)
  end

  def tag_values(tags)
    Array(tags).map(&:to_s).map(&:downcase).map(&:strip).reject(&:blank?).uniq
  end

  def normalize_query_params(params)
    values = params.respond_to?(:to_unsafe_h) ? params.to_unsafe_h : params.to_h
    values = values.symbolize_keys
    values[:limit] = [(values[:limit].presence || DEFAULT_DIGEST_LIMIT).to_i, 1].max
    values
  rescue NoMethodError
    {limit: DEFAULT_DIGEST_LIMIT}
  end

  def normalize_post_ids(params)
    Array(params[:post_ids] || params[:post_id] || params[:id] || params[:ids]).
      compact.
      map(&:to_i).
      reject(&:zero?).
      uniq
  end

  def normalize_vote_weight(value)
    self.class.normalize_vote_weight(value)
  end

  def truthy?(value)
    value == true || value.to_s == 'true' || value.to_s == '1'
  end
end
