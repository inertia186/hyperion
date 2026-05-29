class SessionsController < ApplicationController
  require 'rbsecp256k1'

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
      uri = URI.parse('https://hivesigner.com/api/me')
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.cert_store = hivesigner_cert_store
      request = Net::HTTP::Get.new(uri.request_uri)
      request['Authorization'] = access_token
      response = http.request(request)
      payload = JSON[response.body]
      account_name = payload['user']
      
      if response.code == '200'
        account = Account.find_or_create_by(name: account_name)
        session[:hivesigner_access_token] = access_token
      end
    end
    
    if !!account && account.persisted?
      session[:current_account] = account
      return_to = session[:return_to]
      session[:return_to] = nil
      
      redirect_to return_to || posts_path
      
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
    store = OpenSSL::X509::Store.new
    store.set_default_paths
    store.flags = 0 if store.respond_to?(:flags=)
    store
  end

  def hive_keychain_signature_valid?(account_name, public_key, digest_hex, signature_hex)
    return false unless Account.public_keys(account_name).include?(public_key)

    expected_public_key = [Bitcoin.decode_base58(public_key[3..-1])[0, 66]].pack('H*')
    digest = [digest_hex.to_s].pack('H*')
    signature = [signature_hex.to_s].pack('H*')

    return false unless digest.bytesize == 32
    return false unless signature.bytesize == 65

    recovery_id = (signature.bytes.first - 27) & 3
    compact_signature = signature.byteslice(1, 64)
    recoverable_signature = Secp256k1::Context.new.recoverable_signature_from_compact(compact_signature, recovery_id)

    recoverable_signature.recover_public_key(digest).compressed == expected_public_key
  rescue ArgumentError, TypeError, NoMethodError, Secp256k1::Error
    false
  end
end
