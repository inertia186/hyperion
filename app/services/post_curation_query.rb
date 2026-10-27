class PostCurationQuery
  MODES = %i(unread keyword read ignored deleted blacklisted).freeze

  attr_reader :account, :params, :session, :query_state, :relation, :all_posts,
    :posts, :post_ids, :read_post_ids, :post_tags, :post_communities,
    :post_bodies, :related_tags, :related_authors, :related_communities, :past_tags,
    :favorite_tag_set, :mode_counts, :muted_posts_count, :total_count, :page, :limit,
    :keyword_suggestion, :signal_counts

  def initialize(account:, params:, session:, track_past_tags: true)
    @account = account
    @params = params
    @session = session
    @track_past_tags = track_past_tags
  end

  def call
    read_params
    build_relation
    load_page
    build_keyword_suggestion
    load_associations
    self
  end

  def ignored_tags
    @ignored_tags ||= account.ignored_tags.pluck(:tag)
  end

  def poisoned_pill_tags
    @poisoned_pill_tags ||= account.poisoned_pill_tags.pluck(:tag)
  end

  def muted_authors_enabled?
    !!session[:muted_authors_enabled]
  end

  def only_favorite_tags?
    !!session[:only_favorite_tags]
  end

  def blacklist_sources
    @blacklist_sources ||= account.blacklist_sources
  end

  def minimum_reputation
    @minimum_reputation ||= account.minimum_reputation
  end

