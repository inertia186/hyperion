require_relative '../config/boot'
require 'simplecov'
require 'digest'
require 'time'

raise 'Coverage requires RAILS_ENV=test' unless ENV['RAILS_ENV'] == 'test'
raise 'Coverage requires PARALLEL_WORKERS=1' unless ENV.fetch('PARALLEL_WORKERS', '1') == '1'
ENV['PARALLEL_WORKERS'] = '1'

SimpleCov.start do
  root File.expand_path('..', __dir__)
  command_name 'Rails'
  coverage_dir 'coverage/rails'
  enable_coverage :branch
  track_files '{app,lib}/**/*.rb'
  add_filter do |source|
    !source.filename.end_with?('.rb') || !source.filename.start_with?("#{root}/app/", "#{root}/lib/")
  end
  # Each report describes this run, without cached results from other suites.
  use_merging false
end

arguments = ARGV.dup
SimpleCov.at_exit do
  root = "#{SimpleCov.root}/"
  expected = Dir.glob("#{root}{app,lib}/**/*.rb").sort
  missing = expected - Coverage.peek_result.keys
  raise "Coverage missed application files: #{missing.join(', ')}" unless missing.empty?

  result = SimpleCov.result
  coverage = result.to_hash.fetch('Rails').fetch('coverage').transform_keys { |path| path.delete_prefix(root) }
  raise 'Coverage file scope changed' unless coverage.keys.sort == expected.map { |path| path.delete_prefix(root) }
  report = {
    recorded_at: Time.now.utc.iso8601, ruby: RUBY_DESCRIPTION, rails: Rails.version,
    simplecov: SimpleCov::VERSION, arguments: arguments, seed: Minitest.seed, workers: 1,
    scope: '{app,lib}/**/*.rb', eager_load: true, merge_results: false,
    source_sha256: expected.to_h { |path| [path.delete_prefix(root), Digest::SHA256.file(path).hexdigest] },
    summary: {
      files: coverage.size,
      lines: {covered: result.covered_lines, total: result.total_lines},
      branches: {covered: result.covered_branches, total: result.total_branches}
    },
    coverage: coverage
  }
  File.write(File.join(SimpleCov.coverage_path, 'coverage.json'), JSON.pretty_generate(report) + "\n")
  result.format!
end
