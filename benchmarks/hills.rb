# Run with the dedicated database; see HILLS.md for setup and interpretation.
require 'json'
require 'digest'
require 'minitest/mock'
require 'action_dispatch/testing/integration'
require 'active_support/testing/time_helpers'
require_relative '../test/support/fake_hive'
$stdout.sync = true

class HillsBaseline
  include ActiveSupport::Testing::TimeHelpers

  NOW = Time.utc(2026, 10, 24, 12)
  CASES = {
    unread: {}, read: {only_read: true}, ignored: {only_ignored: true},
    deleted: {only_deleted: true}, blacklisted: {only_blacklisted: true},
    keyword: {only_keyword: true, query: 'needle'},
    tag: {tag: 'topic-1'}, combined: {tag: 'topic-1 common -extra-1', app: 'peakd'},
    author: {author: 'author-1'}, prolific: {sort: 'most_prolific'},
    tag_count: {sort: 'most_tags'}, payout: {sort: 'highest_payout'},
    page_three: {page: 3}, muted: {}, favorites: {}
  }.freeze

  def initialize
    @db = ActiveRecord::Base.connection
    unless Rails.env.test? && @db.select_value('SELECT current_database()') == 'hyperion_hills_test'
      raise 'This benchmark only runs in RAILS_ENV=test on hyperion_hills_test; it replaces scratch data.'
    end
    @samples = Integer(ENV.fetch('HILLS_SAMPLES', 30))
    @rounds = Integer(ENV.fetch('HILLS_ROUNDS', 2))
    @index_samples = Integer(ENV.fetch('HILLS_INDEX_SAMPLES', 10))
    raise 'Sample counts must be positive' unless [@samples, @rounds, @index_samples].all?(&:positive?)
    @workload = ENV.fetch('HILLS_WORKLOAD', 'all')
    raise 'HILLS_WORKLOAD must be all, inbox, or indexing' unless %w(all inbox indexing).include?(@workload)
    @output = Pathname(ENV.fetch('HILLS_OUTPUT', 'tmp/hills-baseline.json'))
    @checks = []
  end

  def run
    Rails.application.eager_load!
    Rails.logger.level = Logger::WARN
    ActiveJob::Base.queue_adapter = :test
    FakeHive.start
    FakeHive.disable_hafsql_and_hafbe
    @report = {
      recorded_at: Time.now.utc.iso8601, commit: `git rev-parse HEAD`.strip,
      harness_sha256: Digest::SHA256.file(__FILE__).hexdigest,
      indexer_sha256: Digest::SHA256.file(Rails.root.join('app/services/hafsql_post_indexer.rb')).hexdigest,
      inbox_sha256: %w(app/services/post_curation_query.rb app/services/post_curation_associations.rb
                       app/services/post_curation_signal.rb app/services/post_curation_sort.rb
                       app/serializers/api/v1/post_serializer.rb app/models/post.rb).to_h { |path|
        [path, Digest::SHA256.file(Rails.root.join(path)).hexdigest]
      },
      ruby: RUBY_DESCRIPTION, rails: Rails.version,
      postgres: @db.select_value('SELECT version()'),
      hardware: `sysctl -n hw.model hw.ncpu hw.memsize`.split,
      os: `sw_vers -productVersion`.strip, frozen_time: NOW.iso8601,
      workload: @workload, samples_per_case_per_round: @samples, rounds: @rounds, indexing_samples: @index_samples,
      checks: @checks
    }
    travel_to(NOW) do
      @report[:inbox] = inbox unless @workload == 'indexing'
      @report[:indexing] = indexing unless @workload == 'inbox'
    end
    check('no unhandled Hive RPC calls', [], FakeHive.stop)
    @output.dirname.mkpath
    @output.write(JSON.pretty_generate(@report) + "\n")
    puts "Results: #{@output}; #{@checks.count { |item| !item[:passed] }} failed correctness checks"
    exit 2 if @checks.any? { |item| !item[:passed] }
  ensure
    travel_back
  end

  private

  def check(name, expected, actual)
    @checks << {name: name, passed: expected == actual, expected: expected, actual: actual}
  end

  def reset_data
    tables = %w(agent_auth_challenges agent_access_tokens wallet_login_challenges sessions read_posts account_tags accounts tags tag_counts posts communities author_reputations indexer_states)
    @db.execute("TRUNCATE #{tables.join(', ')} RESTART IDENTITY")
    ActiveRecord::Base.clear_query_caches_for_current_thread
  end

  def measure
    metric = {sql_calls: 0, sql_cache_hits: 0, sql_ms: 0.0, transaction_ms: 0.0}
    names = Hash.new(0)
    sql = ActiveSupport::Notifications.monotonic_subscribe('sql.active_record') do |_, start, finish, _, payload|
      next if payload[:name] == 'SCHEMA' || payload[:name] == 'TRANSACTION'
      if payload[:cached]
        metric[:sql_cache_hits] += 1
      else
        metric[:sql_calls] += 1
        metric[:sql_ms] += (finish - start) * 1000
        names[payload[:name]] += 1
      end
    end
    transaction = ActiveSupport::Notifications.monotonic_subscribe('transaction.active_record') do |_, start, finish, _, _|
      metric[:transaction_ms] += (finish - start) * 1000
    end
    allocations = GC.stat(:total_allocated_objects)
    start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    value = yield
    metric[:wall_ms] = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - start) * 1000
    metric[:allocations] = GC.stat(:total_allocated_objects) - allocations
    metric[:sql_names] = names.sort.to_h
    [metric, value]
  ensure
    ActiveSupport::Notifications.unsubscribe(sql) if sql
    ActiveSupport::Notifications.unsubscribe(transaction) if transaction
  end

  def summarize(samples)
    keys = %i(wall_ms sql_calls sql_cache_hits sql_ms allocations transaction_ms)
    keys << :posts_per_second if samples.first.key?(:posts_per_second)
    keys.to_h do |key|
      values = samples.map { |sample| sample.fetch(key) }.sort
      [key, {median: values[(values.size - 1) / 2].round(3),
             p95: values[(values.size * 0.95).ceil - 1].round(3),
             min: values.first.round(3), max: values.last.round(3)}]
    end
  end

  def rss_mb
    IO.popen(['ps', '-o', 'rss=', '-p', Process.pid.to_s], &:read).to_i / 1024.0
  end

  def seed_inbox
    reset_data
    account = Account.create!(name: 'baseline-curator', muted_authors: (0...10).map { |i| "author-#{i}" }, settings: {'minimum_reputation' => 30})
    account.ignored_tags.create!(tag: 'topic-7')
    account.poisoned_pill_tags.create!(tag: 'poison')
    account.favorite_tags.create!(tag: 'topic-1')
    account.past_tags.create!(tag: 'topic-1')
    now = @db.quote(NOW)
    @db.execute(<<~SQL)
      INSERT INTO posts (author, permlink, title, body, category, metadata, block_num, trx_id,
                         created_at, updated_at, deleted_at, blacklisted, blacklist_reasons,
                         author_reputation, payout_amount)
      SELECT 'author-' || (i % 500), 'post-' || i, 'Post ' || i,
             CASE WHEN i % 13 = 0 THEN 'needle ' ELSE '' END || repeat('A curation post body. ', 50),
             'topic-' || (i % 10), json_build_object('app', CASE WHEN i % 3 = 0 THEN 'peakd/1' ELSE 'ecency/1' END),
             i, 'trx-' || i,
             #{now}::timestamp - (i % 9) * interval '1 day' - i * interval '1 second',
             #{now}::timestamp,
             CASE WHEN i % 23 = 0 THEN #{now}::timestamp END,
             i % 19 = 0,
             CASE WHEN i % 19 = 0 THEN '[{"account":"baseline-curator"}]'::json ELSE '[]'::json END,
             20 + (i % 60), CASE WHEN i % 11 != 0 THEN (i % 1000) / 100.0 END
      FROM generate_series(1, 10000) AS i
    SQL
    @db.execute(<<~SQL)
      INSERT INTO tags (post_id, tag, category)
      SELECT id, category, true FROM posts UNION ALL
      SELECT id, 'common', false FROM posts UNION ALL
      SELECT id, 'extra-' || (id % 7), false FROM posts UNION ALL
      SELECT id, 'poison', false FROM posts WHERE id % 101 = 0 UNION ALL
      SELECT id, 'heavy-' || n, false FROM posts CROSS JOIN generate_series(1, 5) AS n WHERE id % 17 = 0
    SQL
    @db.execute("INSERT INTO read_posts (post_id, account_id, created_at) SELECT id, #{account.id}, #{now} FROM posts WHERE id % 5 = 0")
    TagCount.refresh!
    %w(posts tags read_posts account_tags tag_counts accounts).each { |table| @db.execute("ANALYZE #{table}") }
    account
  end

  def inbox
    puts 'Seeding inbox: 10,000 posts, 500 authors'
    account = seed_inbox
    _, token = AgentAccessToken.issue_for!(account)
    headers = {'Authorization' => "Bearer #{token}"}
    clients = CASES.keys.to_h { |name| [name, ActionDispatch::Integration::Session.new(Rails.application)] }
    clients.each_value { |client| client.host!('localhost') }
    # Set real session preferences through the API, avoiding a live mute refresh.
    Account.class_eval { alias_method :hills_original_refresh_mutes, :refresh_muted_authors; define_method(:refresh_muted_authors) { muted_authors } }
    clients[:muted].patch('/api/v1/preferences/mute', params: {enabled: true}, headers: headers, as: :json)
    clients[:favorites].patch('/api/v1/preferences/only_favorite_tags', params: {enabled: true}, headers: headers, as: :json)
    check('mute preference setup', 200, clients[:muted].response.status)
    check('favorite preference setup', 200, clients[:favorites].response.status)
    baseline_payloads = {}
    first_requests = {}
    samples = CASES.keys.to_h { |name| [name, []] }
    request = lambda do |name|
      client = clients.fetch(name)
      metric, = measure do
        client.get('/api/v1/posts', params: {sort: 'latest', limit: 30}.merge(CASES.fetch(name)), headers: headers)
      end
      raise "#{name}: HTTP #{client.response.status}" unless client.response.status == 200
      payload = JSON.parse(client.response.body)
      # Related lists are sets; preserve the ordering of the actual post list.
      %w(related_tags related_authors past_tags favorite_tags ignored_tags poisoned_pill_tags).each do |key|
        payload[key] = payload.fetch(key).sort_by { |item| JSON.generate(item) }
      end
      digest = Digest::SHA256.hexdigest(JSON.generate(payload))
      baseline_payloads[name] ||= {digest: digest, total_count: payload.dig('pagination', 'total_count'),
                                  mode_counts: payload['mode_counts'], signal_counts: payload['signal_counts'],
                                  post_ids: payload['posts'].map { |post| post['id'] }}
      raise "#{name}: response changed between identical requests" unless baseline_payloads[name][:digest] == digest
      metric
    end
    CASES.each_key do |name|
      first_requests[name] = request.call(name)
      2.times { request.call(name) }
    end
    before_rss = rss_mb
    @rounds.times do |round|
      @samples.times do |iteration|
        CASES.keys.shuffle(random: Random.new(round * @samples + iteration)).each do |name|
          samples[name] << request.call(name).merge(round: round + 1)
        end
      end
      puts "Inbox round #{round + 1}/#{@rounds} complete"
    end
    check('inbox requests preserve response payloads', true, true)
    {posts: Post.count, tags: Tag.count, authors: 500, cases: CASES,
     first_requests: first_requests, response_contracts: baseline_payloads,
     rss_before_mb: before_rss, rss_after_mb: rss_mb,
     summary: samples.transform_values { |values| summarize(values) },
     rounds: samples.transform_values { |values| values.group_by { |item| item[:round] }.transform_values { |items| summarize(items) } },
     samples: samples}
  ensure
    Account.class_eval { alias_method :refresh_muted_authors, :hills_original_refresh_mutes; remove_method :hills_original_refresh_mutes }
  end

  def seed_source(count, tied: false)
    @db.execute('TRUNCATE hills_source.comments')
    created = @db.quote(NOW - 2.days)
    updated = @db.quote(NOW - 1.day)
    @db.execute(<<~SQL)
      INSERT INTO hills_source.comments (id, author, permlink, title, body, category, json_metadata, created, last_edited, deleted, parent_author)
      SELECT i, 'index-author-' || (i % 100), 'index-post-' || i, 'Indexed ' || i, 'Source body', 'baseline',
             json_build_object('app', 'baseline/1', 'tags', ARRAY['baseline', 'topic-' || (i % 10), 'common']),
             #{created}::timestamp + i * interval '1 second',
             #{updated}::timestamp + #{tied ? '0' : 'i'} * interval '1 second', false, ''
      FROM generate_series(1, #{Integer(count)}) AS i
    SQL
    @db.execute('ANALYZE hills_source.comments')
  end

  def reset_index
    reset_data
    AuthorReputation.insert_all!((0...100).map { |i| {account: "index-author-#{i}", reputation: 45, refreshed_at: NOW, created_at: NOW, updated_at: NOW} })
    PostIndexJob.cache_blacklist_reasons_by_account('index-author-0' => [{'account' => 'baseline-curator'}])
    IndexerState.create!(name: HafsqlPostIndexer::STATE_NAME, last_sweep_at: NOW)
  end

  def indexing
    ENV['HAFSQL_COMMENTS_RELATION'] = 'hills_source.comments'
    %w(id author permlink title body category parent_author net_rshares).each do |column|
      ENV["HAFSQL_COMMENTS_#{column.upcase}_COLUMN"] = column
    end
    {'METADATA' => 'json_metadata', 'CREATED' => 'created', 'UPDATED' => 'last_edited', 'DELETED' => 'deleted',
     'BLOCK_NUM' => '', 'TRX_ID' => '', 'DELETED_AT' => ''}.each do |key, column|
      ENV["HAFSQL_COMMENTS_#{key}_COLUMN"] = column
    end
    @db.execute('CREATE SCHEMA IF NOT EXISTS hills_source')
    @db.execute('DROP TABLE IF EXISTS hills_source.comments')
    @db.execute(<<~SQL)
      CREATE TABLE hills_source.comments (
        id bigint PRIMARY KEY, author text, permlink text, title text, body text, category text,
        json_metadata json, created timestamp, last_edited timestamp, deleted boolean, parent_author text,
        net_rshares bigint DEFAULT 1234
      )
    SQL
    # Execute the production source SQL against a real local PostgreSQL table.
    HafsqlRecord.stub(:connection, @db) do
      samples = {insert: [], replay: [], edit_delete: []}
      before_rss = rss_mb
      (@index_samples + 1).times do |iteration|
        reset_index
        seed_source(1000)
        insert_metric, = measure { HafsqlPostIndexer.new.perform }
        check("batch #{iteration} insert count", 1000, Post.count)
        check("batch #{iteration} tag count", 3000, Tag.count)
        check("batch #{iteration} blacklist count", 10, Post.where(blacklisted: true).count)
        check("batch #{iteration} reputation count", 1000, Post.where(author_reputation: 45).count)
        replay_rows = @db.select_value("SELECT count(*) FROM hills_source.comments WHERE last_edited >= (SELECT last_indexed_at - interval '5 minutes' FROM indexer_states WHERE name = 'hafsql_posts')")
        replay_metric, = measure { HafsqlPostIndexer.new.perform }
        check("batch #{iteration} idempotent replay", [1000, 3000], [Post.count, Tag.count])
        @db.execute("UPDATE hills_source.comments SET title = 'Edited ' || id, last_edited = #{@db.quote(NOW - 1.hour)}, deleted = (id % 10 = 0), json_metadata = '{\"tags\":[\"baseline\",\"changed\"]}'::json")
        edit_metric, = measure { HafsqlPostIndexer.new.perform }
        check("batch #{iteration} edited titles", 1000, Post.where("title LIKE 'Edited %'").count)
        check("batch #{iteration} deletions and replacement tags", [100, 2000, 0], [Post.deleted.count, Tag.count, Tag.where(tag: 'common').count])
        check("batch #{iteration} tag counters", {'baseline' => 1000, 'changed' => 1000}, TagCount.where('posts_count > 0').pluck(:tag, :posts_count).to_h)
        unless iteration.zero?
          samples[:insert] << insert_metric.merge(source_rows: 1000, distinct_synchronized: 1000, posts_per_second: 1_000_000.0 / insert_metric[:wall_ms])
          samples[:replay] << replay_metric.merge(source_rows: replay_rows, distinct_synchronized: 0, posts_per_second: 0)
          samples[:edit_delete] << edit_metric.merge(source_rows: 1000, distinct_synchronized: 1000, posts_per_second: 1_000_000.0 / edit_metric[:wall_ms])
        end
        puts "Indexing iteration #{iteration}/#{@index_samples} complete#{iteration.zero? ? ' (warmup)' : ''}"
      end
      result = {summary: samples.transform_values { |values| summarize(values) }, samples: samples,
                rss_before_mb: before_rss, rss_after_mb: rss_mb}
      result[:recovery] = recovery_checks
      result
    end
  end

  def recovery_checks
    reset_index
    seed_source(2500)
    progress = 5.times.map { HafsqlPostIndexer.new.perform; Post.count }
    check('multi-batch stream reaches all rows', 2500, progress.last)
    Post.find_by!(permlink: 'index-post-1200').destroy!
    sweep_recovery = 2.times.map do
      IndexerState.find_by!(name: HafsqlPostIndexer::STATE_NAME).update!(last_sweep_at: NOW - 2.hours)
      HafsqlPostIndexer.new.perform
      Post.exists?(permlink: 'index-post-1200')
    end
    check('sweep recovers a missing row beyond the first batch', true, sweep_recovery.last)

    reset_index
    seed_source(1000)
    indexer = HafsqlPostIndexer.new
    indexer.define_singleton_method(:upsert_post) do |row, reputations|
      super(row, reputations)
      raise 'injected interruption' if row.id == 501
    end
    begin
      indexer.perform
      raise 'interruption was not injected'
    rescue RuntimeError => error
      raise unless error.message == 'injected interruption'
    end
    check('interruption rolls back posts and tags', [0, 0], [Post.count, Tag.count])
    check('interruption does not advance cursor', nil, IndexerState.find_by!(name: HafsqlPostIndexer::STATE_NAME).last_indexed_at)
    HafsqlPostIndexer.new.perform
    check('restart completes interrupted batch', 1000, Post.count)

    reset_index
    seed_source(1200, tied: true)
    tied_progress = 3.times.map { HafsqlPostIndexer.new.perform; Post.count }
    check('equal timestamps across batch boundary reach all rows', 1200, tied_progress.last)
    {ordinary_stream_distinct_posts: progress, sweep_recovers_missing_row: sweep_recovery,
     tied_timestamp_distinct_posts: tied_progress}
  end
end

HillsBaseline.new.run
