require 'test_helper'

class UpstreamResponseContractTest < ActiveSupport::TestCase
  Response = Struct.new(:code, :body)
  RpcResponse = Struct.new(:result, :error)

  JSON.parse(Rails.root.join('benchmarks/sibling_response_fixtures.json').read).fetch('cases').each do |fixture|
    test fixture.fetch('id') do
      call = if fixture.fetch('component') == 'hafbe'
        -> {
          Net::HTTP.stub(:get_response, Response.new(fixture.fetch('code'), fixture.fetch('wire'))) do
            HafbePostRevisions.new.send(:fetch_operations, 'author', 'post')
          end
        }
      else
        api = Object.new
        api.define_singleton_method(:rpc_client) { self }
        api.define_singleton_method(:rpc_execute) { |*_args| RpcResponse.new(fixture['result'], fixture['error']) }
        -> { PostChainPayload.new(account: accounts(:curated), api: api).send(:condenser_rpc, fixture.fetch('method').to_sym, ['author', 'post']) }
      end

      if fixture.fetch('kind') == 'valid'
        expected = fixture['component'] == 'hafbe' ? JSON.parse(fixture['wire']) : fixture['result']
        assert_equal [expected], [call.call]
      else
        type = fixture['component'] == 'hafbe' ? HafbePostRevisions::FetchError : Hive::UnknownError
        error = assert_raises(type, &call)
        assert_includes error.message, fixture['component'] == 'hafbe' ? 'HAFBE' : fixture.fetch('method')
      end
    end
  end

  test 'chain stats accepts real Hashie result collections and preserves optional fields' do
    post = posts(:allowed_unread)
    results = {
      get_active_votes: [{voter: accounts(:curated).name, percent: 4200, future: true}],
      get_content_replies: [{id: 1}],
      get_content: {cashout_time: '2026-10-27T12:00:00', pending_payout_value: '1.234 HBD', future: {field: true}}
    }
    api = Object.new
    api.define_singleton_method(:rpc_client) { self }
    api.define_singleton_method(:rpc_execute) { |_, method, _args| Hashie::Mash.new(result: results.fetch(method)) }

    result = PostChainPayload.new(account: accounts(:curated), api: api, cache: ActiveSupport::Cache::MemoryStore.new).
      chain_stats(post, post.author, post.permlink)

    assert_equal 'ready', result.fetch(:status)
    assert_equal 4200, result.fetch(:current_vote)
    assert_equal 1, result.fetch(:votes)
    assert_equal 1, result.fetch(:replies)
    assert_equal '1.234 HBD', post.reload.payout
  end
end
