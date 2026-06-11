class PostTimelineQuery
  SERIES = {
    unfiltered: {label: 'Unfiltered'},
    deleted: {label: 'Deleted'},
    blacklisted: {label: 'Blacklisted'}
  }.freeze
  BUCKET_COUNT = 168

  attr_reader :time_zone, :started_at, :ended_at, :buckets, :summary

  def initialize(account:, params: {})
    @account = account
    @params = params
  end

  def call
    @time_zone = resolve_time_zone(params[:time_zone])
    build_window
    build_buckets
    build_summary
    self
  end

private
  attr_reader :account, :params, :start_hour, :end_hour

  def resolve_time_zone(value)
    Time.find_zone(value.to_s.presence) || Time.zone
  rescue TZInfo::InvalidTimezoneIdentifier
    Time.zone
  end

  def build_window
    @end_hour = Time.current.in_time_zone(time_zone).beginning_of_hour
    @start_hour = end_hour - (BUCKET_COUNT - 1).hours
    @started_at = start_hour.iso8601
    @ended_at = (end_hour + 1.hour).iso8601
  end

  def build_buckets
    empty_buckets = (0...BUCKET_COUNT).map do |index|
      starts_at = start_hour + index.hours
      [
        bucket_key(starts_at),
        {
          starts_at: starts_at.iso8601,
          series: empty_series
        }
      ]
    end.to_h

    SERIES.each_key do |series_key|
      aggregate(series_key).each do |bucket, posts_count, payout_sum, payout_count, missing_payout_count, net_rshares_sum, net_rshares_count, missing_net_rshares_count|
        bucket_data = empty_buckets[bucket_key(bucket)]
        next unless bucket_data

        bucket_data[:series][series_key] = {
          posts_count: posts_count.to_i,
          payout_sum: decimal_string(payout_sum),
          payout_count: payout_count.to_i,
          missing_payout_count: missing_payout_count.to_i,
          net_rshares_sum: decimal_string(net_rshares_sum),
          net_rshares_count: net_rshares_count.to_i,
          missing_net_rshares_count: missing_net_rshares_count.to_i
        }
      end
    end
    reward_share_authors.each do |series_key, authors_by_bucket|
      authors_by_bucket.each do |bucket, authors|
        bucket_data = empty_buckets[bucket]
        next unless bucket_data

        bucket_data[:series][series_key][:reward_share_authors] = authors
      end
    end

    @buckets = empty_buckets.values
  end

  def build_summary
    @summary = SERIES.keys.index_with do |series_key|
      buckets.reduce(empty_metric) do |memo, bucket|
        metrics = bucket[:series][series_key]
        {
          posts_count: memo[:posts_count] + metrics[:posts_count],
          payout_sum: decimal_string(BigDecimal(memo[:payout_sum]) + BigDecimal(metrics[:payout_sum])),
          payout_count: memo[:payout_count] + metrics[:payout_count],
          missing_payout_count: memo[:missing_payout_count] + metrics[:missing_payout_count],
          net_rshares_sum: decimal_string(BigDecimal(memo[:net_rshares_sum]) + BigDecimal(metrics[:net_rshares_sum])),
          net_rshares_count: memo[:net_rshares_count] + metrics[:net_rshares_count],
          missing_net_rshares_count: memo[:missing_net_rshares_count] + metrics[:missing_net_rshares_count]
        }
      end
    end
  end

  def aggregate(series_key)
    relation_for(series_key).
      group(Arel.sql(bucket_sql)).
      order(Arel.sql(bucket_sql)).
      pluck(
        Arel.sql("#{bucket_sql} AS bucket"),
        Arel.sql('COUNT(*) AS posts_count'),
        Arel.sql('COALESCE(SUM(posts.payout_amount), 0) AS payout_sum'),
        Arel.sql('COUNT(posts.payout_amount) AS payout_count'),
        Arel.sql('COUNT(*) - COUNT(posts.payout_amount) AS missing_payout_count'),
        Arel.sql('COALESCE(SUM(posts.net_rshares), 0) AS net_rshares_sum'),
        Arel.sql('COUNT(posts.net_rshares) AS net_rshares_count'),
        Arel.sql('COUNT(*) - COUNT(posts.net_rshares) AS missing_net_rshares_count')
      )
  end

  def relation_for(series_key)
    relation = Post.where(created_at: start_hour.utc...(end_hour + 1.hour).utc)

    case series_key
    when :deleted
      relation.deleted
    when :blacklisted
      blacklist_sources = account.blacklist_sources
      if blacklist_sources.empty?
        relation.where('posts.blacklisted = TRUE')
      else
        relation.where(blacklisted_relation_sql, blacklist_sources)
      end
    else
      relation
    end
  end

  def blacklisted_relation_sql
    "posts.blacklisted = TRUE OR EXISTS (SELECT 1 FROM json_array_elements(posts.blacklist_reasons) AS blacklist_reason WHERE blacklist_reason->>'account' IN (?))"
  end

  def reward_share_authors
    SERIES.keys.index_with do |series_key|
      relation_for(series_key).
        where('posts.net_rshares > 0').
        group(Arel.sql(bucket_sql), :author).
        pluck(Arel.sql("#{bucket_sql} AS bucket"), :author, Arel.sql('SUM(posts.net_rshares) AS author_net_rshares')).
        group_by { |bucket, _author, _net_rshares| bucket_key(bucket) }.
        transform_values do |rows|
          rows.
            sort_by { |_bucket, _author, net_rshares| -BigDecimal(net_rshares.to_s) }.
            first(3).
            map { |_bucket, author, _net_rshares| author }
        end
    end
  end

  def bucket_sql
    quoted_zone = ActiveRecord::Base.connection.quote(time_zone.tzinfo.name)
    "date_trunc('hour', posts.created_at AT TIME ZONE 'UTC' AT TIME ZONE #{quoted_zone})"
  end

  def bucket_key(value)
    value.strftime('%Y-%m-%d %H:00:00')
  end

  def empty_series
    SERIES.keys.index_with { empty_metric }
  end

  def empty_metric
    {
      posts_count: 0,
      payout_sum: '0.0',
      payout_count: 0,
      missing_payout_count: 0,
      net_rshares_sum: '0.0',
      net_rshares_count: 0,
      missing_net_rshares_count: 0,
      reward_share_authors: []
    }
  end

  def decimal_string(value)
    BigDecimal(value.to_s).to_s('F')
  end
end
