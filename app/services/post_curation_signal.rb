class PostCurationSignal
  HIGH_PROLIFIC_AUTHOR = 'high_prolific_author'
  HIGH_TAG_UTILIZATION = 'high_tag_utilization'
  POISONED_PILLS = 'poisoned_pills'
  AUTHOR_POST_THRESHOLD = 7
  TAG_COUNT_THRESHOLD = 8

  SIGNALS = [HIGH_PROLIFIC_AUTHOR, HIGH_TAG_UTILIZATION, POISONED_PILLS].freeze
  DEFAULT_SIGNAL = ''

  def self.apply(scope, signal:, tag:, account: nil)
    new(scope, signal: signal, tag: tag, account: account).apply
  end

  def self.counts(scope, tag:, account:)
    SIGNALS.index_with do |signal|
      apply(scope, signal: signal, tag: tag, account: account).count
    end
  end

  def initialize(scope, signal:, tag:, account: nil)
    @scope = scope
    @signal = SIGNALS.include?(signal) ? signal : DEFAULT_SIGNAL
    @tag = tag
    @account = account
  end

  def apply
    case signal
    when HIGH_PROLIFIC_AUTHOR then high_prolific_author
    when HIGH_TAG_UTILIZATION then high_tag_utilization
    when POISONED_PILLS then poisoned_pills
    else scope
    end
  end

private
  attr_reader :scope, :signal, :tag, :account

  def high_prolific_author
    tags = [tag].flatten.compact.reject(&:empty?)

    prolific_sql = if tags.none?
      Post.send(:sanitize_sql_array, [
        '(SELECT count(*) FROM posts distinct_author_posts WHERE distinct_author_posts.author = posts.author) >= ?',
        AUTHOR_POST_THRESHOLD
      ])
    else
      Post.send(:sanitize_sql_array, [
        '(SELECT count(*) FROM posts distinct_author_posts INNER JOIN tags ON tags.post_id = distinct_author_posts.id WHERE distinct_author_posts.author = posts.author AND tags.tag IN (?)) >= ?',
        tags,
        AUTHOR_POST_THRESHOLD
      ])
    end

    scope.where(Arel.sql(prolific_sql))
  end

  def high_tag_utilization
    scope.where(
      Arel.sql(
        Post.send(:sanitize_sql_array, [
          '(SELECT count(*) FROM tags post_tags WHERE post_tags.post_id = posts.id) >= ?',
          TAG_COUNT_THRESHOLD
        ])
      )
    )
  end

  def poisoned_pills
    return scope.none unless account

    scope.where(author: account.poisoned_authors)
  end
end