private
  def read_params
    curation_params = PostCurationParams.new(params: params, account: account, session: session, track_past_tags: @track_past_tags).call
    @sort = curation_params.sort
    @limit = curation_params.limit
    @page = curation_params.page
    @tag = curation_params.tag
    @other_tags = curation_params.other_tags
    @query = curation_params.query
    @author = curation_params.author
    @app = curation_params.app
    @signal = curation_params.signal
    @only_ignored = curation_params.only_ignored
    @only_read = curation_params.only_read
    @only_keyword = curation_params.only_keyword
    @only_blacklisted = curation_params.only_blacklisted
    @only_deleted = curation_params.only_deleted
    @without_tags = curation_params.without_tags
    @tag_pattern = curation_params.tag_pattern
    @query_state = curation_params.query_state
  end

  def build_relation
    if keyword_terms.any?
      build_keyword_counts
    else
      @mode_counts = build_mode_counts
      @muted_posts_count = muted_posts_relation.count
      @signal_counts = build_signal_counts
    end
    @all_posts = apply_signal(relation_for_mode(selected_mode))
    @relation = apply_sort(@all_posts.select(Post::LIST_COLUMNS))
  end

  def build_mode_counts
    MODES.index_with { |mode| relation_for_mode(mode).count }
  end

  def build_keyword_counts
    search_scope = Post.from('keyword_posts AS posts')
    scopes = MODES.index_with { |mode| relation_for_mode(mode, search_scope: search_scope) }
    scopes[:muted_posts] = muted_posts_relation(search_scope: search_scope)
    PostCurationSignal::SIGNALS.each do |signal|
      relation = signal_count_relation(signal, search_scope: search_scope)
      scopes[signal] = PostCurationSignal.apply(relation, signal: signal, tag: @tag, account: account)
    end

    connection = Post.connection
    count_sql = scopes.map do |name, scope|
      "(#{scope.reselect('COUNT(*)').to_sql}) AS #{connection.quote_column_name(name)}"
    end.join(', ')
    # All count variants reuse the same text-search scan within this statement.
    counts = connection.select_one(<<~SQL.squish, 'Keyword curation counts')
      WITH keyword_posts AS MATERIALIZED (#{search_posts.select(Post::LIST_COLUMNS).to_sql})
      SELECT #{count_sql}
    SQL
    @mode_counts = MODES.index_with { |mode| counts.fetch(mode.to_s) }
    @muted_posts_count = counts.fetch('muted_posts')
    @signal_counts = PostCurationSignal::SIGNALS.index_with { |signal| counts.fetch(signal) }
  end

  def muted_posts_relation(search_scope: search_posts)
    relation = base_filter_relation(apply_muted_filter: false, search_scope: search_scope).
      active.
      unread(by: account, include_muted: true)

    without_low_reputation(without_blacklist_sources(relation)).
      where(author: account.reload.muted_authors)
  end

  def build_signal_counts
    PostCurationSignal::SIGNALS.index_with do |signal|
      PostCurationSignal.apply(signal_count_relation(signal), signal: signal, tag: @tag, account: account).count
    end
  end

  def selected_mode
    return :read if @only_read
    return :keyword if @only_keyword
    return :ignored if @only_ignored
    return :deleted if @only_deleted
    return :blacklisted if @only_blacklisted

    :unread
  end

  def relation_for_mode(mode, include_poisoned_authors: @signal == PostCurationSignal::POISONED_PILLS, search_scope: search_posts)
    relation = base_filter_relation(search_scope: search_scope)

    case mode
    when :read
      without_blacklist_sources(relation.active).where(id: account.read_posts.select(:post_id))
    when :keyword
      search_scope
    when :ignored
      ignored_relation = without_blacklist_sources(relation.active)
      ignored_relation.where(id: Tag.where(tag: ignored_tags).select(:post_id)).
        or(ignored_relation.where(author: account.poisoned_authors)).
        or(low_reputation(ignored_relation))
    when :deleted
      relation.deleted
    when :blacklisted
      with_blacklist_sources(relation.active)
    else
      unread_relation = without_low_reputation(without_blacklist_sources(relation.active)).
        unread(by: account, include_muted: true)
      include_poisoned_authors ? unread_relation : unread_relation.where.not(author: account.poisoned_authors)
    end
  end

  def apply_signal(relation)
    PostCurationSignal.apply(relation, signal: @signal, tag: @tag, account: account)
  end

  def signal_count_relation(signal, search_scope: search_posts)
    relation_for_mode(
      selected_mode,
      include_poisoned_authors: selected_mode == :unread && signal == PostCurationSignal::POISONED_PILLS,
      search_scope: search_scope
    )
  end

  def low_reputation(relation)
    relation.where('posts.author_reputation < ?', minimum_reputation)
  end

  def without_low_reputation(relation)
    relation.where('posts.author_reputation >= ?', minimum_reputation)
  end

  def with_blacklist_sources(relation)
    return relation.none if blacklist_sources.empty?

    relation.where(blacklist_source_sql, blacklist_sources)
  end

  def without_blacklist_sources(relation)
    return relation if blacklist_sources.empty?

    relation.where("NOT #{blacklist_source_sql}", blacklist_sources)
  end

  def blacklist_source_sql
    "EXISTS (SELECT 1 FROM json_array_elements(posts.blacklist_reasons) AS blacklist_reason WHERE blacklist_reason->>'account' IN (?))"
  end

  def base_filter_relation(apply_muted_filter: true, search_scope: search_posts)
    relation = search_scope.tagged_any(@tag)
    relation = relation.tagged_all(@other_tags) if @other_tags.any?
    relation = relation.where.not(id: Tag.where(tag: @without_tags).select(:post_id)) if @without_tags.any?
    relation = relation.author(@author) if @author

    Array(@app).each do |app_name|
      relation = if app_name.starts_with?('-')
        relation.app(app_name.split('-').last, false)
      else
        relation.app(app_name)
      end
    end

    relation = relation.where.not(author: account.reload.muted_authors) if apply_muted_filter && muted_authors_enabled?
    relation = relation.where(id: Tag.where(tag: account.favorite_tags.select(:tag)).select(:post_id)) if only_favorite_tags?

    relation
  end

  def search_posts
    keyword_search.apply(Post.all)
  end

  def keyword_terms
    keyword_search.terms
  end

  def load_page
    @total_count = @signal.present? ? signal_counts.fetch(@signal) : mode_counts.fetch(selected_mode)
    @posts = @relation.offset((page - 1) * limit).limit(limit).to_a
    @post_ids = @posts.map(&:id)
  end

  def build_keyword_suggestion
    @keyword_suggestion = nil
    return unless selected_mode == :keyword
    return if total_count.positive?
    return if keyword_terms.empty?

    @keyword_suggestion = find_keyword_suggestion
  end

  def find_keyword_suggestion
    keyword_search.suggestion
  end

  def load_associations
    associations = PostCurationAssociations.new(
      account: account,
      posts: posts,
      post_ids: post_ids,
      all_posts: all_posts,
      tag: @tag,
      author: @author
    ).call
    @read_post_ids = associations.read_post_ids
    @post_tags = associations.post_tags
    @post_bodies = associations.post_bodies
    @post_communities = associations.post_communities
    @related_authors = associations.related_authors
    @related_tags = associations.related_tags
    @related_communities = associations.related_communities
    @past_tags = associations.past_tags
    @favorite_tag_set = associations.favorite_tag_set
  end

  def apply_sort(scope)
    PostCurationSort.apply(scope, sort: @sort, tag: @tag)
  end

  def keyword_search
    @keyword_search ||= PostKeywordSearch.new(@query)
  end
end
