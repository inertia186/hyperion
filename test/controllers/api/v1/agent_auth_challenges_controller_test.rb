require 'test_helper'

class Api::V1::AgentAuthChallengesControllerTest < ActionController::TestCase
  tests Api::V1::AgentAuthChallengesController

  test 'creates an auth challenge without an existing session' do
    post :create

    assert_response :created
    payload = response_json
    assert_equal 'pending', payload.fetch('status')
    assert payload.fetch('challenge_id').present?
    assert payload.fetch('expires_at').present?
    assert_includes payload.fetch('hivesigner_login_url'), 'https://hivesigner.com/oauth2/authorize?'
    authorize_params = URI.decode_www_form(URI.parse(payload.fetch('hivesigner_login_url')).query).to_h
    assert_equal hivesigner_callback_api_v1_agent_auth_challenges_url, authorize_params.fetch('redirect_uri')
    assert_equal payload.fetch('challenge_id'), authorize_params.fetch('state')
    assert_equal 'login', authorize_params.fetch('scope')
    assert_includes payload.dig('keychain', 'message'), payload.fetch('challenge_id')
    assert_match(/\A[0-9a-f]{64}\z/, payload.dig('keychain', 'digest'))
  end

  test 'starts an auth challenge with GET for post restricted sandboxes' do
    get :create

    assert_response :created
    payload = response_json
    assert_equal 'pending', payload.fetch('status')
    assert payload.fetch('challenge_id').present?
    assert_includes payload.fetch('hivesigner_login_url'), 'https://hivesigner.com/oauth2/authorize?'
    assert_match(/\A[0-9a-f]{64}\z/, payload.dig('keychain', 'digest'))
  end

  test 'device login uses a fixed callback on the requesting host across challenges' do
    @request.host = 'www.hyperion.zone'
    @request.env['HTTPS'] = 'on'

    requests = 2.times.map do
      post :create
      assert_response :created
      payload = response_json
      params = URI.decode_www_form(URI.parse(payload.fetch('hivesigner_login_url')).query).to_h
      assert_equal payload.fetch('challenge_id'), params.fetch('state')
      assert_equal 'https://www.hyperion.zone/api/v1/agent/auth_challenges/hivesigner_callback', params.fetch('redirect_uri')
      params
    end

    assert_not_equal requests.first.fetch('state'), requests.last.fetch('state')
    assert_recognizes(
      {controller: 'api/v1/agent_auth_challenges', action: 'hivesigner_callback'},
      '/api/v1/agent/auth_challenges/hivesigner_callback'
    )
  end

  test 'hivesigner callback rejects missing unknown and expired state before verifying token' do
    expired = AgentAuthChallenge.issue!
    expired.update!(expires_at: 1.minute.ago)

    HivesignerAuthenticator.stub(:new, ->(_token) { flunk 'Invalid state must not authenticate' }) do
      [nil, 'unknown', expired.token].each do |state|
        get :hivesigner_callback, params: {state: state, access_token: 'token'}
        assert_response :not_found
      end
    end

    assert_nil expired.reload.account
  end

  test 'starts an auth challenge with alternate GET fallback path' do
    get :start

    assert_response :created
    payload = response_json
    assert_equal 'pending', payload.fetch('status')
    assert payload.fetch('challenge_id').present?
    assert_includes payload.fetch('hivesigner_login_url'), 'https://hivesigner.com/oauth2/authorize?'
    assert_match(/\A[0-9a-f]{64}\z/, payload.dig('keychain', 'digest'))
  end

  test 'returns challenge status' do
    challenge = AgentAuthChallenge.issue!

    get :show, params: {id: challenge.token}

    assert_response :success
    assert_equal challenge.token, response_json.fetch('challenge_id')
    assert_equal 'pending', response_json.fetch('status')
  end

  test 'hivesigner callback authorizes challenge and renders copy code' do
    challenge = AgentAuthChallenge.issue!
    account = accounts(:curated)

    HivesignerAuthenticator.stub(:new, ->(_token) { FakeHivesignerAuthenticator.new(account) }) do
      get :hivesigner_callback, params: {state: challenge.token, access_token: 'token'}
    end

    assert_response :success
    assert_equal 'text/html', response.media_type
    assert_includes response.body, 'Signed in as'
    assert_match(/HYP-[A-Z0-9]{6}/, response.body)
    assert_equal account, challenge.reload.account
    assert challenge.verification_code_digest.present?
  end

  test 'hivesigner callback refresh before redeem does not replace copy code' do
    challenge = AgentAuthChallenge.issue!
    account = accounts(:curated)

    HivesignerAuthenticator.stub(:new, ->(_token) { FakeHivesignerAuthenticator.new(account) }) do
      get :hivesigner_callback, params: {state: challenge.token, access_token: 'token'}
    end

    original_digest = challenge.reload.verification_code_digest

    HivesignerAuthenticator.stub(:new, ->(_token) { flunk 'HiveSigner should not be revalidated after challenge authorization' }) do
      get :hivesigner_callback, params: {state: challenge.token, access_token: 'token'}
    end

    assert_response :success
    assert_includes response.body, 'already authorized'
    assert_no_match(/HYP-[A-Z0-9]{6}/, response.body)
    assert_equal original_digest, challenge.reload.verification_code_digest
    assert_nil challenge.redeemed_at
  end

  test 'redeems hivesigner copy code and sets current session account' do
    challenge = AgentAuthChallenge.issue!
    code = challenge.authorize_for_copy_code!(accounts(:curated))

    post :redeem, params: {id: challenge.token, code: code.downcase}

    assert_response :success
    assert_equal true, response_json.fetch('authenticated')
    assert_equal 'Bearer', response_json.fetch('token_type')
    assert_match(/\Ahyp_at_/, response_json.fetch('bearer_token'))
    assert_equal 'fixture-curator', response_json.dig('account', 'name')
    assert_equal accounts(:curated).id, session[:current_account].id
    assert challenge.reload.redeemed_at.present?
    assert_equal accounts(:curated), AgentAccessToken.account_for(response_json.fetch('bearer_token'))
  end

  test 'redeems hivesigner copy code with GET for post restricted sandboxes' do
    challenge = AgentAuthChallenge.issue!
    code = challenge.authorize_for_copy_code!(accounts(:curated))

    get :redeem, params: {id: challenge.token, code: code.downcase}

    assert_response :success
    assert_equal true, response_json.fetch('authenticated')
    assert_match(/\Ahyp_at_/, response_json.fetch('bearer_token'))
    assert_equal 'fixture-curator', response_json.dig('account', 'name')
    assert_equal accounts(:curated).id, session[:current_account].id
    assert challenge.reload.redeemed_at.present?
  end

  test 'GET redeem rejects foreign browser origins' do
    challenge = AgentAuthChallenge.issue!
    code = challenge.authorize_for_copy_code!(accounts(:curated))
    @request.headers['Origin'] = 'https://evil.example'

    get :redeem, params: {id: challenge.token, code: code}

    assert_response :forbidden
    assert_equal 'Forbidden origin', response_json.fetch('error')
    assert_nil session[:current_account]
  end

  test 'hivesigner callback after redeem does not reset redeemed challenge' do
    challenge = AgentAuthChallenge.issue!
    code = challenge.authorize_for_copy_code!(accounts(:curated))
    challenge.redeem!(code)
    redeemed_at = challenge.reload.redeemed_at
    original_digest = challenge.verification_code_digest

    HivesignerAuthenticator.stub(:new, ->(_token) { flunk 'HiveSigner should not be revalidated after challenge redeem' }) do
      get :hivesigner_callback, params: {state: challenge.token, access_token: 'token'}
    end

    assert_response :success
    assert_includes response.body, 'already been redeemed'
    assert_no_match(/HYP-[A-Z0-9]{6}/, response.body)
    assert_equal redeemed_at.to_i, challenge.reload.redeemed_at.to_i
    assert_equal original_digest, challenge.verification_code_digest
  end

  test 'redeem rejects invalid copy code' do
    challenge = AgentAuthChallenge.issue!
    challenge.authorize_for_copy_code!(accounts(:curated))

    post :redeem, params: {id: challenge.token, code: 'HYP-WRONG1'}

    assert_response :unprocessable_entity
    assert_equal 'Invalid verification code.', response_json.fetch('error')
    assert_nil session[:current_account]
  end

  test 'keychain completion validates challenge digest and signature' do
    challenge = AgentAuthChallenge.issue!

    HiveKeychainAuthenticator.stub(:valid_signature?, true) do
      post :keychain, params: {
        id: challenge.token,
        account_name: 'fixture-curator',
        public_key: 'STM1111111111111111111111111111111114T1Anm',
        digest: challenge.keychain_digest,
        signature: 'signature'
      }
    end

    assert_response :success
    assert_equal true, response_json.fetch('authenticated')
    assert_equal 'Bearer', response_json.fetch('token_type')
    assert_match(/\Ahyp_at_/, response_json.fetch('bearer_token'))
    assert_equal 'fixture-curator', response_json.dig('account', 'name')
    assert_equal accounts(:curated).id, session[:current_account].id
    assert challenge.reload.redeemed_at.present?
    assert_equal accounts(:curated), AgentAccessToken.account_for(response_json.fetch('bearer_token'))
  end

  test 'keychain completion rejects signatures over the wrong digest' do
    challenge = AgentAuthChallenge.issue!

    HiveKeychainAuthenticator.stub(:valid_signature?, true) do
      post :keychain, params: {
        id: challenge.token,
        account_name: 'fixture-curator',
        public_key: 'STM1111111111111111111111111111111114T1Anm',
        digest: '0' * 64,
        signature: 'signature'
      }
    end

    assert_response :unprocessable_entity
    assert_equal 'Invalid challenge digest.', response_json.fetch('error')
    assert_nil session[:current_account]
  end

  test 'expired challenge is not redeemable' do
    challenge = AgentAuthChallenge.issue!
    code = challenge.authorize_for_copy_code!(accounts(:curated))
    challenge.update!(expires_at: 1.minute.ago)

    post :redeem, params: {id: challenge.token, code: code}

    assert_response :not_found
  end

  test 'create rejects foreign browser origins' do
    @request.headers['Origin'] = 'https://evil.example'

    post :create

    assert_response :forbidden
    assert_equal 'Forbidden origin', response_json.fetch('error')
  end

  test 'start rejects foreign browser origins' do
    @request.headers['Origin'] = 'https://evil.example'

    get :start

    assert_response :forbidden
    assert_equal 'Forbidden origin', response_json.fetch('error')
  end

private
  FakeHivesignerAuthenticator = Struct.new(:account)

  def response_json
    JSON.parse(response.body)
  end
end
