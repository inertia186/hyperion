require 'test_helper'
require 'timeout'

class SessionConcurrencyTest < ActionDispatch::IntegrationTest
  self.use_transactional_tests = false

  setup do
    @previous_forgery_protection = SessionsController.allow_forgery_protection
    SessionsController.allow_forgery_protection = true
  end

  teardown do
    SessionsController.allow_forgery_protection = @previous_forgery_protection
    WalletLoginChallenge.delete_all
    ActiveRecord::SessionStore::Session.delete_all
  end

  test 'concurrent first HiveSigner logins keep both issued challenges bound to the browser' do
    get new_session_path
    csrf = css_select('meta[name="csrf-token"]').first['content']
    tabs = 2.times.map do
      open_session.tap { |tab| cookies.to_hash.each { |key, value| tab.cookies[key] = value } }
    end
    ready = Queue.new
    release = Queue.new
    issue = WalletLoginChallenge.method(:issue!)
    pause_before_issuing = ->(**arguments) do
      ready << true
      release.pop
      issue.call(**arguments)
    end

    WalletLoginChallenge.stub(:issue!, pause_before_issuing) do
      requests = tabs.map do |tab|
        Thread.new do
          tab.post sessions_path, params: {account_name: 'fixture-curator', provider: 'hivesigner'},
            as: :json, headers: {'X-CSRF-Token' => csrf}
        end
      end
      begin
        Timeout.timeout(10) { 2.times { ready.pop } }
      ensure
        2.times { release << true }
        requests.each(&:join)
      end
      requests.each(&:value)
    end

    assert_equal [201, 201], tabs.map { |tab| tab.response.status }
    challenges = tabs.map { |tab| WalletLoginChallenge.find_by!(token: tab.response.parsed_body.fetch('token')) }
    assert_equal 1, challenges.map(&:session_digest).uniq.size
    assert_equal 2, challenges.map(&:token).uniq.size

    get new_session_path
    challenges.each { |challenge| assert challenge.available_for?(session.id.private_id) }
    HivesignerAuthenticator.stub(:new, Struct.new(:account).new(accounts(:curated))) do
      get authorized_sessions_path, params: {state: challenges.first.token, access_token: 'valid-token'}
    end
    assert_redirected_to root_path
    assert_equal 'fixture-curator', session[:current_account].name
  end

  test 'a saved pre-logout cookie cannot redeem a HiveSigner challenge' do
    get new_session_path
    csrf = css_select('meta[name="csrf-token"]').first['content']
    post sessions_path, params: {account_name: 'fixture-curator', provider: 'hivesigner'},
      as: :json, headers: {'X-CSRF-Token' => csrf}
    assert_response :created
    challenge = WalletLoginChallenge.find_by!(token: response.parsed_body.fetch('token'))
    saved_tab = open_session
    cookies.to_hash.each { |key, value| saved_tab.cookies[key] = value }

    delete session_path('fixture-curator'), headers: {'X-CSRF-Token' => csrf}
    assert_redirected_to new_session_url

    HivesignerAuthenticator.stub(:new, ->(*) { flunk 'A logged-out session must not verify a token' }) do
      saved_tab.get authorized_sessions_path, params: {state: challenge.token, access_token: 'valid-token'}
    end
    assert_equal 302, saved_tab.response.status
    assert_equal new_session_url, saved_tab.response.location
    assert_nil saved_tab.request.session[:current_account]
    assert_nil challenge.reload.consumed_at
  end
end
