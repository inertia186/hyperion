require 'json'
require 'digest'
require 'tmpdir'
require 'timeout'

class ContentFileCacheBaseline
  Response = Struct.new(:result, :error)
  AccountStub = Struct.new(:name)
  PostStub = Struct.new(:payout_amount, :payout_currency, :payout_fetched_at, :payout_source) do
    def capture_payout!(value)
      self.payout_amount, self.payout_currency = Post.parse_payout(value)
      self.payout_fetched_at = Time.current
      self.payout_source = 'exact'
    end
  end

  class Api
    def initialize
      @calls = []
      @mutex = Mutex.new
    end

    def calls = @mutex.synchronize { @calls.dup }
    def rpc_client = self

    def rpc_execute(api, method, args)
      raise 'Unexpected API' unless api == :condenser_api
      @mutex.synchronize { @calls << {method: method, identity: args} }
      sleep(method == :get_content ? 0.03 : 0.005)
      value = case method
      when :get_active_votes then [{voter: 'file-curator', percent: 4200}]
      when :get_content_replies then []
      when :get_content then {cashout_time: '2026-10-27T12:00:00', pending_payout_value: '1.000 HBD'}
      else raise "Unexpected method #{method}"
      end
      Response.new(value, nil)
    end
  end

  def run
    raise 'Scratch database required' unless Rails.env.test? && ActiveRecord::Base.connection.select_value('SELECT current_database()') == 'hyperion_hills_test'
    output = Pathname(ENV.fetch('HILLS_OUTPUT'))
    raise 'Output exists' if output.exist?
    Rails.application.eager_load!
    report = {recorded_at: Time.now.utc.iso8601, ruby: RUBY_DESCRIPTION, rails: Rails.version,
      harness_sha256: Digest::SHA256.file(__FILE__).hexdigest,
      source_sha256: Digest::SHA256.file('app/services/post_chain_payload.rb').hexdigest,
      production_config_sha256: Digest::SHA256.file('config/environments/production.rb').hexdigest,
      framework_default_store: Rails::Application::Configuration.new(Rails.root).cache_store.first,
      scope: 'Isolated FileStore directories; separate cache/service instances; no database persistence or live deployment',
      samples_per_case: 20, content_delay_ms: 30, other_rpc_delay_ms: 5, cases: {}}
    %i(sequential concurrent).each do |scenario|
      rows = 20.times.map do
        Dir.mktmpdir('hyperion-content-cache-') do |directory|
          api = Api.new
          jobs = [:stats, :payout].map do |kind|
            lambda do
              service = PostChainPayload.new(account: AccountStub.new('file-curator'), api: api,
                cache: ActiveSupport::Cache::FileStore.new(directory), timeout: 1)
              kind == :stats ? service.chain_stats(PostStub.new, 'file-author', 'file-post') :
                service.payout(PostStub.new, 'file-author', 'file-post')
            end
          end
          started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          if scenario == :concurrent
            ready = Queue.new
            start = Queue.new
            threads = jobs.map { |job| Thread.new { ready << true; start.pop; job.call } }
            results = Timeout.timeout(2) do
              2.times { ready.pop }
              2.times { start << true }
              threads.map(&:value)
            end
          else
            results = jobs.map(&:call)
          end
          wall_ms = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000
          raise 'Wrong results' unless results.all? { |r| r[:status] == 'ready' && r[:payout] == '1.000 HBD' }
          raise 'Wrong account vote' unless results.first[:current_vote] == 4200
          {wall_ms: wall_ms, calls: api.calls, results: results}
        ensure
          threads&.each { |thread| thread.kill if thread.alive? }
          threads&.each(&:join)
        end
      end
      report[:cases][scenario] = rows
    end
    output.write(JSON.pretty_generate(report) + "\n")
    puts JSON.pretty_generate(report.except(:cases))
  end
end

ContentFileCacheBaseline.new.run
