require 'set'

class PostCurationQuery
  TAG_CLOUD_LIMIT = 250
  SORTS = %w(latest oldest interesting most_tags least_tags most_prolific least_prolific highest_payout lowest_payout).freeze
  DEFAULT_SORT = 'latest'
  DEFAULT_LIMIT = 30

  attr_reader :account, :params, :session, :query_state, :relation, :all_posts,
    :posts, :post_ids, :read_post_ids, :post_tags, :post_communities,
    :post_bodies, :related_tags, :related_authors, :related_communities, :past_tags,
    :favorite_tag_set, :mode_counts, :muted_posts_count, :total_count, :page, :limit,
    :keyword_suggestion

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
    @sort = params[:sort].presence || DEFAULT_SORT
    @sort = DEFAULT_SORT unless SORTS.include?(@sort)
    @limit = [(params[:limit].presence || DEFAULT_LIMIT).to_i, 1].max
    @page = [(params[:page].presence || 1).to_i, 1].max
    @tag = [params[:tag].presence || ''].flatten.first.to_s
    @other_tags = [params[:tag].presence || ''].flatten.map(&:to_s) - [@tag]
    @query = params[:query].presence
    @author = params[:author].presence
    @app = params[:app].presence
    @only_ignored = truthy?(params[:only_ignored])
    @only_read = truthy?(params[:only_read])
    @only_keyword = truthy?(params[:only_keyword])
    @only_blacklisted = truthy?(params[:only_blacklisted])
    @only_deleted = truthy?(params[:only_deleted])

    if @tag.starts_with?('@')
      @author = @tag.split('@').last
      @tag = @tag.gsub("@#{@author}", '')
    end

    if @tag.starts_with?('app:')
      @app = @tag.split('app:').last
      @tag = @tag.gsub("app:#{@app}", '')
    end

    @tag = @tag.gsub('+', ' ')
    @tag, *@other_tags = @tag.split(' ') + @other_tags if @tag.include?(' ')
    @other_tags = @other_tags.uniq
    @tag = '' if @tag == '-'

    @without_tags = []
    @other_tags.each do |tag|
      @without_tags << tag.split('-')[1..].join('-') if tag.starts_with?('-')
    end
    @other_tags = @other_tags.reject { |tag| tag.starts_with?('-') }
    @tag_pattern = [([@tag] + @other_tags).reject(&:empty?).join('+'), @without_tags].reject(&:empty?).join('+-')

    if @track_past_tags
      [@tag].flatten.reject(&:empty?).map(&:downcase).each do |tag|
        account.past_tags.find_or_create_by(tag: tag)
      end
    end

    @query_state = {
      sort: @sort,
      limit: @limit,
      page: @page,
      tag: @tag,
      other_tags: @other_tags,
      without_tags: @without_tags,
      tag_pattern: @tag_pattern,
      query: @query,
      author: @author,
      app: @app,
      only_ignored: @only_ignored,
      only_read: @only_read,
      only_keyword: @only_keyword,
      only_blacklisted: @only_blacklisted,
      only_deleted: @only_deleted,
      muted_authors_enabled: muted_authors_enabled?,
      only_favorite_tags: only_favorite_tags?,
      minimum_reputation: minimum_reputation
    }
  end

  def build_relation
    @mode_counts = build_mode_counts
    @muted_posts_count = build_muted_posts_count
    @all_posts = relation_for_mode(selected_mode)
    @relation = apply_sort(@all_posts.select(Post::LIST_COLUMNS))
  end

  def build_mode_counts
    {
      unread: relation_for_mode(:unread).count,
      keyword: relation_for_mode(:keyword).count,
      read: relation_for_mode(:read).count,
      ignored: relation_for_mode(:ignored).count,
      deleted: relation_for_mode(:deleted).count,
      blacklisted: relation_for_mode(:blacklisted).count
    }
  end

  def build_muted_posts_count
    relation = base_filter_relation(apply_muted_filter: false).
      active.
      unread(by: account, include_muted: true)

    without_low_reputation(without_blacklist_sources(relation)).
      where(author: account.reload.muted_authors).
      count
  end

  def selected_mode
    return :read if @only_read
    return :keyword if @only_keyword
    return :ignored if @only_ignored
    return :deleted if @only_deleted
    return :blacklisted if @only_blacklisted

    :unread
  end

  def relation_for_mode(mode)
    relation = base_filter_relation(apply_keyword_filter: mode != :keyword)

    case mode
    when :read
      without_blacklist_sources(relation.active).where(id: account.read_posts.select(:post_id))
    when :keyword
      @query.present? ? keyword_filter(Post.all) : Post.all
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
      without_low_reputation(without_blacklist_sources(relation.active)).
        unread(by: account, include_muted: true).
        where.not(author: account.poisoned_authors)
    end
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

  def base_filter_relation(apply_muted_filter: true, apply_keyword_filter: true)
    relation = Post.tagged_any(@tag)
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

    relation = keyword_filter(relation) if apply_keyword_filter && @query
    relation = relation.where.not(author: account.reload.muted_authors) if apply_muted_filter && muted_authors_enabled?
    relation = relation.where(id: Tag.where(tag: account.favorite_tags.select(:tag)).select(:post_id)) if only_favorite_tags?

    relation
  end

  def keyword_filter(relation, query = @query)
    terms = keyword_terms_from(query)

    terms.reduce(relation) do |scope, term|
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(term)}%"
      scope.where('(posts.title ILIKE ? OR posts.body ILIKE ?)', pattern, pattern)
    end
  end

  def keyword_terms
    @keyword_terms ||= keyword_terms_from(@query)
  end

  def keyword_terms_from(query)
    query.to_s.split(/\s+/).map { |term| term.sub(/\A@+/, '') }.reject(&:blank?)
  end

  def load_page
    @total_count = @all_posts.count
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
    original_terms = keyword_terms
    target = original_terms.find { |term| term.length >= 3 } || original_terms.first
    return nil if target.blank?

    candidate_counts = Post.where.not(title: [nil, '']).order(created_at: :desc).limit(2000).pluck(:title).
      flat_map { |title| title.to_s.downcase.scan(/[a-z0-9][a-z0-9-]{2,}/) }.
      tally

    candidate_counts.keys.
      reject { |candidate| candidate == target.downcase }.
      map { |candidate| [candidate, levenshtein_distance(target.downcase, candidate)] }.
      select { |_candidate, distance| distance <= suggestion_distance_limit(target) }.
      sort_by { |candidate, distance| [distance, -candidate_counts.fetch(candidate), candidate] }.
      map(&:first).
      find do |candidate|
        suggestion = original_terms.map { |term| term == target ? candidate : term }.join(' ')
        return suggestion if keyword_filter(Post.all, suggestion).exists?
      end
  end

  def suggestion_distance_limit(term)
    term.length <= 4 ? 1 : 2
  end

  def levenshtein_distance(left, right)
    previous = (0..right.length).to_a

    left.chars.each_with_index do |left_char, left_index|
      current = [left_index + 1]

      right.chars.each_with_index do |right_char, right_index|
        current << [
          current[right_index] + 1,
          previous[right_index + 1] + 1,
          previous[right_index] + (left_char == right_char ? 0 : 1)
        ].min
      end

      previous = current
    end

    previous.last
  end

  def load_associations
    @read_post_ids = account.read_posts.where(post_id: post_ids).pluck(:post_id)
    @post_tags = Tag.where(post_id: post_ids).order(:id).pluck(:post_id, :tag, :category).group_by(&:first)
    @post_bodies = Post.where(id: post_ids).pluck(:id, :body).to_h
    community_names = (@posts.map(&:category) + @post_tags.values.flatten(1).map(&:second)).select { |tag| tag =~ Tag::COMMUNITY_CATEGORY_REGEX }
    @post_communities = communities_by_name(community_names.uniq)
    @related_authors = all_posts.distinct.limit(1000).order(:author).pluck(:author)
    @related_tags = load_related_tags
    related_tag_counts = load_related_tag_counts(@related_tags)
    @related_communities = communities_by_name(@related_tags.select { |tag| tag =~ Tag::COMMUNITY_CATEGORY_REGEX })
    @related_tags = @related_tags.map do |tag|
      community = @related_communities[tag] || {}
      {name: community[:name] || tag, tag: tag, count: related_tag_counts[tag].to_i, image_url: community[:image_url]}
    end
    @past_tags = account.past_tags.left_outer_joins(:community).select('account_tags.tag', 'communities.title', 'communities.community_account').map do |account_tag|
      community = community_payload(account_tag.title, account_tag.community_account)
      {name: community[:name] || account_tag.tag, tag: account_tag.tag, image_url: community[:image_url]}
    end
    @favorite_tag_set = account.favorite_tags.pluck(:tag).to_set
  end

  def communities_by_name(names)
    Community.where(name: names).index_by(&:name).transform_values do |community|
      community_payload(community.title, community.community_account)
    end
  end

  def community_payload(title, community_account)
    return {} if title.blank? && community_account.blank?

    {
      name: title,
      image_url: Community.profile_image_from_account(community_account)
    }
  end

  def load_related_tags
    tags = if @author
      Tag.related_author(@author, TAG_CLOUD_LIMIT)
    else
      Tag.related_tags(@tag, TAG_CLOUD_LIMIT)
    end

    (tags.uniq - [[@tag, '']].flatten)
  end

  def load_related_tag_counts(tags)
    return {} if tags.empty?

    if @author
      Post.joins(:tags).active.author(@author).where(tags: {tag: tags}).group('tags.tag').count
    elsif @tag.blank?
      TagCount.group_by_tag_count(tags: tags, limit: tags.size)
    else
      Post.joins(:tags).active.tagged_any(@tag).where(tags: {tag: tags}).group('tags.tag').count
    end
  end

  def apply_sort(scope)
    case @sort
    when 'latest' then scope.order(created_at: :desc)
    when 'oldest' then scope.order(created_at: :asc)
    when 'interesting' then scope.order(Arel.sql('payout_amount DESC NULLS LAST, author_reputation DESC, posts.created_at DESC'))
    when 'most_tags' then scope.order_by_tag_count(:desc)
    when 'least_tags' then scope.order_by_tag_count(:asc)
    when 'most_prolific' then scope.order_by_prolific(@tag, :DESC)
    when 'least_prolific' then scope.order_by_prolific(@tag, :ASC)
    when 'highest_payout' then scope.order_by_payout(:desc)
    when 'lowest_payout' then scope.order_by_payout(:asc)
    else scope
    end
  end

  def truthy?(value)
    value == true || value.to_s == 'true' || value.to_s == '1'
  end
end
