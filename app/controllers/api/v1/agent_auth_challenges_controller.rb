class Api::V1::AgentAuthChallengesController < Api::V1::BaseController
  protect_from_forgery except: %i(create redeem keychain)
  skip_before_action :sign_in
  before_action :validate_agent_origin!, only: %i(create redeem keychain)
  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  def create
    challenge = AgentAuthChallenge.issue!

    render json: challenge_payload(challenge), status: :created
  end

  def show
    challenge = AgentAuthChallenge.find_by!(token: params[:id])

    render json: challenge_status_payload(challenge)
  end

  def hivesigner_callback
    challenge = AgentAuthChallenge.find_available!(params[:id])
    account = HivesignerAuthenticator.new(params[:access_token]).account

    unless account
      render plain: 'Hyperion could not verify this HiveSigner login.', status: :unauthorized
      return
    end

    code = challenge.authorize_for_copy_code!(account)
    render html: hivesigner_success_html(account, code, challenge).html_safe
  end

  def redeem
    challenge = AgentAuthChallenge.find_available!(params[:id])
    account = challenge.redeem!(params[:code])
    session[:current_account] = account

    render json: authenticated_payload(challenge, account)
  rescue ArgumentError => e
    render json: {error: e.message}, status: :unprocessable_entity
  end

  def keychain
    challenge = AgentAuthChallenge.find_available!(params[:id])

    unless params[:digest].to_s == challenge.keychain_digest
      render json: {error: 'Invalid challenge digest.'}, status: :unprocessable_entity
      return
    end

    unless HiveKeychainAuthenticator.valid_signature?(
      account_name: params[:account_name],
      public_key: params[:public_key],
      digest_hex: params[:digest],
      signature_hex: params[:signature]
    )
      render json: {error: 'Invalid Keychain signature.'}, status: :unauthorized
      return
    end

    account = Account.find_or_create_by!(name: params[:account_name])
    challenge.complete_keychain!(account)
    session[:current_account] = account

    render json: authenticated_payload(challenge, account)
  end

private
  def challenge_payload(challenge)
    challenge_status_payload(challenge).merge(
      hivesigner_login_url: hivesigner_login_url(challenge),
      keychain: {
        message: challenge.keychain_message,
        digest: challenge.keychain_digest
      }
    )
  end

  def challenge_status_payload(challenge)
    {
      challenge_id: challenge.token,
      status: challenge_status(challenge),
      expires_at: challenge.expires_at.iso8601
    }
  end

  def authenticated_payload(challenge, account)
    {
      challenge_id: challenge.token,
      authenticated: true,
      account: {
        id: account.id,
        name: account.name,
        avatar_url: "https://images.hive.blog/u/#{account.name}/avatar"
      }
    }
  end

  def challenge_status(challenge)
    return 'expired' if challenge.expired?
    return 'redeemed' if challenge.redeemed_at.present?
    return 'authorized' if challenge.account_id.present?

    'pending'
  end

  def hivesigner_login_url(challenge)
    "https://hivesigner.com/oauth2/authorize?#{URI.encode_www_form(hivesigner_authorize_params(challenge))}"
  end

  def hivesigner_authorize_params(challenge)
    {
      client_id: 'hyperion.zone',
      redirect_uri: hivesigner_callback_api_v1_agent_auth_challenge_url(challenge.token),
      scope: 'login'
    }
  end

  def hivesigner_success_html(account, code, challenge)
    escaped_account = ERB::Util.html_escape(account.name)
    escaped_code = ERB::Util.html_escape(code)
    escaped_expires_at = ERB::Util.html_escape(challenge.expires_at.iso8601)

    <<~HTML
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Hyperion Agent Login</title>
        </head>
        <body>
          <main>
            <h1>Hyperion agent login</h1>
            <p>Signed in as <strong>#{escaped_account}</strong>.</p>
            <p>Copy this one-time code back to your agent:</p>
            <pre style="font-size: 2rem; font-weight: bold;">#{escaped_code}</pre>
            <p>This code expires at #{escaped_expires_at}.</p>
          </main>
        </body>
      </html>
    HTML
  end

  def validate_agent_origin!
    return if request.origin.blank?

    origin = URI.parse(request.origin)
    return if origin.scheme == request.scheme && origin.host == request.host && origin.port == request.port

    render json: {error: 'Forbidden origin'}, status: :forbidden
  rescue URI::InvalidURIError
    render json: {error: 'Forbidden origin'}, status: :forbidden
  end

  def not_found
    render json: {error: 'Challenge not found or expired.'}, status: :not_found
  end
end
