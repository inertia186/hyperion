require 'test_helper'

class SessionsControllerTest < ActionDispatch::IntegrationTest
  HIVE_KEYCHAIN_ACCOUNT = 'inertia'
  HIVE_KEYCHAIN_PUBLIC_KEY = 'STM5LmctctRD4qavoB43BWCs1WJ8TmJV1xZoTRngpacrSc7Dwq349'
  HIVE_KEYCHAIN_SIGNATURE = '1f720017ab6a297648dfeabd997d4aece902cc7303b646311b20c54915d7bf89854d260aef211138752891a8f00a4ccb084abe19f8d4c99d28ff97b9148ddd3e80'
  HIVE_KEYCHAIN_DIGEST = 'b86d09e4c042e841fd8907a3e15e654bd86a92ae4d5aebdf122b66ff287e2669'

  def test_routings
    assert_routing 'sessions/account/authorized', controller: 'sessions', action: 'authorized', id: 'account'
    assert_routing 'sessions/authorized', controller: 'sessions', action: 'authorized'
    assert_routing 'sessions/new', controller: 'sessions', action: 'new'
    assert_routing({ method: 'post', path: '/sessions' }, controller: 'sessions', action: 'create')
    assert_routing({ method: 'delete', path: '/sessions/account' }, controller: 'sessions', action: 'destroy', id: 'account')
  end

  def test_new_session_links_agents_to_well_known_manifest
    get new_session_path

    assert_response :success
    assert_select 'link[rel="hyperion-agent"][href="/.well-known/hyperion-agent.json"][type="application/json"]'
    assert_select 'meta[name="hyperion-agent-discovery"][content="/.well-known/hyperion-agent.json"]'
    assert_select 'a.btn[data-agent-discovery="true"][href="/.well-known/hyperion-agent.json"]', text: 'Are you a robot? Use the Hyperion Agent API'
  end

  def test_hivesigner_redirect_uses_current_host
    host! 'hyperion.test'

    post sessions_path, params: { account_name: 'inertia', hivesigner: '' }

    assert_redirected_to %r{\Ahttps://hivesigner\.com/oauth2/authorize\?}
    uri = URI.parse(response.location)
    params = Rack::Utils.parse_query(uri.query)

    assert_equal 'hyperion.zone', params['client_id']
    assert_equal 'http://hyperion.test/sessions/authorized', params['redirect_uri']
    assert_equal 'login', params['scope']
  end

  def test_hivesigner_xhr_navigates_browser_to_current_host_callback
    host! '192.168.141.168:3000'

    post sessions_path,
      params: { account_name: 'inertia', hivesigner: '' },
      headers: { 'X-Requested-With' => 'XMLHttpRequest' }

    assert_response :success
    assert_equal 'text/javascript', response.media_type
    assert_includes response.body, 'window.location.assign'
    assert_includes response.body, 'redirect_uri=http%3A%2F%2F192.168.141.168%3A3000%2Fsessions%2Fauthorized'
  end

  def test_hivesigner_redirect_supports_tailscale_host_callback
    host! 'toto.tail1b9f02.ts.net:3000'

    post sessions_path, params: { account_name: 'inertia', hivesigner: '' }

    assert_redirected_to %r{\Ahttps://hivesigner\.com/oauth2/authorize\?}
    uri = URI.parse(response.location)
    params = Rack::Utils.parse_query(uri.query)

    assert_equal 'http://toto.tail1b9f02.ts.net:3000/sessions/authorized', params['redirect_uri']
  end

  def test_hivesigner_cert_store_does_not_require_crl
    store = SessionsController.new.send(:hivesigner_cert_store)

    assert_instance_of OpenSSL::X509::Store, store
  end

  def test_hive_keychain_authorized_signs_in_with_valid_signature
    Account.stub(:public_keys, [HIVE_KEYCHAIN_PUBLIC_KEY]) do
      get authorized_session_path(HIVE_KEYCHAIN_ACCOUNT), params: hive_keychain_params
    end

    assert_redirected_to root_path
    assert_equal HIVE_KEYCHAIN_ACCOUNT, session[:current_account].name
  end

  def test_hive_keychain_authorized_redirects_to_spa_when_return_to_is_legacy_inbox
    get posts_path

    assert_redirected_to new_session_url

    Account.stub(:public_keys, [HIVE_KEYCHAIN_PUBLIC_KEY]) do
      get authorized_session_path(HIVE_KEYCHAIN_ACCOUNT), params: hive_keychain_params
    end

    assert_redirected_to root_path
    assert_nil session[:return_to]
    assert_equal HIVE_KEYCHAIN_ACCOUNT, session[:current_account].name
  end

  def test_hive_keychain_authorized_redirects_when_public_key_is_not_on_account
    Account.stub(:public_keys, []) do
      get authorized_session_path(HIVE_KEYCHAIN_ACCOUNT), params: hive_keychain_params
    end

    assert_redirected_to new_session_url(account_name: HIVE_KEYCHAIN_ACCOUNT)
    assert_nil session[:current_account]
  end

  def test_hive_keychain_authorized_redirects_when_signature_is_malformed
    Account.stub(:public_keys, [HIVE_KEYCHAIN_PUBLIC_KEY]) do
      get authorized_session_path(HIVE_KEYCHAIN_ACCOUNT), params: hive_keychain_params(signature: 'not-hex')
    end

    assert_redirected_to new_session_url(account_name: HIVE_KEYCHAIN_ACCOUNT)
    assert_nil session[:current_account]
  end

  def test_hive_keychain_authorized_redirects_when_public_key_is_malformed
    public_key = 'STM'

    Account.stub(:public_keys, [public_key]) do
      get authorized_session_path(HIVE_KEYCHAIN_ACCOUNT), params: hive_keychain_params(public_key: public_key)
    end

    assert_redirected_to new_session_url(account_name: HIVE_KEYCHAIN_ACCOUNT)
    assert_nil session[:current_account]
  end

  def test_hive_keychain_authorized_redirects_when_signature_does_not_match_public_key
    Account.stub(:public_keys, [HIVE_KEYCHAIN_PUBLIC_KEY]) do
      get authorized_session_path(HIVE_KEYCHAIN_ACCOUNT), params: hive_keychain_params(digest: '0' * 64)
    end

    assert_redirected_to new_session_url(account_name: HIVE_KEYCHAIN_ACCOUNT)
    assert_nil session[:current_account]
  end

private
  def hive_keychain_params(overrides = {})
    {
      public_key: HIVE_KEYCHAIN_PUBLIC_KEY,
      signature: HIVE_KEYCHAIN_SIGNATURE,
      digest: HIVE_KEYCHAIN_DIGEST
    }.merge(overrides)
  end
end
