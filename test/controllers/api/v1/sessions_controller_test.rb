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

private
  def response_json
    JSON.parse(response.body)
  end
end
