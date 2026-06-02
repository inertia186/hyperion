require 'test_helper'

class Api::V1::PreferencesControllerTest < ActionController::TestCase
  tests Api::V1::PreferencesController

  setup do
    @request.session[:current_account] = accounts(:curated)
  end

  test 'blacklist preferences are read from Hive relationships' do
    account = accounts(:curated)
    def account.blacklist_source_catalog
      [{account: 'fixture-curator', name: 'fixture-curator'}]
    end
    def account.offchain_blacklist_source_catalog
      [{account: 'hivewatchers', name: 'Hivewatchers', enabled: false, description: 'Powered by the Spaminator active blacklist.'}]
    end
    @request.session[:current_account] = account

    patch :blacklists, params: {enabled_sources: %w(fixture-curator)}

    assert_response :success
    assert_equal [{'account' => 'fixture-curator', 'name' => 'fixture-curator'}], response_json.fetch('blacklist_sources')
    assert_equal [{'account' => 'hivewatchers', 'name' => 'Hivewatchers', 'enabled' => false, 'description' => 'Powered by the Spaminator active blacklist.'}], response_json.fetch('offchain_blacklist_sources')
    assert_match 'managed through Hive', response_json.fetch('message')
  end

  test 'updates hivewatchers blacklist preference and clears cache' do
    PostIndexJob.cache_blacklist_reasons_by_account({'cached' => [{'account' => 'fixture-curator'}]})

    patch :blacklists, params: {hivewatchers_blacklist_enabled: true}

    assert_response :success
    assert_equal true, response_json.fetch('hivewatchers_blacklist_enabled')
    assert_equal true, accounts(:curated).reload.hivewatchers_blacklist_enabled?
    assert_equal true, response_json.fetch('offchain_blacklist_sources').first.fetch('enabled')
    assert_nil PostIndexJob.cached_blacklist_reasons_by_account
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

  test 'updates minimum reputation preference' do
    patch :minimum_reputation, params: {minimum_reputation: '35'}

    assert_response :success
    assert_equal 35, response_json.fetch('minimum_reputation')
    assert_equal 35, accounts(:curated).reload.minimum_reputation
  end

  test 'normalizes unknown minimum reputation preference to default' do
    patch :minimum_reputation, params: {minimum_reputation: 'lots'}

    assert_response :success
    assert_equal 25, response_json.fetch('minimum_reputation')
    assert_equal 25, accounts(:curated).reload.minimum_reputation
  end

private
  def response_json
    JSON.parse(response.body)
  end
end
