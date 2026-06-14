require 'test_helper'

class HiveNodeSelectorTest < ActiveSupport::TestCase
  BeaconResponse = Struct.new(:code, :body)

  teardown do
    HiveNodeSelector.clear_cache!
  end

  test 'ranks configured nodes by beacon score and filters low scores' do
    with_env(
      'HYPERION_NODE_URLS' => 'https://api.openhive.network,https://api.deathwing.me,https://private.example',
      'HIVE_NODE_MIN_SCORE' => '90'
    ) do
      with_beacon_nodes(
        {'name' => 'api.openhive.network', 'score' => 44, 'version' => '1.28.3'},
        {'name' => 'api.deathwing.me', 'score' => 100, 'version' => '1.28.6'}
      ) do
        assert_equal ['https://api.deathwing.me', 'https://private.example'], HiveNodeSelector.ordered_urls
      end
    end
  end

  test 'falls back to configured order when beacon is unavailable' do
    with_env('HYPERION_NODE_URLS' => 'https://api.openhive.network,https://api.deathwing.me') do
      Net::HTTP.stub(:start, ->(*_args, **_kwargs) { raise SocketError, 'down' }) do
        assert_equal ['https://api.openhive.network', 'https://api.deathwing.me'], HiveNodeSelector.ordered_urls
      end
    end
  end

  test 'falls back to configured order when all reported nodes are below score threshold' do
    with_env(
      'HYPERION_NODE_URLS' => 'https://api.openhive.network,https://hive.roelandp.nl',
      'HIVE_NODE_MIN_SCORE' => '90'
    ) do
      with_beacon_nodes(
        {'name' => 'api.openhive.network', 'score' => 44, 'version' => '1.28.3'},
        {'name' => 'hive.roelandp.nl', 'score' => 43, 'version' => '1.28.3'}
      ) do
        assert_equal ['https://api.openhive.network', 'https://hive.roelandp.nl'], HiveNodeSelector.ordered_urls
      end
    end
  end

  test 'normalizes configured urls and beacon names by host and port' do
    with_env(
      'HYPERION_NODE_URLS' => 'api.deathwing.me,https://api.hive.blog:443,example.com:8443',
      'HIVE_NODE_MIN_SCORE' => '90'
    ) do
      with_beacon_nodes(
        {'name' => 'example.com:8443', 'score' => 100, 'version' => '1.28.6'},
        {'name' => 'https://api.deathwing.me', 'score' => 95, 'version' => '1.28.6'},
        {'name' => 'api.hive.blog', 'score' => 93, 'version' => '1.28.6'}
      ) do
        assert_equal ['https://example.com:8443', 'https://api.deathwing.me', 'https://api.hive.blog'], HiveNodeSelector.ordered_urls
      end
    end
  end

  test 'excludes recently failed urls when another candidate is available' do
    with_env('HYPERION_NODE_URLS' => 'https://api.deathwing.me,https://api.hive.blog') do
      with_beacon_nodes(
        {'name' => 'api.deathwing.me', 'score' => 100, 'version' => '1.28.6'},
        {'name' => 'api.hive.blog', 'score' => 93, 'version' => '1.28.6'}
      ) do
        assert_equal 'https://api.hive.blog', HiveNodeSelector.next_url(excluded_urls: ['https://api.deathwing.me'])
      end
    end
  end

private
  def with_beacon_nodes(*nodes)
    response = BeaconResponse.new('200', nodes.to_json)
    http = Struct.new(:response) do
      def get(_path)
        response
      end
    end.new(response)

    Net::HTTP.stub(:start, ->(*_args, **_kwargs, &block) { block.call(http) }) do
      yield
    end
  ensure
    HiveNodeSelector.clear_cache!
  end
end
