# Run after benchmarks/hills.rb with HILLS_WORKLOAD=inbox has seeded the scratch database.
require 'json'
require 'digest'
require 'zlib'
require 'active_support/testing/time_helpers'
require_relative '../test/support/fake_hive'
include ActiveSupport::Testing::TimeHelpers

connection = ActiveRecord::Base.connection
raise 'Scratch database only' unless Rails.env.test? && connection.select_value('SELECT current_database()') == 'hyperion_hills_test'
raise 'Run the inbox benchmark first' unless Post.count == 10_000
control = JSON.parse(Zlib::GzipReader.open(Rails.root.join('benchmarks/baselines/2026-10-24-keyword-control.json.gz'), &:read))
source_path = 'app/services/post_curation_query.rb'
previous = IO.popen(['git', 'show', "#{control.fetch('commit')}:#{source_path}"], &:read)
previous = previous.sub('@total_count = @all_posts.count', '@total_count = @signal.present? ? signal_counts.fetch(@signal) : mode_counts.fetch(selected_mode)')
raise 'Previous query differs from the measured control' unless Digest::SHA256.hexdigest(previous) == control.fetch('inbox_sha256').fetch(source_path)
control.fetch('inbox_sha256').except(source_path).each do |path, expected|
  raise "Other inbox code changed: #{path}" unless Digest::SHA256.file(Rails.root.join(path)).hexdigest == expected
end
Object.class_eval(previous.sub('class PostCurationQuery', 'class PreviousKeywordCurationQuery'), 'previous_post_curation_query.rb', 1)

Rails.application.eager_load!
Rails.logger.level = Logger::WARN
FakeHive.start
FakeHive.disable_hafsql_and_hafbe
report = {recorded_at: Time.now.utc.iso8601, previous_sha256: Digest::SHA256.hexdigest(previous),
          current_sha256: Digest::SHA256.file(Rails.root.join(source_path)).hexdigest,
          probe_sha256: Digest::SHA256.file(__FILE__).hexdigest, cases: {}}
travel_to(Time.utc(2026, 10, 24, 12)) do
  account = Account.find_by!(name: 'baseline-curator')
  ['needle', 'needle curation', 'Post', 'p', 'zzzxxyy'].each do |query|
    expected = nil
    samples = {before: [], after: []}
    11.times do |iteration|
      versions = {before: PreviousKeywordCurationQuery, after: PostCurationQuery}.to_a
      versions.reverse! if iteration.odd?
      versions.each do |version, klass|
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        result = klass.new(account: account, params: {only_keyword: true, query: query, limit: 30}, session: {}, track_past_tags: false).call
        elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000
        signature = [result.post_ids, result.mode_counts, result.signal_counts, result.muted_posts_count,
                     result.total_count, result.related_authors, result.keyword_suggestion]
        expected ||= signature
        raise "Response changed for #{query}" unless signature == expected
        samples.fetch(version) << elapsed.round(3) unless iteration.zero?
      end
    end
    report[:cases][query] = {total_count: expected[4], samples_ms: samples, responses_match: true}
    puts "#{query.inspect}: #{expected[4]} matches; median ms #{samples.transform_values { |values| values.sort[4] }}"
  end
end
raise 'Unhandled Hive RPC calls' unless FakeHive.stop.empty?
Rails.root.join('tmp/hills-keyword-probe.json').write(JSON.pretty_generate(report) + "\n")
