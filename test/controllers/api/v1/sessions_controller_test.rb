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
    @request.session[:current_account] = accounts(:curated)

    get :show

    assert_response :success
    payload = response_json
    assert_equal true, payload.fetch('authenticated')
    assert_equal 'fixture-curator', payload.dig('account', 'name')
    assert_includes payload.fetch('ignored_tags'), 'spam'
    assert_includes payload.fetch('favorite_tags'), 'haf'
    assert_equal false, payload.dig('preferences', 'muted_authors_enabled')
    assert_equal [], payload.dig('preferences', 'enabled_blacklist_sources')
    assert_equal 'system', payload.dig('preferences', 'theme')
    assert_equal false, payload.dig('preferences', 'hivesigner_available')
    assert_equal PostIndexJob::TRUSTED_COMMUNITIES, payload.fetch('blacklist_sources').map { |source| source.fetch('community') }
    assert_equal false, payload.fetch('blacklist_sources').any? { |source| source.fetch('enabled') }
  end

  test 'returns enabled blacklist sources in shell state' do
    account = accounts(:curated)
    account.update_enabled_blacklist_sources!(%w(hive-163399 hive-136001))
    @request.session[:current_account] = account

    get :show

    assert_response :success
    payload = response_json
    assert_equal %w(hive-163399 hive-136001), payload.dig('preferences', 'enabled_blacklist_sources')
    assert_equal ['hive-163399', 'hive-136001'], payload.fetch('blacklist_sources').select { |source| source.fetch('enabled') }.map { |source| source.fetch('community') }
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
