require 'test_helper'

class PostIndexJobTest < ActiveJob::TestCase
  setup do
    PostIndexJob.clear_blacklist_cache!
  end

  test 'dispatches to HafSQL indexer by default' do
    indexer = Minitest::Mock.new
    indexer.expect(:perform, nil)

    HafsqlPostIndexer.stub(:new, indexer) do
      PostIndexJob.new.perform
    end

    assert_mock indexer
  end

  test 'dispatches to RPC indexer when HafSQL is disabled' do
    with_env('HAFSQL_INDEXER_ENABLED' => 'false') do
      job = PostIndexJob.new
      called = false

      job.stub(:perform_with_rpc, ->(*) { called = true }) do
        job.perform
      end

      assert called
    end
  end

  test 'blacklist extracts direct blacklist follows' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [],
      ['fixture-curator', '', 'blacklisted'] => [
        follow('alice'),
        follow('CHARLIE')
      ]
    )

    PostIndexJob.stub(:api, api) do
      assert_equal %w(alice charlie), PostIndexJob.new.blacklist
    end
  end

  test 'blacklist reasons include source accounts' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [follow('hive.blog')],
      ['fixture-curator', '', 'blacklisted'] => [follow('alice')],
      ['hive.blog', '', 'blacklisted'] => [follow('alice'), follow('bob')]
    )

    PostIndexJob.stub(:api, api) do
      reasons = PostIndexJob.new.blacklist_reasons_by_account

      assert_equal [{'account' => 'fixture-curator'}, {'account' => 'hive.blog'}], reasons.fetch('alice')
      assert_equal [{'account' => 'hive.blog'}], reasons.fetch('bob')
    end
  end

  test 'blacklist combines and deduplicates followed blacklist accounts' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [follow('hive.blog')],
      ['fixture-curator', '', 'blacklisted'] => [follow('alice')],
      ['hive.blog', '', 'blacklisted'] => [follow('alice'), follow('bob')]
    )

    PostIndexJob.stub(:api, api) do
      assert_equal %w(alice bob), PostIndexJob.new.blacklist
    end
  end

  test 'blacklist includes hivewatchers off-chain accounts when enabled' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [],
      ['fixture-curator', '', 'blacklisted'] => []
    )
    job = PostIndexJob.new

    PostIndexJob.stub(:api, api) do
      job.stub(:hivewatchers_blacklist_enabled?, true) do
        job.stub(:hivewatchers_blacklist_accounts, %w(spammer SPAMMER badactor)) do
          reasons = job.blacklist_reasons_by_account

          assert_equal [{'account' => 'hivewatchers'}], reasons.fetch('spammer')
          assert_equal [{'account' => 'hivewatchers'}], reasons.fetch('badactor')
        end
      end
    end
  end

  test 'blacklist marks refresh failed when hivewatchers fetch fails' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [],
      ['fixture-curator', '', 'blacklisted'] => [follow('alice')]
    )
    job = PostIndexJob.new

    PostIndexJob.stub(:api, api) do
      job.stub(:hivewatchers_blacklist_enabled?, true) do
        job.stub(:hivewatchers_blacklist_accounts, nil) do
          assert_equal ['alice'], job.blacklist
          assert job.blacklist_refresh_failed?
        end
      end
    end
  end

  test 'hivewatchers blacklist parser normalizes spaminator feed lines' do
    body = "# comment\n@Spammer\nbadactor extra\n\n"

    assert_equal %w(spammer badactor), PostIndexJob.new.parse_hivewatchers_blacklist(body)
  end

  test 'blacklist handles large follow list responses' do
    follow_list = 999.times.map { |index| follow("acct#{index.to_s.rjust(3, '0')}") }
    follow_list << follow('last-blacklisted')
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [],
      ['fixture-curator', '', 'blacklisted'] => follow_list
    )

    PostIndexJob.stub(:api, api) do
      assert_includes PostIndexJob.new.blacklist, 'last-blacklisted'
    end
  end

  test 'blacklist tolerates one source account fetch failure' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [follow('hive.blog')],
      ['fixture-curator', '', 'blacklisted'] => RuntimeError.new('boom'),
      ['hive.blog', '', 'blacklisted'] => [follow('survivor')]
    )

    PostIndexJob.stub(:api, api) do
      assert_equal ['survivor'], PostIndexJob.new.blacklist
    end
  end

  test 'blacklist cache is reused across job instances' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [],
      ['fixture-curator', '', 'blacklisted'] => [follow('alice')]
    )

    PostIndexJob.stub(:api, api) do
      assert_equal ['alice'], PostIndexJob.new.blacklist
      assert_equal ['alice'], PostIndexJob.new.blacklist
    end

    assert_equal 1, api.calls.fetch(['fixture-curator', '', 'blacklisted'])
  end

  test 'blacklist uses stale cache when every source account fetch fails' do
    PostIndexJob.cache_blacklist_reasons_by_account({'cached' => [{'account' => 'fixture-curator'}]})
    PostIndexJob.instance_variable_set(:@blacklist_reasons_cache, {
      value: {'cached' => [{'account' => 'fixture-curator'}]},
      expires_at: 1.minute.ago
    })
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [],
      ['fixture-curator', '', 'blacklisted'] => RuntimeError.new('boom')
    )

    PostIndexJob.stub(:api, api) do
      assert_equal ['cached'], PostIndexJob.new.blacklist
    end
  end

  test 'rate limited blacklist requests are retried' do
    api = FakeApi.new(
      ['fixture-curator', '', 'follow_blacklist'] => [],
      ['fixture-curator', '', 'blacklisted'] => [
        RuntimeError.new('429 Too Many Requests'),
        [follow('alice')]
      ]
    )
    job = PostIndexJob.new

    PostIndexJob.stub(:api, api) do
      job.stub(:sleep, nil) do
        assert_equal ['alice'], job.blacklist
      end
    end
  end

  test 'process comments marks blacklisted authors' do
    job = PostIndexJob.new
    post = FakePost.new
    comment = {
      author: 'spammer',
      permlink: 'spam-post',
      parent_permlink: 'haf',
      title: 'Spam',
      body: 'Spam body',
      json_metadata: '{}'
    }

    job.stub(:blacklist_reasons_for, [{'account' => 'fixture-curator'}]) do
      job.stub(:author_reputations_for, {'spammer' => 10}) do
        Post.stub(:find_or_initialize_by, post) do
          job.process_comments({'trx' => [comment]}, 123, Time.current)
        end
      end
    end

    assert_equal true, post.attributes.fetch(:blacklisted)
    assert_equal [{'account' => 'fixture-curator'}], post.attributes.fetch(:blacklist_reasons)
    assert_equal 10, post.attributes.fetch(:author_reputation)
  end

private
  def follow(account)
    Struct.new(:following, :name).new(account, account)
  end

  class FakeApi
    Response = Struct.new(:result)

    def initialize(responses)
      @responses = responses
      @calls = Hash.new(0)
    end

    attr_reader :calls

    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :bridge
      raise "unexpected method: #{method}" unless method == :get_follow_list

      account = args.fetch(:observer)
      type = args.fetch(:follow_type)
      last = ''
      @calls[[account, last, type]] += 1
      response = @responses.fetch([account, last, type], [])
      response = response.shift if response.is_a?(Array) && response.any? { |item| item.is_a?(Exception) || item.is_a?(Array) }
      raise response if response.is_a?(Exception)

      Response.new(response)
    end
  end

  class FakePost
    attr_reader :attributes, :errors
    attr_accessor :author, :permlink, :body

    def initialize
      @attributes = {}
      @errors = Struct.new(:messages).new({})
    end

    def blacklisted?
      false
    end

    def update(attributes)
      @attributes = attributes
      @author = 'spammer'
      @permlink = 'spam-post'
      @body = attributes[:body]
      true
    end

    def in_blog?(*)
      true
    end

    def persisted?
      false
    end
  end
end
