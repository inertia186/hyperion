class HyperionAgentPostPresenter
  DEFAULT_VOTE_WEIGHT = 10_000
  EXCERPT_LENGTH = 280

  def initialize(account:)
    @account = account
  end

  def digest(post, result)
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

  def detail(post)
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

  def vote_link(post, weight)
    display_post = post.display_post

    {
      id: post.id,
      voter: account.name,
      author: display_post.author,
      permlink: display_post.permlink,
      weight: weight,
      hivesigner_url: hivesigner_vote_url(display_post, weight)
    }
  end

private
  attr_reader :account

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
end
