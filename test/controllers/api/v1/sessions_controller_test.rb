require 'test_helper'

class Api::V1::SessionsControllerTest < ActionController::TestCase
  tests Api::V1::SessionsController

  test 'returns unauthenticated session state' do
    get :show

    assert_response :success
    assert_equal false, response_json.fetch('authenticated')
    assert response_json.fetch('login_url').present?
  end

  test 'returns current account shell state' do
    account = accounts(:curated)
    def account.blacklist_source_catalog
      [{account: 'fixture-curator', name: 'fixture-curator'}]
    end
    @request.session[:current_account] = account

    get :show

    assert_response :success
    payload = response_json
    assert_equal true, payload.fetch('authenticated')
    assert_equal 'fixture-curator', payload.dig('account', 'name')
    assert_includes payload.fetch('ignored_tags'), 'spam'
    assert_includes payload.fetch('favorite_tags'), 'haf'
    assert_equal false, payload.dig('preferences', 'muted_authors_enabled')
    assert_equal 'system', payload.dig('preferences', 'theme')
    assert_equal 25, payload.dig('preferences', 'minimum_reputation')
    assert_equal false, payload.dig('preferences', 'hivewatchers_blacklist_enabled')
    assert_equal false, payload.dig('preferences', 'hivesigner_available')
    assert_equal ['fixture-curator'], payload.fetch('blacklist_sources').map { |source| source.fetch('account') }
    assert_equal ['hivewatchers'], payload.fetch('offchain_blacklist_sources').map { |source| source.fetch('account') }
  end

  test 'returns theme preference in shell state' do
    account = accounts(:curated)
    account.update_theme!('dark')
    @request.session[:current_account] = account

    get :show

    assert_response :success
    assert_equal 'dark', response_json.dig('preferences', 'theme')
  end

  test 'returns regenerated current voting power' do
    account = accounts(:curated)
    @request.session[:current_account] = account

    travel_to Time.utc(2026, 6, 1, 12, 0, 0) do
      with_voting_power_account(voting_power: 9000, last_vote_time: '2026-06-01T06:00:00') do
        get :voting_power
      end
    end

    assert_response :success
    assert_equal 'ready', response_json.fetch('status')
    assert_equal 9500, response_json.fetch('value')
    assert_equal 95.0, response_json.fetch('percent')
    assert response_json.fetch('fetched_at').present?
  end

  test 'caps regenerated current voting power at full power' do
    account = accounts(:curated)
    @request.session[:current_account] = account

    travel_to Time.utc(2026, 6, 1, 12, 0, 0) do
      with_voting_power_account(voting_power: 9900, last_vote_time: '2026-05-31T12:00:00') do
        get :voting_power
      end
    end

    assert_response :success
    assert_equal 'ready', response_json.fetch('status')
    assert_equal 10_000, response_json.fetch('value')
    assert_equal 100.0, response_json.fetch('percent')
  end

  test 'falls back to condenser account when database account lacks voting power fields' do
    account = accounts(:curated)
    @request.session[:current_account] = account

    travel_to Time.utc(2026, 6, 1, 12, 0, 0) do
      Account.stub(:with_simple_failover, ->(&block) { block.call }) do
        Account.stub(:database_api, VotingPowerApi.new({})) do
          Account.stub(:api, CondenserAccountApi.new(voting_power: 8000, last_vote_time: '2026-06-01T00:00:00')) do
            get :voting_power
          end
        end
      end
    end

    assert_response :success
    assert_equal 'ready', response_json.fetch('status')
    assert_equal 9000, response_json.fetch('value')
    assert_equal 90.0, response_json.fetch('percent')
  end

  test 'requires authentication for current voting power' do
    get :voting_power

    assert_response :unauthorized
    assert_equal false, response_json.fetch('authenticated')
    assert response_json.fetch('login_url').present?
  end

  test 'returns unavailable payload when current voting power cannot be fetched' do
    account = accounts(:curated)
    @request.session[:current_account] = account

    with_voting_power_account(nil) do
      get :voting_power
    end

    assert_response :success
    assert_equal 'unavailable', response_json.fetch('status')
    assert_nil response_json.fetch('value')
    assert_nil response_json.fetch('percent')
  end

private
  VotingPowerAccount = Struct.new(:voting_power, :last_vote_time, keyword_init: true)
  VotingPowerResult = Struct.new(:accounts, keyword_init: true)
  EmptyCondenserResult = Struct.new(:result, keyword_init: true)

  class VotingPowerApi
    def initialize(account)
      @account = account
    end

    def find_accounts(accounts:)
      yield VotingPowerResult.new(accounts: [@account].compact)
    end
  end

  class EmptyCondenserApi
    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_accounts

      EmptyCondenserResult.new(result: [])
    end
  end

  class CondenserAccountApi
    def initialize(account)
      @account = account
    end

    def rpc_client
      self
    end

    def rpc_execute(api, method, args)
      raise "unexpected api: #{api}" unless api == :condenser_api
      raise "unexpected method: #{method}" unless method == :get_accounts

      EmptyCondenserResult.new(result: [@account])
    end
  end

  def with_voting_power_account(account = :default, voting_power: nil, last_vote_time: nil)
    account = VotingPowerAccount.new(voting_power: voting_power, last_vote_time: last_vote_time) if account == :default
    api = VotingPowerApi.new(account)

    Account.stub(:with_simple_failover, ->(&block) { block.call }) do
      Account.stub(:database_api, api) do
        Account.stub(:api, EmptyCondenserApi.new) do
          yield
        end
      end
    end
  end

  def response_json
    JSON.parse(response.body)
  end
end
