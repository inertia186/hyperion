require 'json'
require 'digest'
require 'minitest/mock'
require 'action_dispatch/testing/integration'
require 'active_support/testing/time_helpers'
require_relative '../test/support/fake_hive'
$stdout.sync = true

class BulkReadBenchmark
  include ActiveSupport::Testing::TimeHelpers

  def run
    db = ActiveRecord::Base.connection
    raise 'Scratch database required' unless Rails.env.test? && db.select_value('SELECT current_database()') == 'hyperion_hills_test'
    output = Pathname(ENV.fetch('HILLS_OUTPUT'))
    raise 'Output already exists' if output.exist?
    travel_to Time.utc(2026, 10, 25, 12)
    FakeHive.start
    Rails.application.eager_load!
    tables = %w(agent_auth_challenges agent_access_tokens wallet_login_challenges sessions read_posts account_tags accounts tags tag_counts posts communities author_reputations indexer_states)
    db.execute("TRUNCATE #{tables.join(', ')} RESTART IDENTITY")
    account = Account.create!(name: 'bulk-curator')
    other = Account.create!(name: 'other-curator')
    _, token = AgentAccessToken.issue_for!(account)
    now = db.quote(Time.current)
    db.execute(<<~SQL)
      INSERT INTO posts (author, permlink, title, body, category, metadata, block_num, trx_id, created_at, updated_at, author_reputation)
      SELECT 'bulk-author', 'bulk-' || i, 'Bulk ' || i, 'Body', 'bulk', '{}', i, 'bulk', #{now}, #{now}, 50
      FROM generate_series(1, 10000) i
    SQL
    db.execute("INSERT INTO tags (post_id, tag, category) SELECT id, 'bulk', true FROM posts")
    TagCount.refresh!
    db.execute('ANALYZE posts')
    db.execute('ANALYZE tags')
    client = ActionDispatch::Integration::Session.new(Rails.application)
    client.host!('localhost')
    report = {recorded_at: Time.now.utc.iso8601, commit: `git rev-parse HEAD`.strip,
              working_tree: `git status --short`.lines.map(&:strip), ruby: RUBY_DESCRIPTION,
              node: `node --version`.strip, database: 'hyperion_hills_test',
              harness_sha256: Digest::SHA256.file(__FILE__).hexdigest,
              source_sha256: Dir['{app,lib}/**/*.rb'].sort.to_h { |p| [p, Digest::SHA256.file(p).hexdigest] }, runs: []}
    [:api, :agent, :legacy].each do |caller|
      [false, true].each do |all|
        [1, 100, 1000, 10000].each do |size|
          ids = (1..size).to_a
          count = caller == :api && [1, 1000].include?(size) ? 20 : 3
          params = if all
            caller == :legacy ? {mark_tag_read: ['bulk'], post_ids: [], author: 'bulk-author'} :
              {all_matching: true, query: {tag: 'bulk', author: 'bulk-author', limit: 1, page: 99}}
          else
            {post_ids: ids + [ids.first, 'invalid', 999999]}
          end
          # Bound the matching dataset outside timings; explicit and filtered paths see the same rows.
          db.execute("UPDATE tags SET tag = CASE WHEN post_id <= #{size} THEN 'bulk' ELSE 'outside' END")
          request = lambda do
            path = {api: '/api/v1/posts/read', agent: '/api/v1/agent/read', legacy: '/posts/mark_all_as_read'}.fetch(caller)
            method = caller == :agent ? :post : :patch
            client.public_send(method, path, params: params, headers: {'Authorization' => "Bearer #{token}"}, as: :json)
            expected = caller == :legacy ? 302 : 200
            raise "#{caller}: HTTP #{client.response.status}" unless client.response.status == expected
            caller == :legacy ? {location: URI(client.response.location).request_uri} : JSON.parse(client.response.body)
          end
          (count + 1).times do |iteration|
            ReadPost.delete_all
            # Pre-existing rows exercise idempotence and account isolation in every sample.
            ReadPost.insert_all!([{account_id: other.id, post_id: 1, created_at: 1.day.ago}])
            existing = ids.select { |id| id % 10 == 0 }
            ReadPost.insert_all!(existing.map { |id| {account_id: account.id, post_id: id, created_at: 1.day.ago} }) if existing.any?
            old_rows = account.read_posts.pluck(:post_id, :created_at).to_h
            ActiveRecord::Base.clear_query_caches_for_current_thread
            metric, payload = measure { request.call }
            raise 'Wrong read set' unless account.read_posts.order(:post_id).pluck(:post_id) == ids
            raise 'Other account changed' unless other.read_posts.pluck(:post_id) == [1]
            before = account.read_posts.order(:post_id).pluck(:post_id, :created_at)
            current_rows = before.to_h
            raise 'Existing timestamps changed' unless old_rows.all? { |id, timestamp| current_rows[id] == timestamp }
            replay = request.call
            raise 'Replay changed rows' unless before == account.read_posts.order(:post_id).pluck(:post_id, :created_at)
            next if iteration.zero? # warmup and correctness still checked
            report[:runs] << metric.merge(caller: caller, all_matching: all, size: size, iteration: iteration, response: payload, replay_response: replay)
          end
          output.write(JSON.pretty_generate(report))
          puts "#{caller} #{all ? 'matching' : 'ids'} #{size}: #{count} samples"
        end
      end
    end
    raise 'Unhandled RPC' unless FakeHive.stop.empty?
    raise 'Source changed during measurement' unless report[:source_sha256].all? { |p, sha| Digest::SHA256.file(p).hexdigest == sha }
    output.write(JSON.pretty_generate(report) + "\n")
  ensure
    travel_back
  end

  def measure
    metric = {sql_calls: 0, sql_ms: 0.0, transaction_ms: 0.0}
    sql = ActiveSupport::Notifications.monotonic_subscribe('sql.active_record') do |_, start, finish, _, payload|
      next if %w(SCHEMA TRANSACTION).include?(payload[:name]) || payload[:cached]
      metric[:sql_calls] += 1
      metric[:sql_ms] += (finish - start) * 1000
    end
    transaction = ActiveSupport::Notifications.monotonic_subscribe('transaction.active_record') do |_, start, finish, _, _|
      metric[:transaction_ms] += (finish - start) * 1000
    end
    allocations = GC.stat(:total_allocated_objects)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    value = yield
    metric[:wall_ms] = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000
    metric[:allocations] = GC.stat(:total_allocated_objects) - allocations
    [metric, value]
  ensure
    ActiveSupport::Notifications.unsubscribe(sql) if sql
    ActiveSupport::Notifications.unsubscribe(transaction) if transaction
  end
end

BulkReadBenchmark.new.run
