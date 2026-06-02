require 'test_helper'

class AccountTest < ActiveSupport::TestCase
  class FollowingRpcClient
    def initialize(pages, type = 'ignore')
      @pages = pages
      @type = type
      @expected_starts = ['', type == 'ignore' ? pages.first&.last&.following : nil]
    end

    def rpc_execute(api, method, args)
      if @type == 'follow_blacklist'
        raise "unexpected api: #{api}" unless api == :bridge
        raise "unexpected method: #{method}" unless method == :get_follow_list
        raise "unexpected args: #{args.inspect}" unless args == {observer: 'curator', follow_type: 'follow_blacklist'}

        return Hashie::Mash.new(result: @pages.shift)
      end

      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_following
      raise "unexpected args: #{args.inspect}" unless args == ['curator', @expected_starts.shift.to_s, @type, 1000]

      Hashie::Mash.new(result: @pages.shift)
    end
  end

  class FollowingApi
    attr_reader :rpc_client

    def initialize(pages, type = 'ignore')
      @rpc_client = FollowingRpcClient.new(pages, type)
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

  test 'blacklist sources include account and followed blacklist accounts' do
    account = Account.create!(name: 'curator')
    pages = [
      [Struct.new(:name).new('hive.blog')]
    ]

    Account.stub(:api, FollowingApi.new(pages, 'follow_blacklist')) do
      Account.stub(:with_simple_failover, ->(&block) { block.call }) do
        assert_equal ['curator', 'hive.blog'], account.blacklist_sources
      end
    end
  end

  test 'blacklist sources include hivewatchers when enabled' do
    account = Account.create!(name: 'curator')

    account.stub(:followed_blacklist_accounts, []) do
      assert_equal ['curator'], account.blacklist_sources

      account.update_hivewatchers_blacklist_enabled!(true)

      assert_equal ['curator', 'hivewatchers'], account.blacklist_sources
    end
  end

  test 'blacklist source catalog exposes account sources' do
    account = Account.create!(name: 'curator')

    account.stub(:followed_blacklist_accounts, %w(hive.blog)) do
      assert_equal(
        [{account: 'curator', name: 'curator'}, {account: 'hive.blog', name: 'hive.blog'}],
        account.blacklist_source_catalog
      )
    end
  end

  test 'offchain blacklist source catalog exposes hivewatchers state' do
    account = Account.create!(name: 'curator')

    assert_equal(
      [{account: 'hivewatchers', name: 'Hivewatchers', enabled: false, description: 'Powered by the Spaminator active blacklist.'}],
      account.offchain_blacklist_source_catalog
    )

    account.update_hivewatchers_blacklist_enabled!(true)

    assert_equal true, account.offchain_blacklist_source_catalog.first.fetch(:enabled)
  end
end
