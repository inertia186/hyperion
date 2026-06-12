class HyperionAgent
  DEFAULT_DIGEST_LIMIT = 10
  DEFAULT_VOTE_WEIGHT = HyperionAgentPostPresenter::DEFAULT_VOTE_WEIGHT
  MAX_VOTE_WEIGHT = 10_000

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
      mode_counts: result.mode_counts,
      context_matches: context_matches(result),
      posts: result.posts.map { |post| post_presenter.digest(post, result) },
      ignored_tags: result.ignored_tags,
      favorite_tags: result.favorite_tag_set.to_a
    }
  end

  def post_payload(post_id)
    post = Post.find(post_id)

    post_presenter.detail(post)
  end

  def vote_link(post_id, weight = DEFAULT_VOTE_WEIGHT)
    post = Post.find(post_id)
    normalized_weight = normalize_vote_weight(weight)

    post_presenter.vote_link(post, normalized_weight)
  end

  def mark_read(params = {})
    normalized_params = normalize_agent_params(params)

    if truthy?(normalized_params[:all_matching])
      query_params = normalize_query_params(normalized_params[:query] || {}).merge(page: 1)
      result = PostCurationQuery.new(account: account, params: query_params, session: session, track_past_tags: false).call
      marked_count = 0

      result.all_posts.find_each do |post|
        account.mark_post_as_read!(post.id)
        marked_count += 1
      end

      return {all_matching: true, marked_count: marked_count, read: true, read_posts_count: account.read_posts.count}
    end

    post_ids = normalize_post_ids(normalized_params)
    marked_count = 0
    warnings = []

    post_ids.each do |post_id|
      account.mark_post_as_read!(post_id)
      marked_count += 1
    end

    warnings << 'No usable post ids were provided.' if post_ids.empty?

    {post_ids: post_ids, marked_count: marked_count, warnings: warnings, read: true, read_posts_count: account.read_posts.count}
  end

  def ignore_tags(input)
    tags = tag_values_from(input)
    warnings = []
    before_tags = ignored_tags

    tags.each { |tag| account.ignored_tags.find_or_create_by!(tag: tag) }
    warnings << 'No usable tags were provided.' if tags.empty?

    tag_state_payload(tags: tags, changed_count: (tags - before_tags).size, warnings: warnings)
  end

  def unignore_tags(input)
    tags = tag_values_from(input)
    warnings = []
    changed_count = tags.empty? ? 0 : account.ignored_tags.where(tag: tags).destroy_all.size
    warnings << 'No usable tags were provided.' if tags.empty?

    tag_state_payload(tags: tags, changed_count: changed_count, warnings: warnings)
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

  def tag_state_payload(tags: [], changed_count: nil, warnings: [])
    {
      tags: tags,
      changed_count: changed_count,
      warnings: warnings,
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

  def context_matches(result)
    return [] if result.posts.any?

    active_context = active_context(result.query_state)

    context_match_options(result.query_state).filter_map do |option|
      next if option.fetch(:context) == active_context

      count = result.mode_counts[option.fetch(:count_key)].to_i
      next unless count.positive?

      {
        context: option.fetch(:context).to_s,
        count: count,
        query: result.query_state.merge(option.fetch(:query_updates))
      }
    end
  end

  def active_context(query_state)
    return :read if query_state[:only_read]
    return :ignored if query_state[:only_ignored]
    return :deleted if query_state[:only_deleted]
    return :blacklisted if query_state[:only_blacklisted]

    :unread
  end

  def context_match_options(query_state)
    base_false_flags = {
      only_read: false,
      only_ignored: false,
      only_deleted: false,
      only_blacklisted: false
    }

    [
      {context: :unread, count_key: :unread, query_updates: base_false_flags},
      {context: :read, count_key: :read, query_updates: base_false_flags.merge(only_read: true)},
      {context: :ignored, count_key: :ignored, query_updates: base_false_flags.merge(only_ignored: true)},
      {context: :deleted, count_key: :deleted, query_updates: base_false_flags.merge(only_deleted: true)},
      {context: :blacklisted, count_key: :blacklisted, query_updates: base_false_flags.merge(only_blacklisted: true)}
    ].reject do |option|
      option.fetch(:context) == :unread && query_state[:only_keyword]
    end
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
    Array(params[:post_ids] || params[:post_id] || params[:id] || params[:ids] || params[:post]).
      compact.
      map(&:to_i).
      reject(&:zero?).
      uniq
  end

  def tag_values_from(input)
    params = normalize_agent_params(input)
    values = params[:tags] || params[:tag] || params[:ignored_tags] || params[:ignored_tag]

    Array(values).
      flat_map { |tag| tag.to_s.split(',') }.
      map(&:downcase).
      map(&:strip).
      reject(&:blank?).
      uniq
  end

  def normalize_agent_params(input)
    values = if input.respond_to?(:to_unsafe_h)
      input.to_unsafe_h
    elsif input.respond_to?(:to_h)
      input.to_h
    else
      {}
    end

    values = values.deep_symbolize_keys
    nested_values = normalize_hash(values[:agent])
    values.merge(nested_values.deep_symbolize_keys)
  rescue NoMethodError
    {}
  end

  def normalize_hash(value)
    if value.respond_to?(:to_unsafe_h)
      value.to_unsafe_h
    elsif value.respond_to?(:to_h)
      value.to_h
    else
      {}
    end
  end

  def normalize_vote_weight(value)
    self.class.normalize_vote_weight(value)
  end

  def truthy?(value)
    value == true || value.to_s == 'true' || value.to_s == '1'
  end

  def post_presenter
    @post_presenter ||= HyperionAgentPostPresenter.new(account: account)
  end
end
