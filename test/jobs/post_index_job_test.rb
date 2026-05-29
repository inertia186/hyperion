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

  test 'blacklist extracts muted roles from trusted communities' do
    bridge = FakeBridge.new(
      ['hive-163399', ''] => [
        ['alice', 'muted', ''],
        ['bob', 'member', ''],
        ['CHARLIE', 'muted', '']
      ]
    )

    PostIndexJob.stub(:bridge, bridge) do
      assert_equal %w(alice charlie), PostIndexJob.new.blacklist
    end
  end

  test 'blacklist seeds trusted community details for label expansion' do
    bridge = FakeBridge.new(['hive-163399', ''] => [['alice', 'muted', '']])
    seeded_names = nil

    Community.stub(:ensure_present!, ->(names) { seeded_names = names }) do
      PostIndexJob.stub(:bridge, bridge) do
        PostIndexJob.new.blacklist
      end
    end

    assert_equal PostIndexJob::TRUSTED_COMMUNITIES, seeded_names
  end

  test 'blacklist reasons include source communities' do
    bridge = FakeBridge.new(
      ['hive-163399', ''] => [['alice', 'muted', '']],
      ['hive-196037', ''] => [['alice', 'muted', ''], ['bob', 'muted', '']]
    )

    PostIndexJob.stub(:bridge, bridge) do
      reasons = PostIndexJob.new.blacklist_reasons_by_account

      assert_equal [{'community' => 'hive-163399'}, {'community' => 'hive-196037'}], reasons.fetch('alice')
      assert_equal [{'community' => 'hive-196037'}], reasons.fetch('bob')
    end
  end

  test 'blacklist combines and deduplicates trusted community muted roles' do
    bridge = FakeBridge.new(
      ['hive-163399', ''] => [['alice', 'muted', '']],
      ['hive-196037', ''] => [['alice', 'muted', ''], ['bob', 'muted', '']]
    )

    PostIndexJob.stub(:bridge, bridge) do
      assert_equal %w(alice bob), PostIndexJob.new.blacklist
    end
  end

  test 'blacklist paginates trusted community roles' do
    first_page = 99.times.map { |index| ["acct#{index.to_s.rjust(3, '0')}", 'member', ''] }
    first_page << ['last-muted', 'muted', '']
    bridge = FakeBridge.new(
      ['hive-163399', ''] => first_page,
      ['hive-163399', 'last-muted'] => [['next-muted', 'muted', '']]
    )

    PostIndexJob.stub(:bridge, bridge) do
      assert_equal %w(last-muted next-muted), PostIndexJob.new.blacklist
    end
  end

  test 'blacklist tolerates one trusted community fetch failure' do
    bridge = FakeBridge.new(
      ['hive-163399', ''] => RuntimeError.new('boom'),
      ['hive-196037', ''] => [['survivor', 'muted', '']]
    )

    PostIndexJob.stub(:bridge, bridge) do
      assert_equal ['survivor'], PostIndexJob.new.blacklist
    end
  end

  test 'blacklist cache is reused across job instances' do
    bridge = FakeBridge.new(
      ['hive-163399', ''] => [['alice', 'muted', '']]
    )

    PostIndexJob.stub(:bridge, bridge) do
      assert_equal ['alice'], PostIndexJob.new.blacklist
      assert_equal ['alice'], PostIndexJob.new.blacklist
    end

    assert_equal 1, bridge.calls.fetch(['hive-163399', ''])
  end

  test 'blacklist uses stale cache when every trusted community fetch fails' do
    PostIndexJob.cache_blacklist_reasons_by_account({'cached' => [{'community' => 'hive-163399'}]})
    PostIndexJob.instance_variable_set(:@blacklist_reasons_cache, {
      value: {'cached' => [{'community' => 'hive-163399'}]},
      expires_at: 1.minute.ago
    })
    bridge = FakeBridge.new(PostIndexJob::TRUSTED_COMMUNITIES.to_h { |community_name| [[community_name, ''], RuntimeError.new('boom')] })

    PostIndexJob.stub(:bridge, bridge) do
      assert_equal ['cached'], PostIndexJob.new.blacklist
    end
  end

  test 'rate limited blacklist requests are retried' do
    bridge = FakeBridge.new(
      ['hive-163399', ''] => [
        RuntimeError.new('429 Too Many Requests'),
        [['alice', 'muted', '']]
      ]
    )
    job = PostIndexJob.new

    PostIndexJob.stub(:bridge, bridge) do
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

    job.stub(:blacklist_reasons_for, [{'community' => 'hive-163399'}]) do
      Post.stub(:find_or_initialize_by, post) do
        job.process_comments({'trx' => [comment]}, 123, Time.current)
      end
    end

    assert_equal true, post.attributes.fetch(:blacklisted)
    assert_equal [{'community' => 'hive-163399'}], post.attributes.fetch(:blacklist_reasons)
  end

private
  class FakeBridge
    Result = Struct.new(:result)

    def initialize(responses)
      @responses = responses
      @calls = Hash.new(0)
    end

    attr_reader :calls

    def list_community_roles(community:, last:, limit:)
      @calls[[community, last]] += 1
      response = @responses.fetch([community, last], [])
      response = response.shift if response.is_a?(Array) && response.any? { |item| item.is_a?(Exception) || item.is_a?(Array) && item.first.is_a?(Array) }
      raise response if response.is_a?(Exception)

      Result.new(response)
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
