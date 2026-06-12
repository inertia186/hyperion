class PostCurationParams
  SORTS = PostCurationSort::SORTS
  DEFAULT_SORT = PostCurationSort::DEFAULT_SORT
  DEFAULT_LIMIT = 30

  attr_reader :sort, :limit, :page, :tag, :other_tags, :query, :author, :app,
    :only_ignored, :only_read, :only_keyword, :only_blacklisted, :only_deleted,
    :without_tags, :tag_pattern

  def initialize(params:, account:, session:, track_past_tags: true)
    @params = params
    @account = account
    @session = session
    @track_past_tags = track_past_tags
  end

  def call
    read
    track_past_tags
    self
  end

  def query_state
    {
      sort: sort,
      limit: limit,
      page: page,
      tag: tag,
      other_tags: other_tags,
      without_tags: without_tags,
      tag_pattern: tag_pattern,
      query: query,
      author: author,
      app: app,
      only_ignored: only_ignored,
      only_read: only_read,
      only_keyword: only_keyword,
      only_blacklisted: only_blacklisted,
      only_deleted: only_deleted,
      muted_authors_enabled: muted_authors_enabled?,
      only_favorite_tags: only_favorite_tags?,
      minimum_reputation: minimum_reputation
    }
  end

  def muted_authors_enabled?
    !!session[:muted_authors_enabled]
  end

  def only_favorite_tags?
    !!session[:only_favorite_tags]
  end

  def minimum_reputation
    account.minimum_reputation
  end

  private

  attr_reader :params, :account, :session

  def read
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

    extract_author_from_tag
    extract_app_from_tag
    normalize_tag_pattern
  end

  def extract_author_from_tag
    return unless tag.starts_with?('@')

    @author = tag.split('@').last
    @tag = tag.gsub("@#{author}", '')
  end

  def extract_app_from_tag
    return unless tag.starts_with?('app:')

    @app = tag.split('app:').last
    @tag = tag.gsub("app:#{app}", '')
  end

  def normalize_tag_pattern
    @tag = tag.gsub('+', ' ')
    @tag, *@other_tags = tag.split(' ') + other_tags if tag.include?(' ')
    @other_tags = other_tags.uniq
    @tag = '' if tag == '-'

    @without_tags = []
    other_tags.each do |tag_name|
      @without_tags << tag_name.split('-')[1..].join('-') if tag_name.starts_with?('-')
    end
    @other_tags = other_tags.reject { |tag_name| tag_name.starts_with?('-') }
    @tag_pattern = [([tag] + other_tags).reject(&:empty?).join('+'), without_tags].reject(&:empty?).join('+-')
  end

  def track_past_tags
    return unless @track_past_tags

    [tag].flatten.reject(&:empty?).map(&:downcase).each do |tag_name|
      account.past_tags.find_or_create_by(tag: tag_name)
    end
  end

  def truthy?(value)
    value == true || value.to_s == 'true' || value.to_s == '1'
  end
end
