class SessionsController < ApplicationController
  skip_before_action :sign_in
  protect_from_forgery with: :exception
  before_action :prevent_caching
  rescue_from ActiveRecord::RecordNotFound, ArgumentError, ActiveRecord::RecordInvalid, with: :login_failed

  def new
    @account_name = params[:account_name]
    alert = flash[:alert]
    reset_session
    flash.now[:alert] = alert if alert
  end

  def create
    binding = session[:wallet_login_binding] ||= SecureRandom.hex(32)
    challenge = WalletLoginChallenge.issue!(
      account_name: params[:account_name].to_s.strip.downcase.delete_prefix('@'),
      provider: params[:provider].to_s, binding: binding, origin: request.base_url
    )
    payload = {token: challenge.token, account_name: challenge.account_name, provider: challenge.provider, message: challenge.message, expires_at: challenge.expires_at}
    if challenge.provider == 'hivesigner'
      payload[:redirect_url] = "https://hivesigner.com/oauth2/authorize?#{URI.encode_www_form(
        client_id: 'hyperion.zone', redirect_uri: authorized_sessions_url,
        scope: 'login', state: challenge.token
      )}"
    end
    render json: payload, status: :created
  end

  def complete
    challenge = WalletLoginChallenge.find_by!(token: params[:token])
    raise ArgumentError, 'Use the HiveSigner callback to complete login.' if challenge.provider == 'hivesigner'

    account = challenge.consume!(session[:wallet_login_binding]) do
      if WalletSignatureAuthenticator.valid?(account_name: challenge.account_name, message: challenge.message, signature: params[:signature])
        Account.find_or_create_by!(name: challenge.account_name)
      end
    end
    establish_session(account, challenge.provider)
    render json: {authenticated: true, redirect_url: root_path}
  end

  def authorized
    challenge = WalletLoginChallenge.find_by!(token: params[:state])
    raise ArgumentError, 'Invalid wallet callback.' unless challenge.provider == 'hivesigner'

    account = challenge.consume!(session[:wallet_login_binding]) do
      Timeout.timeout(5) { HivesignerAuthenticator.new(params[:access_token]).account }
    end
    establish_session(account, 'hivesigner')
    redirect_to root_path
  rescue Timeout::Error, SocketError, IOError, SystemCallError, OpenSSL::SSL::SSLError
    login_failed
  end

  def destroy
    reset_session
    redirect_to new_session_url
  end

private
  def prevent_caching
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
  end

  def establish_session(account, provider)
    reset_session
    session[:current_account] = account
    session[:wallet_provider] = provider
  end

  def login_failed
    if request.format.json?
      render json: {error: 'Login could not be verified. Please start again.'}, status: :unprocessable_entity
    else
      redirect_to new_session_url, alert: 'Login could not be verified. Please start again.'
    end
  end
end
