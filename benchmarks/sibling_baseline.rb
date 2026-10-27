# Baselines only: no production substitutions; uses a rolled-back scratch transaction.
require 'json'
require 'digest'
require 'minitest/mock'
require 'action_dispatch/testing/integration'
require 'active_support/testing/time_helpers'
require_relative '../test/support/fake_hive'

class SiblingBaseline
  include ActiveSupport::Testing::TimeHelpers
  NOW = Time.utc(2026, 10, 25, 12)
  SAMPLES = 20
  Response = Struct.new(:code, :body)
  RpcResponse = Struct.new(:result, :error)

  def run
    db = ActiveRecord::Base.connection
    raise 'Scratch database required' unless Rails.env.test? && db.select_value('SELECT current_database()') == 'hyperion_hills_test'
    output = Pathname(ENV.fetch('HILLS_OUTPUT'))
    raise 'Output exists' if output.exist?
    Rails.application.eager_load!
    FakeHive.start
    @old_hafbe = ENV['HAFBE_BASE_URL']
    ENV['HAFBE_BASE_URL'] = 'https://hafbe.example'
    @report = {recorded_at: Time.now.utc.iso8601, commit: `git rev-parse HEAD`.strip,
      working_tree: `git status --short`.lines.map(&:strip), ruby: RUBY_DESCRIPTION, rails: Rails.version,
      postgres: db.select_value('SELECT version()'), frozen_time: NOW.iso8601, samples: SAMPLES,
      harness_sha256: Digest::SHA256.file(__FILE__).hexdigest,
      fixtures_sha256: Digest::SHA256.file('benchmarks/sibling_response_fixtures.json').hexdigest,
      donor_commit: `git -C ../hivetop rev-parse HEAD`.strip,
      source_sha256: Dir['{app,lib}/**/*.rb'].sort.to_h { |p| [p, Digest::SHA256.file(p).hexdigest] }}
    travel_to(NOW) do
      ActiveRecord::Base.transaction do
        @account = Account.create!(id: 2_000_000_001, name: 'sibling-curator')
        @other_account = Account.create!(id: 2_000_000_002, name: 'sibling-other')
        @normal = post('plain', '## Baseline heading\n\nReadable body')
        @original = post('original', 'Original body')
        @cross = post('cross', "This is a cross post of [Original](/@#{@original.author}/#{@original.permlink}) by @#{@original.author}.<br><br>", metadata: {'tags' => ['cross-post']})
        @report[:revisions] = revision_baseline
        @report[:content_reuse] = content_baseline
        @report[:response_validation] = validation_baseline
        raise ActiveRecord::Rollback
      end
    end
    raise 'Unhandled Hive RPC' unless FakeHive.stop.empty?
    @report[:source_unchanged] = @report[:source_sha256].all? { |p, sha| Digest::SHA256.file(p).hexdigest == sha }
    raise 'Production changed' unless @report[:source_unchanged]
    output.write(JSON.pretty_generate(@report) + "\n")
    puts JSON.pretty_generate(@report.except(:source_sha256))
  ensure
    @old_hafbe.nil? ? ENV.delete('HAFBE_BASE_URL') : ENV['HAFBE_BASE_URL'] = @old_hafbe
    FakeHive.stop if FakeHive.active?
    travel_back
  end

  def post(permlink, body, metadata: {})
    id = {'plain' => 2_000_000_011, 'original' => 2_000_000_012, 'cross' => 2_000_000_013}.fetch(permlink)
    Post.create!(id: id, author: 'sibling-author', permlink: permlink, title: permlink, body: body,
      category: 'baseline', metadata: metadata, block_num: 1, trx_id: 'baseline', created_at: NOW - 1.day)
  end

  def operation(post, body, block = 1)
    {'author' => post.author, 'permlink' => post.permlink, 'body' => body,
     'title' => post.title, 'block_num' => block, 'timestamp' => '2026-10-25T10:00:00'}
  end

  def measured
    before = GC.stat(:total_allocated_objects)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    value = yield
    {wall_ms: (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000,
     allocations: GC.stat(:total_allocated_objects) - before, value: value}
  end

  def summarize(rows)
    values = rows.map { |row| row.fetch(:wall_ms) }.sort
    {median_ms: values[(values.size - 1) / 2], p95_ms: values[(values.size * 0.95).ceil - 1], samples: rows}
  end

  def revision_baseline
    _, token = AgentAccessToken.issue_for!(@account)
    client = ActionDispatch::Integration::Session.new(Rails.application)
    client.host!('localhost')
    cases = {}
    {
      full: [@normal, "## Baseline heading\n\nReadable body<script>window.bad=1</script>"],
      patch: [@normal, "Hello brave world\nBye"],
      empty_history: [@normal, 'Local fallback'],
      cross_post: [@cross, @original.body],
      upstream_error: [@normal, nil]
    }.each do |name, (target, expected_body)|
      histories = {@normal.permlink => [operation(@normal, expected_body)], @cross.permlink => [operation(@cross, @cross.body)], @original.permlink => [operation(@original, @original.body)]}
      histories[@normal.permlink] = [operation(@normal, "Hello world\nBye"), operation(@normal, "@@ -1,15 +1,21 @@\n Hello \n+brave \n world%0ABye\n", 2)] if name == :patch
      histories[@normal.permlink] = [] if name == :empty_history
      rows = (0..SAMPLES).map do |iteration|
        @normal.update!(body: name == :empty_history ? 'Local fallback' : 'Old local body')
        calls = []
        fetch = lambda do |uri|
          calls << uri.path
          sleep 0.01 # Fixed local upstream latency; not real HTTP transport.
          Response.new(name == :upstream_error ? '503' : '200', {'operations' => histories.fetch(CGI.unescape(uri.path.split('/').last))}.to_json)
        end
        row = Net::HTTP.stub(:get_response, fetch) do
          measured { client.get("/api/v1/posts/#{target.id}/revisions", headers: {'Authorization' => "Bearer #{token}"}) }
        end
        payload = JSON.parse(client.response.body)
        expected_status = name == :upstream_error ? 502 : 200
        raise "Revision HTTP #{name}: #{client.response.status}" unless client.response.status == expected_status
        if expected_body
          raise "Revision identity #{name}" unless payload.values_at('author', 'permlink') == [name == :cross_post ? @original.author : target.author, name == :cross_post ? @original.permlink : target.permlink]
          raise "Revision body #{name}" unless payload.fetch('revisions').last.fetch('body') == expected_body
          raise 'Unsanitized revision' if payload.fetch('revisions').any? { |r| r.fetch('body_html').include?('<script') }
        end
        row.except(:value).merge(requests: calls, status: client.response.status,
          payload_sha256: Digest::SHA256.hexdigest(payload.to_json)) unless iteration.zero?
      end.compact
      raise "Unstable revision payload #{name}" unless rows.map { |r| r[:payload_sha256] }.uniq.one?
      cases[name] = summarize(rows)
    end
    # Separate requests must see newly arrived edits; request-scoped reuse cannot hide them.
    bodies = ['Fresh first', 'Fresh second'].map do |body|
      Net::HTTP.stub(:get_response, Response.new('200', {'operations' => [operation(@normal, body)]}.to_json)) do
        client.get("/api/v1/posts/#{@normal.id}/revisions", headers: {'Authorization' => "Bearer #{token}"})
        raise 'Freshness HTTP failure' unless client.response.status == 200
        JSON.parse(client.response.body).fetch('revisions').last.fetch('body')
      end
    end
    raise 'Revision freshness failed' unless bodies == ['Fresh first', 'Fresh second']
    {upstream_delay_ms: 10, cases: cases, freshness_bodies: bodies}
  end

  def content_baseline
    cases = {}
    %i(stats_then_payout payout_then_stats warm_revisit expired forced_refresh different_identity different_account).each do |name|
      rows = (0..SAMPLES).map do |iteration|
        travel_to(NOW)
        calls = []
        generation = 1
        api = Object.new
        api.define_singleton_method(:rpc_client) { self }
        api.define_singleton_method(:rpc_execute) do |api_name, method, args|
          raise 'Wrong RPC API' unless api_name == :condenser_api
          calls << {method: method, identity: args}
          sleep 0.005
          value = case method
          when :get_active_votes then [{voter: 'sibling-curator', percent: 4200}]
          when :get_content_replies then []
          when :get_content then {author: args[0], permlink: args[1], cashout_time: '2026-10-26T12:00:00', pending_payout_value: "#{generation}.000 HBD"}
          else raise "Unexpected RPC #{method}"
          end
          RpcResponse.new(value, nil)
        end
        cache = ActiveSupport::Cache::MemoryStore.new
        service = PostChainPayload.new(account: @account, api: api, cache: cache)
        stats = ->(p = @normal, refresh = false) { service.chain_stats(p, p.author, p.permlink, refresh: refresh) }
        payout = ->(p = @normal) { service.payout(p, p.author, p.permlink) }
        if %i(warm_revisit expired forced_refresh different_account).include?(name)
          stats.call
          payout.call
          calls.clear
          travel_to(NOW + 121.seconds) if name == :expired
          generation = 2 if name == :forced_refresh
          service = PostChainPayload.new(account: @other_account, api: api, cache: cache) if name == :different_account
        end
        row = measured do
          values = name == :payout_then_stats ? [payout.call, stats.call] : [stats.call(@normal, name == :forced_refresh), payout.call]
          values += [stats.call(@original), payout.call(@original)] if name == :different_identity
          raise 'Incorrect chain status' unless values.all? { |p| p[:status] == 'ready' }
          expected_vote = name == :different_account ? nil : 4200
          raise 'Wrong current vote' unless values.select { |p| p.key?(:current_vote) }.all? { |p| p[:current_vote] == expected_vote }
          values
        end
        row.merge(calls: calls.dup) unless iteration.zero?
      end.compact
      cases[name] = summarize(rows)
    end
    travel_to(NOW)
    {rpc_delay_ms: 5, cache: 'isolated ActiveSupport::Cache::MemoryStore', ttl_seconds: 120, cases: cases}
  end

  def validation_baseline
    fixtures = JSON.parse(File.read('benchmarks/sibling_response_fixtures.json'))
    rows = fixtures.fetch('cases').map do |fixture|
      value = nil
      error = nil
      begin
        if fixture['component'] == 'hafbe'
          Net::HTTP.stub(:get_response, Response.new(fixture.fetch('code'), fixture.fetch('wire'))) do
            value = HafbePostRevisions.new.send(:fetch_operations, 'sibling-author', 'plain')
          end
        else
          api = Object.new
          api.define_singleton_method(:rpc_client) { self }
          api.define_singleton_method(:rpc_execute) { |*_args| RpcResponse.new(fixture['result'], fixture['error']) }
          value = PostChainPayload.new(account: @account, api: api).send(:condenser_rpc, fixture.fetch('method').to_sym, ['sibling-author', 'plain'])
        end
      rescue StandardError => e
        error = {class: e.class.name, message: e.message}
      end
      controlled = error && (fixture['component'] == 'hafbe' ?
        error[:class] == 'HafbePostRevisions::FetchError' && error[:message].include?('HAFBE') :
        error[:class] == 'Hive::UnknownError' && error[:message].include?(fixture.fetch('method')))
      if fixture['kind'] == 'valid'
        expected = fixture['component'] == 'hafbe' ? JSON.parse(fixture['wire']) : fixture['result']
        raise "Valid control failed: #{fixture['id']}" unless error.nil? && value == expected
      elsif fixture['kind'] == 'error'
        raise "Error control failed: #{fixture['id']}" unless controlled
      end
      fixture.slice('id', 'component', 'method', 'kind').merge(controlled_rejection: !!controlled, error: error, returned_value: value)
    end
    large = {}
    history = {'operations' => Array.new(5000) { operation(@normal, 'Valid body') }}.to_json
    large[:hafbe_5000] = summarize(SAMPLES.times.map do
      Net::HTTP.stub(:get_response, Response.new('200', history)) do
        measured { HafbePostRevisions.new.send(:fetch_operations, 'sibling-author', 'plain') }.except(:value)
      end
    end)
    {get_active_votes: Array.new(5000) { |i| {voter: "voter-#{i}", percent: 0} },
     get_content_replies: Array.new(5000) { |i| {author: 'author', permlink: "reply-#{i}"} },
     get_content: {cashout_time: '2026-10-26T12:00:00', pending_payout_value: '1.000 HBD', body: 'x' * 1_048_576}}.each do |method, result|
      api = Object.new
      api.define_singleton_method(:rpc_client) { self }
      api.define_singleton_method(:rpc_execute) { |*_args| RpcResponse.new(result, nil) }
      service = PostChainPayload.new(account: @account, api: api)
      large[method] = summarize(SAMPLES.times.map { measured { service.send(:condenser_rpc, method, ['sibling-author', 'plain']) }.except(:value) })
    end
    {scope: fixtures.fetch('scope'), large_valid_boundary_cost: large, cases: rows, malformed: rows.count { |r| r['kind'] == 'malformed' },
     rejected_malformed: rows.count { |r| r['kind'] == 'malformed' && r[:controlled_rejection] },
     valid_accepted: rows.count { |r| r['kind'] == 'valid' && r[:error].nil? }}
  end
end

SiblingBaseline.new.run
