require 'test_helper'

class AccountTest < ActiveSupport::TestCase
  class FollowingRpcClient
    def initialize(pages)
      @pages = pages
      @expected_starts = ['', 'muted-author']
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_following
      raise "unexpected args: #{args.inspect}" unless args == ['curator', @expected_starts.shift, 'ignore', 1000]

      Hashie::Mash.new(result: @pages.shift)
    end
  end

  class FollowingApi
    attr_reader :rpc_client

    def initialize(pages)
      @rpc_client = FollowingRpcClient.new(pages)
    end
  end

  test 'refresh muted authors persists fetched ignore follows' do
    account = Account.create!(name: 'curator')
    pages = [
      [Struct.new(:following).new('muted-author')],
      []
    ]

    Account.stub(:api, FollowingApi.new(pages)) do
      Account.stub(:with_simple_failover, ->(&block) { block.call }) do
        account.refresh_muted_authors
      end
    end

    assert_equal ['muted-author'], account.reload.muted_authors
  end

  test 'enabled blacklist sources default to empty' do
    assert_equal [], accounts(:curated).enabled_blacklist_sources
  end

  test 'enabled blacklist sources keep only trusted communities' do
    account = accounts(:curated)

    account.update_enabled_blacklist_sources!(%w(hive-163399 hive-unknown hive-136001 hive-163399))

    assert_equal %w(hive-163399 hive-136001), account.reload.enabled_blacklist_sources
  end

  test 'blacklist source catalog includes enabled state' do
    account = accounts(:curated)
    account.update_enabled_blacklist_sources!(%w(hive-136001))

    catalog = account.blacklist_source_catalog

    assert_equal PostIndexJob::TRUSTED_COMMUNITIES, catalog.map { |source| source.fetch(:community) }
    assert_equal ['hive-136001'], catalog.select { |source| source.fetch(:enabled) }.map { |source| source.fetch(:community) }
    assert_includes catalog.map { |source| source.fetch(:name) }, 'Ban Hammer'
  end
end
