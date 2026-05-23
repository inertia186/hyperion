require 'test_helper'

class SessionsControllerTest < ActionDispatch::IntegrationTest
  def test_routings
    assert_routing 'sessions/account/authorized', controller: 'sessions', action: 'authorized', id: 'account'
    assert_routing 'sessions/authorized', controller: 'sessions', action: 'authorized'
    assert_routing 'sessions/new', controller: 'sessions', action: 'new'
    assert_routing({ method: 'post', path: '/sessions' }, controller: 'sessions', action: 'create')
    assert_routing({ method: 'delete', path: '/sessions/account' }, controller: 'sessions', action: 'destroy', id: 'account')
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

  def test_hivesigner_cert_store_does_not_require_crl
    store = SessionsController.new.send(:hivesigner_cert_store)

    assert_instance_of OpenSSL::X509::Store, store
  end
end
