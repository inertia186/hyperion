require 'test_helper'

class ImmutableTest < ActiveSupport::TestCase
  FakeHiveClient = Struct.new(:url)

  test 'hive clients use selected urls' do
    target = Class.new { extend Immutable }

    HiveNodeSelector.stub(:next_url, ->(excluded_urls: []) { 'https://api.deathwing.me' }) do
      Hive::Api.stub(:new, ->(url:) { FakeHiveClient.new(url) }) do
        assert_equal 'https://api.deathwing.me', target.api.url
      end
    end
  end

  test 'simple failover returns yielded result' do
    target = Class.new { extend Immutable }

    assert_equal 'ok', target.with_simple_failover { 'ok' }
  end

  test 'simple failover records failed node and resets cached clients before retrying' do
    target = Class.new { extend Immutable }
    attempts = 0
    selected_urls = []
    final_url = nil

    selector = lambda do |excluded_urls: []|
      selected_urls << excluded_urls
      excluded_urls.include?('https://api.deathwing.me') ? 'https://api.hive.blog' : 'https://api.deathwing.me'
    end

    HiveNodeSelector.stub(:next_url, selector) do
      Hive::Api.stub(:new, ->(url:) { FakeHiveClient.new(url) }) do
        target.with_simple_failover do
          attempts += 1
          target.api
          raise 'first node failed' if attempts == 1
        end
        final_url = target.api.url
      end
    end

    assert_equal 2, attempts
    assert_equal [[], ['https://api.deathwing.me']], selected_urls
    assert_equal 'https://api.hive.blog', final_url
  end
end
