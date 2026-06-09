class SessionsController < ApplicationController
  skip_before_action :sign_in
  
  def new
    @account_name = params[:account_name]
    
    session[:current_account] = nil
  end
  
  def create
    @account_name = params[:account_name]
    @random_oneliner = random_oneliner
    
    if !!params[:hivesigner]
      redirect_to_hivesigner
    else
      render :hive_keychain_request_sign_buffer
    end
  end
  
  def authorized
    account_name = params[:id] || params[:username]
    public_key = params[:public_key]
    access_token = params[:access_token]
    expires_in = params[:expires_in]
    
    # hive keychain
    if !!account_name && !!public_key
      account = if hive_keychain_signature_valid?(account_name, public_key, params[:digest], params[:signature])
        Account.find_or_create_by(name: account_name)
      end
    end
    
    # hivesigner
    if !!account_name && !!access_token
      account = HivesignerAuthenticator.new(access_token).account

      if account
        session[:hivesigner_access_token] = access_token
      end
    end
    
    if !!account && account.persisted?
      session[:current_account] = account
      session[:return_to] = nil
      
      redirect_to root_path
      
      return
    end
    
    redirect_to new_session_url(account_name: account_name)
  end
  
  def destroy
    reset_session
    
    redirect_to new_session_url
  end

private
  def redirect_to_hivesigner
    hivesigner_url = "https://hivesigner.com/oauth2/authorize?#{hivesigner_authorize_params}"

    if request.xhr?
      render plain: "window.location.assign(#{hivesigner_url.to_json});", content_type: 'text/javascript'
    else
      redirect_to hivesigner_url, allow_other_host: true
    end
  end

  def hivesigner_authorize_params
    URI.encode_www_form(
      client_id: 'hyperion.zone',
      redirect_uri: authorized_sessions_url,
      scope: 'login'
    )
  end

  def hivesigner_cert_store
    HivesignerAuthenticator.cert_store
  end

  def hive_keychain_signature_valid?(account_name, public_key, digest_hex, signature_hex)
    HiveKeychainAuthenticator.valid_signature?(
      account_name: account_name,
      public_key: public_key,
      digest_hex: digest_hex,
      signature_hex: signature_hex
    )
  end
end
