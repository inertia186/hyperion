require 'test_helper'

class SessionsControllerTest < ActionDispatch::IntegrationTest
  test 'login shows enabled wallets and agent discovery' do
    get new_session_path

    assert_response :success
    assert_select 'a[data-agent-discovery="true"][href="/.well-known/hyperion-agent.json"]'
    assert_select 'button[value="keychain"]', text: 'Hive Keychain'
    assert_select 'button[value="hivesigner"]', text: 'HiveSigner'
    assert_select 'button[value="hiveauth"]', count: 0
    assert_select 'button[value="peakvault"]', count: 0
  end

  test 'additional wallets can be enabled for verification' do
    with_env('HYPERION_WALLET_PROVIDERS' => 'keychain,hivesigner,hiveauth,peakvault') do
      get new_session_path
      assert_select 'button[value="hiveauth"]'
      assert_select 'button[value="peakvault"]'
    end
  end

  test 'opening another login page preserves the earlier forms CSRF token' do
    previous = SessionsController.allow_forgery_protection
    SessionsController.allow_forgery_protection = true
    get new_session_path
    tab_a_token = css_select('meta[name="csrf-token"]').first['content']

    get new_session_path
    post sessions_path, params: {account_name: 'fixture-curator', provider: 'keychain'}, as: :json, headers: {'X-CSRF-Token' => tab_a_token}

    assert_response :created
  ensure
    SessionsController.allow_forgery_protection = previous
  end

  test 'opening another login page preserves a pending challenge and its CSRF token' do
    previous = SessionsController.allow_forgery_protection
    SessionsController.allow_forgery_protection = true
    get new_session_path
    tab_a_token = css_select('meta[name="csrf-token"]').first['content']
    post sessions_path, params: {account_name: 'fixture-curator', provider: 'keychain'}, as: :json, headers: {'X-CSRF-Token' => tab_a_token}
    assert_response :created
    challenge = WalletLoginChallenge.find_by!(token: response.parsed_body.fetch('token'))

    get new_session_path
    assert challenge.available_for?(session[:wallet_login_binding])
    WalletSignatureAuthenticator.stub(:valid?, true) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json, headers: {'X-CSRF-Token' => tab_a_token}
    end

    assert_response :success
    assert_equal 'fixture-curator', session[:current_account].name
    assert_nil session[:wallet_login_binding]
  ensure
    SessionsController.allow_forgery_protection = previous
  end

  test 'viewing login preserves authentication until explicit logout or a completed replacement login' do
    challenge = start_login
    WalletSignatureAuthenticator.stub(:valid?, true) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json
    end
    get new_session_path

    assert_equal 'fixture-curator', session[:current_account]&.name
    assert_equal 'keychain', session[:wallet_provider]
  end

  test 'issues a challenge bound to the normalized account and browser' do
    challenge = start_login(account_name: ' @Fixture-Curator ')

    assert_equal 'fixture-curator', challenge.account_name
    assert_equal 'keychain', challenge.provider
    assert_includes challenge.message, challenge.token
    assert_includes challenge.message, 'http://www.example.com'
    assert_includes challenge.message, '@fixture-curator'
    assert challenge.available_for?(session[:wallet_login_binding])
    assert_nil session[:current_account]
  end

  test 'rejects unknown providers and invalid accounts' do
    ['metamasksnap', 'hiveauth', '', 'keychain'].each do |provider|
      post sessions_path, params: {account_name: '<script>', provider: provider}, as: :json
      assert_response :unprocessable_entity
    end
    assert_equal 0, WalletLoginChallenge.count
  end

  test 'signed login verifies the server message and rotates the session without issuing an agent token' do
    challenge = start_login
    verifier = ->(account_name:, message:, signature:) do
      assert_equal 'fixture-curator', account_name
      assert_equal challenge.message, message
      assert_equal 'signed-proof', signature
      true
    end
    assert_no_difference('AgentAccessToken.count') do
      WalletSignatureAuthenticator.stub(:valid?, verifier) do
        post complete_sessions_path, params: {token: challenge.token, signature: 'signed-proof', digest: 'attacker-digest', account_name: 'attacker'}, as: :json
      end
    end

    assert_response :success
    assert_equal 'fixture-curator', session[:current_account].name
    assert_equal 'keychain', session[:wallet_provider]
    assert_nil session[:wallet_login_binding]
    assert challenge.reload.consumed_at
  end

  test 'expired and replayed challenges never authenticate' do
    challenge = start_login
    challenge.update!(expires_at: 1.second.ago)
    WalletSignatureAuthenticator.stub(:valid?, ->(**) { flunk 'Expired challenge must not verify' }) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json
      assert_response :unprocessable_entity
    end
    challenge = start_login
    WalletSignatureAuthenticator.stub(:valid?, true) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json
      assert_response :success
    end
    WalletSignatureAuthenticator.stub(:valid?, ->(**) { flunk 'Used challenge must not verify' }) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json
      assert_response :unprocessable_entity
    end
  end

  test 'a challenge from a different browser cannot be redeemed' do
    challenge = start_login
    other = open_session
    WalletSignatureAuthenticator.stub(:valid?, ->(**) { flunk 'Wrong browser must not verify' }) do
      other.post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json
      assert_equal 422, other.response.status
    end
    assert_nil challenge.reload.consumed_at
  end

  test 'invalid signatures do not establish a session or consume the challenge' do
    challenge = start_login
    WalletSignatureAuthenticator.stub(:valid?, false) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'bad-proof'}, as: :json
    end
    assert_response :unprocessable_entity
    assert_nil session[:current_account]
    assert_nil challenge.reload.consumed_at
  end

  test 'legacy client supplied digest login is rejected' do
    get authorized_session_path('fixture-curator'), params: {digest: 'a' * 64, signature: 'a' * 130, public_key: 'key'}
    assert_redirected_to new_session_url
    assert_nil session[:current_account]
  end

  test 'HiveSigner uses a fixed callback on the current host and only login scope' do
    host! 'hyperion.test'
    challenge = start_login(provider: 'hivesigner')
    params = URI.decode_www_form(URI.parse(response.parsed_body.fetch('redirect_url')).query).to_h
    assert_equal 'http://hyperion.test/sessions/authorized', params.fetch('redirect_uri')
    assert_equal 'login', params.fetch('scope')
    assert_equal 'hyperion.zone', params.fetch('client_id')
    assert_equal challenge.token, params.fetch('state')
  end

  test 'HiveSigner callback verifies the token and account and consumes state' do
    challenge = start_login(provider: 'hivesigner')
    authenticator = Struct.new(:account).new(accounts(:curated))
    HivesignerAuthenticator.stub(:new, ->(token) { assert_equal 'token', token; authenticator }) do
      get authorized_sessions_path, params: {state: challenge.token, access_token: 'token', username: 'untrusted-name'}
    end
    assert_redirected_to root_path
    assert_equal 'fixture-curator', session[:current_account].name
    assert_equal 'hivesigner', session[:wallet_provider]
    assert_nil session[:hivesigner_access_token]
    assert challenge.reload.consumed_at
    HivesignerAuthenticator.stub(:new, ->(*) { flunk 'Used state must not verify' }) do
      get authorized_sessions_path, params: {state: challenge.token, access_token: 'token'}
    end
    assert_redirected_to new_session_url
  end

  test 'HiveSigner rejects another account and missing state' do
    challenge = start_login(provider: 'hivesigner')
    authenticator = Struct.new(:account).new(Account.new(name: 'different-account'))
    HivesignerAuthenticator.stub(:new, authenticator) do
      get authorized_sessions_path, params: {state: challenge.token, access_token: 'token'}
    end
    assert_redirected_to new_session_url
    assert_nil session[:current_account]
    assert_nil challenge.reload.consumed_at
    get authorized_sessions_path, params: {access_token: 'token'}
    assert_redirected_to new_session_url
  end

  test 'logout clears the Rails wallet and account' do
    challenge = start_login
    WalletSignatureAuthenticator.stub(:valid?, true) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json
    end
    delete session_path('fixture-curator')
    assert_redirected_to new_session_url
    assert_nil session[:current_account]
    assert_nil session[:wallet_provider]
  end

  test 'HiveSigner network failures return a useful login error without consuming state' do
    challenge = start_login(provider: 'hivesigner')
    authenticator = Object.new
    def authenticator.account = raise(SocketError, 'unavailable')
    HivesignerAuthenticator.stub(:new, authenticator) do
      get authorized_sessions_path, params: {state: challenge.token, access_token: 'token'}
    end
    assert_redirected_to new_session_url
    assert_nil session[:current_account]
    assert_nil challenge.reload.consumed_at
    follow_redirect!
    assert_select '#error-alert:not([hidden])', text: 'Login could not be verified. Please start again.'
  end

  test 'browser challenge endpoints require CSRF protection and responses are not cached' do
    previous = SessionsController.allow_forgery_protection
    SessionsController.allow_forgery_protection = true
    assert_no_difference('WalletLoginChallenge.count') do
      post sessions_path, params: {account_name: 'fixture-curator', provider: 'keychain'}, as: :json
    end
    assert_response :unprocessable_entity
    assert_equal 'Your login page is out of date. Reload this page and try again.', response.parsed_body.fetch('error')
    assert_equal 'no-store', response.headers['Cache-Control']
    get new_session_path
    token = css_select('meta[name="csrf-token"]').first['content']
    post sessions_path, params: {account_name: 'fixture-curator', provider: 'keychain'}, as: :json, headers: {'X-CSRF-Token' => token}
    assert_response :created
    assert_equal 'no-store', response.headers['Cache-Control']
    WalletSignatureAuthenticator.stub(:valid?, ->(**) { flunk 'CSRF failure must not verify a signature' }) do
      post complete_sessions_path, params: {token: response.parsed_body.fetch('token'), signature: 'proof'}, as: :json
    end
    assert_response :unprocessable_entity
    assert_equal 'Your login page is out of date. Reload this page and try again.', response.parsed_body.fetch('error')
  ensure
    SessionsController.allow_forgery_protection = previous
  end

  test 'logout still invalidates old forms and challenges and a fresh form recovers' do
    previous = SessionsController.allow_forgery_protection
    SessionsController.allow_forgery_protection = true
    get new_session_path
    old_token = css_select('meta[name="csrf-token"]').first['content']
    post sessions_path, params: {account_name: 'fixture-curator', provider: 'keychain'}, as: :json, headers: {'X-CSRF-Token' => old_token}
    challenge = WalletLoginChallenge.find_by!(token: response.parsed_body.fetch('token'))
    delete session_path('fixture-curator'), headers: {'X-CSRF-Token' => old_token}
    assert_redirected_to new_session_url
    follow_redirect!
    tab_a_token = css_select('meta[name="csrf-token"]').first['content']

    assert_no_difference('WalletLoginChallenge.count') do
      post sessions_path, params: {account_name: 'fixture-curator', provider: 'keychain'}, as: :json, headers: {'X-CSRF-Token' => old_token}
    end
    assert_response :unprocessable_entity
    assert_match 'Reload this page', response.parsed_body.fetch('error')

    get new_session_path
    WalletSignatureAuthenticator.stub(:valid?, ->(**) { flunk 'Logout must invalidate the old challenge' }) do
      post complete_sessions_path, params: {token: challenge.token, signature: 'proof'}, as: :json, headers: {'X-CSRF-Token' => tab_a_token}
    end
    assert_response :unprocessable_entity
    assert_nil session[:current_account]
    assert_nil challenge.reload.consumed_at

    post sessions_path, params: {account_name: 'fixture-curator', provider: 'keychain'}, as: :json, headers: {'X-CSRF-Token' => tab_a_token}
    assert_response :created
  ensure
    SessionsController.allow_forgery_protection = previous
  end

private
  def start_login(account_name: 'fixture-curator', provider: 'keychain')
    post sessions_path, params: {account_name: account_name, provider: provider}, as: :json
    assert_response :created
    WalletLoginChallenge.find_by!(token: response.parsed_body.fetch('token'))
  end
end
