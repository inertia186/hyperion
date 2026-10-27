require 'json'
require 'digest'
require 'tmpdir'
require 'minitest/mock'
require 'active_support/testing/time_helpers'

# Count metadata reads without changing the production read or cleanup paths.
module ImageCacheReadCount
  def read(*args, **options)
    counter = Thread.current[:image_cache_reads]
    counter[:count] += 1 if counter && to_s.start_with?(counter[:root]) && extname == '.json'
    super
  end
end
Pathname.prepend(ImageCacheReadCount)

class ImageCacheBenchmark
  include ActiveSupport::Testing::TimeHelpers
  BODY = 'i'.b * 1024
  LOGICAL_LIMIT = 16 * 1024 * 1024
  ALLOCATED_LIMIT = 128 * 1024 * 1024

  def run
    raise 'Test environment required' unless Rails.env.test?
    output = Pathname(ENV.fetch('HILLS_OUTPUT'))
    raise 'Output already exists' if output.exist?
    report = {recorded_at: Time.now.utc.iso8601, commit: `git rev-parse HEAD`.strip,
              working_tree: `git status --short`.lines.map(&:strip), ruby: RUBY_DESCRIPTION,
              source_sha256: Digest::SHA256.file(Rails.root.join('app/services/image_proxy.rb')).hexdigest,
              harness_sha256: Digest::SHA256.file(__FILE__).hexdigest,
              limits: {cleanup_interval_seconds: 60, logical_bytes: LOGICAL_LIMIT, allocated_file_bytes: ALLOCATED_LIMIT}, cases: []}
    Resolv.stub(:getaddresses, ['93.184.216.34']) do
      2.times do |round|
        [100, 1000, 10000].each do |size|
          Dir.mktmpdir('hyperion-image-hill-') do |directory|
            root = Pathname(directory)
            start = Time.utc(2026, 10, 25, 12)
            travel_to start
            size.times do |i|
              # Up to 100 unrequested entries expire 30 seconds into the workload.
              fetched = i.positive? && i <= 100 ? start - ImageProxy::CACHE_TTL + 30 : start
              seed(root, "https://example.com/#{i}.png", fetched)
            end
            fetches = 0
            fetcher = ->(_uri) { fetches += 1; {body: BODY, content_type: 'image/png'} }
            hit_samples = []
            miss_samples = []
            occupancy = []
            180.times do |second|
              travel_to start + second
              hit = ImageProxy.new(url: 'https://example.com/0.png', cache_root: root, fetcher: fetcher)
              sample, result = measure(root) { hit.call }
              raise 'Wrong cached result' unless result.body == BODY && result.content_type == 'image/png'
              raise 'Upstream called on a hit' unless fetches == miss_samples.size
              hit_samples << sample.merge(second: second)
              if second % 10 == 5
                miss = ImageProxy.new(url: "https://example.com/miss-#{second}.png", cache_root: root, fetcher: fetcher)
                metric, result = measure(root) { miss.call }
                raise 'Wrong miss result' unless result.body == BODY && result.content_type == 'image/png'
                miss_samples << metric.merge(second: second)
                raise 'Wrong upstream count' unless fetches == miss_samples.size
              end
              if [0, 30, 59, 60, 61, 119, 120, 179].include?(second)
                files = root.children.select(&:file?)
                logical = files.sum { |p| p.size }
                allocated = files.sum { |p| p.stat.blocks * 512 }
                raise 'Space limit exceeded' if logical > LOGICAL_LIMIT || allocated > ALLOCATED_LIMIT
                remaining = (1..[size - 1, 100].min).count { |i| root.join(key("https://example.com/#{i}.png") + '.bin').exist? }
                raise 'Cleanup deadline missed' if second >= 60 && remaining.positive?
                occupancy << {second: second, logical_bytes: logical, allocated_file_bytes: allocated, expiring_bodies_remaining: remaining}
              end
            end
            report[:cases] << {round: round + 1, initial_entries: size, hits: hit_samples, misses: miss_samples,
                               upstream_fetches: fetches, occupancy: occupancy}
            output.write(JSON.pretty_generate(report) + "\n")
            puts "round #{round + 1}, #{size} entries complete"
          end
        end
      end
    end
    raise 'Source changed' unless report[:source_sha256] == Digest::SHA256.file(Rails.root.join('app/services/image_proxy.rb')).hexdigest
    output.write(JSON.pretty_generate(report) + "\n")
  ensure
    travel_back
  end

  def key(url)
    Digest::SHA256.hexdigest(JSON.generate({url: url, size: nil}))
  end

  def seed(root, url, fetched)
    basename = key(url)
    root.join(basename + '.bin').binwrite(BODY)
    root.join(basename + '.json').write(JSON.generate({source_url: url, fetch_url: url, size: nil,
      content_type: 'image/png', fetched_at: fetched.iso8601}))
  end

  def measure(root)
    counter = {root: root.to_s + '/', count: 0}
    Thread.current[:image_cache_reads] = counter
    allocations = GC.stat(:total_allocated_objects)
    start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    result = yield
    elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - start) * 1000
    [{wall_ms: elapsed, metadata_reads: counter[:count], allocations: GC.stat(:total_allocated_objects) - allocations}, result]
  ensure
    Thread.current[:image_cache_reads] = nil
  end
end

$stdout.sync = true
ImageCacheBenchmark.new.run
