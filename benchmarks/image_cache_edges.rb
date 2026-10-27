require 'json'
require 'digest'
require 'tmpdir'
require 'minitest/mock'

output = Pathname(ENV.fetch('HILLS_OUTPUT'))
raise 'Test environment and unused output required' unless Rails.env.test? && !output.exist?
report = {ruby: RUBY_DESCRIPTION, source_sha256: Digest::SHA256.file(Rails.root.join('app/services/image_proxy.rb')).hexdigest,
          harness_sha256: Digest::SHA256.file(__FILE__).hexdigest, cases: []}
body = 'i'.b * 1024
Resolv.stub(:getaddresses, ['93.184.216.34']) do
  [100, 1000, 10000].each do |size|
    Dir.mktmpdir('hyperion-image-edges-') do |directory|
      root = Pathname(directory)
      key = ->(url) { Digest::SHA256.hexdigest(JSON.generate({url: url, size: nil})) }
      size.times do |i|
        url = "https://example.com/#{i}.png"
        root.join(key.call(url) + '.bin').binwrite(body)
        root.join(key.call(url) + '.json').write(JSON.generate({fetched_at: Time.current.iso8601, content_type: 'image/png'}))
      end
      request = ->(url, fetcher) { ImageProxy.new(url: url, cache_root: root, fetcher: fetcher).call }
      target = 'https://example.com/0.png'
      request.call(target, ->(_) { raise 'Unexpected initial fetch' })
      %w(expired_requested corrupt_requested concurrent_hits concurrent_misses).each do |scenario|
        samples = []
        3.times do |iteration|
          fetches = Queue.new
          fetcher = ->(_) { fetches << true; {body: body, content_type: 'image/png'} }
          metadata = root.join(key.call(target) + '.json')
          metadata.write(JSON.generate({fetched_at: 8.days.ago.iso8601, content_type: 'image/png'})) if scenario == 'expired_requested'
          metadata.write('{broken') if scenario == 'corrupt_requested'
          started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          if scenario.start_with?('concurrent')
            entered = Queue.new
            resume = Queue.new
            url = scenario == 'concurrent_hits' ? target : "https://example.com/parallel-#{iteration}.png"
            parallel_fetcher = ->(_) { entered << true; resume.pop; fetcher.call(nil) }
            threads = 2.times.map { Thread.new { request.call(url, parallel_fetcher) } }
            begin
              Timeout.timeout(30) { 2.times { entered.pop } } if scenario == 'concurrent_misses'
              2.times { resume << true }
              results = threads.map(&:value)
            ensure
              2.times { resume << true }
              threads.each(&:join)
            end
          else
            results = [request.call(target, fetcher)]
          end
          elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000
          raise 'Wrong image result' unless results.all? { |r| r.body == body && r.content_type == 'image/png' }
          expected = scenario == 'concurrent_hits' ? 0 : scenario == 'concurrent_misses' ? 2 : 1
          raise 'Wrong upstream count' unless fetches.size == expected
          raise 'Cache unusable after request' unless request.call(results.size == 2 && scenario == 'concurrent_misses' ? url : target, ->(_) { raise 'Unexpected replay fetch' }).body == body
          samples << {wall_ms: elapsed, fetches: fetches.size}
        end
        report[:cases] << {initial_entries: size, scenario: scenario, samples: samples}
        puts "#{size} #{scenario} complete"
      end
    end
  end
end
output.write(JSON.pretty_generate(report) + "\n")
