class HafsqlPostIndexer
  MAX_TAGS = PostIndexJob::MAX_TAGS
  SWEEP_INTERVAL = 1.hour
  BATCH_SIZE = 1000
  STATE_NAME = 'hafsql_posts'
  RELATION_PATTERN = /\A[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?\z/

  Row = Struct.new(
    :id, :author, :permlink, :title, :body, :category, :metadata, :block_num,
    :trx_id, :created_at, :updated_at, :deleted_at, keyword_init: true
  )

  def perform
    ensure_configured!
    validate_relation!

    state = IndexerState.fetch!(STATE_NAME)
    sweep = sweep_due?(state)

    Post.transaction do
      rows = fetch_rows(state, sweep)
      rows.each { |row| upsert_post(row) }

      state.last_id = rows.map(&:id).compact.max || state.last_id
      state.last_indexed_at = rows.map(&:updated_at).compact.max || state.last_indexed_at
      state.last_sweep_at = Time.current if sweep
      state.save!

      PostCleanupJob.perform_later if sweep
    end
  end

  def fetch_body(author, permlink)
    ensure_configured!

    result = HafsqlRecord.connection.exec_query(
      "SELECT #{quote_column(body_column)} AS body FROM #{quoted_relation} WHERE #{quote_column(author_column)} = $1 AND #{quote_column(permlink_column)} = $2 LIMIT 1",
      'HafSQL body fetch',
      [
        ActiveRecord::Relation::QueryAttribute.new('author', author, ActiveRecord::Type::String.new),
        ActiveRecord::Relation::QueryAttribute.new('permlink', permlink, ActiveRecord::Type::String.new)
      ]
    )

    result.first&.fetch('body')
  end

private
  def fetch_rows(state, sweep)
    predicates = ["#{quote_column(parent_author_column)} = ''", "#{quote_column(created_column)} >= $1"]
    binds = [
      ActiveRecord::Relation::QueryAttribute.new('window_start', 7.days.ago.utc, ActiveRecord::Type::DateTime.new)
    ]

    unless sweep || state.last_indexed_at.nil?
      predicates << "#{updated_expression} >= $2"
      binds << ActiveRecord::Relation::QueryAttribute.new('last_indexed_at', state.last_indexed_at.utc - 5.minutes, ActiveRecord::Type::DateTime.new)
    end

    result = HafsqlRecord.connection.exec_query(
      <<~SQL.squish,
        SELECT
          #{select_expr(id_column, 'id')},
          #{select_expr(author_column, 'author')},
          #{select_expr(permlink_column, 'permlink')},
          #{select_expr(title_column, 'title')},
          NULL AS #{quote_column('body')},
          #{select_expr(category_column, 'category')},
          #{select_expr(metadata_column, 'metadata')},
          #{select_expr(block_num_column, 'block_num')},
          #{select_expr(trx_id_column, 'trx_id')},
          #{select_expr(created_column, 'created_at')},
          #{updated_expression} AS #{quote_column('updated_at')},
          #{deleted_at_expression} AS #{quote_column('deleted_at')}
        FROM #{quoted_relation}
        WHERE #{predicates.join(' AND ')}
        ORDER BY #{updated_expression} ASC
        LIMIT #{BATCH_SIZE}
      SQL
      'HafSQL post index',
      binds
    )

    result.map { |attributes| build_row(attributes) }
  end

  def upsert_post(row)
    return if PostIndexJob::DEPLORABLES.include?(row.author)

    post = Post.find_or_initialize_by(author: row.author, permlink: row.permlink)
    post.assign_attributes(
      title: row.title.to_s,
      body: post.body,
      category: row.category.to_s,
      metadata: row.metadata,
      block_num: row.block_num.to_i,
      trx_id: row.trx_id.to_s,
      blacklisted: PostIndexJob.new.blacklist.include?(row.author),
      created_at: row.created_at,
      deleted_at: row.deleted_at
    )
    post.save!

    replace_tags(post, row.category, row.metadata)
  end

  def replace_tags(post, category, metadata)
    tags = [category] + ([metadata.fetch('tags')].flatten rescue [])
    tags = tags.map(&:to_s).map(&:downcase).reject(&:blank?).uniq.first(MAX_TAGS)
    tags = tags.reject { |tag| tag.size > 32 }

    post.tags.where.not(tag: tags).destroy_all

    tags.each do |tag|
      record = post.tags.find_or_initialize_by(tag: tag)
      record.category = tag == category.to_s.downcase
      record.save!
    end
  end

  def build_row(attributes)
    Row.new(
      id: attributes['id'],
      author: attributes['author'],
      permlink: attributes['permlink'],
      title: attributes['title'],
      body: attributes['body'],
      category: attributes['category'],
      metadata: parse_metadata(attributes['metadata']),
      block_num: attributes['block_num'] || 0,
      trx_id: attributes['trx_id'] || '',
      created_at: attributes['created_at'],
      updated_at: attributes['updated_at'] || attributes['created_at'],
      deleted_at: attributes['deleted_at']
    )
  end

  def parse_metadata(metadata)
    case metadata
    when Hash then metadata
    when String then JSON[metadata] rescue {}
    else
      {}
    end
  end

  def sweep_due?(state)
    state.last_sweep_at.nil? || state.last_sweep_at < SWEEP_INTERVAL.ago
  end

  def validate_relation!
    HafsqlRecord.connection.exec_query("SELECT 1 FROM #{quoted_relation} LIMIT 0")
  end

  def ensure_configured!
  end

  def updated_expression
    if updated_column.present?
      "COALESCE(#{quote_column(updated_column)}, #{quote_column(created_column)})"
    else
      quote_column(created_column)
    end
  end

  def deleted_at_expression
    if deleted_at_column.present?
      quote_column(deleted_at_column)
    elsif deleted_column.present?
      "CASE WHEN #{quote_column(deleted_column)} THEN #{updated_expression} ELSE NULL END"
    else
      'NULL'
    end
  end

  def select_expr(column, alias_name)
    if column.present?
      "#{quote_column(column)} AS #{quote_column(alias_name)}"
    else
      "NULL AS #{quote_column(alias_name)}"
    end
  end

  def quoted_relation
    unless relation =~ RELATION_PATTERN
      raise ArgumentError, "Invalid HAFSQL_COMMENTS_RELATION: #{relation.inspect}"
    end

    relation.split('.').map { |part| HafsqlRecord.connection.quote_table_name(part) }.join('.')
  end

  def quote_column(column)
    unless column.to_s =~ /\A[a-zA-Z_][a-zA-Z0-9_]*\z/
      raise ArgumentError, "Invalid HafSQL column name: #{column.inspect}"
    end

    HafsqlRecord.connection.quote_column_name(column)
  end

  def relation = ENV.fetch('HAFSQL_COMMENTS_RELATION', 'hafsql.comments')
  def id_column = ENV.fetch('HAFSQL_COMMENTS_ID_COLUMN', 'id')
  def author_column = ENV.fetch('HAFSQL_COMMENTS_AUTHOR_COLUMN', 'author')
  def permlink_column = ENV.fetch('HAFSQL_COMMENTS_PERMLINK_COLUMN', 'permlink')
  def title_column = ENV.fetch('HAFSQL_COMMENTS_TITLE_COLUMN', 'title')
  def body_column = ENV.fetch('HAFSQL_COMMENTS_BODY_COLUMN', 'body')
  def category_column = ENV.fetch('HAFSQL_COMMENTS_CATEGORY_COLUMN', 'category')
  def metadata_column = ENV.fetch('HAFSQL_COMMENTS_METADATA_COLUMN', 'json_metadata')
  def block_num_column = ENV['HAFSQL_COMMENTS_BLOCK_NUM_COLUMN']
  def trx_id_column = ENV['HAFSQL_COMMENTS_TRX_ID_COLUMN']
  def created_column = ENV.fetch('HAFSQL_COMMENTS_CREATED_COLUMN', 'created')
  def updated_column = ENV.fetch('HAFSQL_COMMENTS_UPDATED_COLUMN', 'last_edited')
  def deleted_at_column = ENV['HAFSQL_COMMENTS_DELETED_AT_COLUMN']
  def deleted_column = ENV.fetch('HAFSQL_COMMENTS_DELETED_COLUMN', 'deleted')
  def parent_author_column = ENV.fetch('HAFSQL_COMMENTS_PARENT_AUTHOR_COLUMN', 'parent_author')
end
