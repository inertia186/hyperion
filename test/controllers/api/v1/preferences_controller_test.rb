require 'test_helper'

class Api::V1::PreferencesControllerTest < ActionController::TestCase
  tests Api::V1::PreferencesController

  setup do
    @request.session[:current_account] = accounts(:curated)
  end

  test 'updates enabled blacklist sources' do
    patch :blacklists, params: {enabled_sources: %w(hive-163399 hive-136001)}

    assert_response :success
    payload = response_json
    assert_equal %w(hive-163399 hive-136001), payload.fetch('enabled_blacklist_sources')
    assert_equal %w(hive-163399 hive-136001), accounts(:curated).reload.enabled_blacklist_sources
    assert_equal ['hive-163399', 'hive-136001'], payload.fetch('blacklist_sources').select { |source| source.fetch('enabled') }.map { |source| source.fetch('community') }
  end

  test 'filters unknown blacklist sources' do
    patch :blacklists, params: {enabled_sources: %w(hive-unknown hive-196037)}

    assert_response :success
    assert_equal %w(hive-196037), response_json.fetch('enabled_blacklist_sources')
    assert_equal %w(hive-196037), accounts(:curated).reload.enabled_blacklist_sources
  end

  test 'updates theme preference' do
    %w(light dark system).each do |theme|
      patch :theme, params: {theme: theme}

      assert_response :success
      assert_equal theme, response_json.fetch('theme')
      assert_equal theme, accounts(:curated).reload.theme
    end
  end

  test 'normalizes unknown theme preference to system' do
    patch :theme, params: {theme: 'neon'}

    assert_response :success
    assert_equal 'system', response_json.fetch('theme')
    assert_equal 'system', accounts(:curated).reload.theme
  end

private
  def response_json
    JSON.parse(response.body)
  end
end
