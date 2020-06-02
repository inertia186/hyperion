class SessionsController < ApplicationController
  skip_before_action :sign_in
  
  def new
    @account_name = params[:account_name]
    
    session[:current_account] = nil
  end
  
  def create
    @account_name = params[:account_name]
    @random_oneliner = random_oneliner
    
    render :hive_keychain_request_sign_buffer
  end
  
  def authorized
    account_name = params[:id]
    public_key = params[:public_key]
    
    raise 'public key does not match account' unless Account.public_keys(account_name).include? public_key
    
    pub = Bitcoin.decode_base58(public_key[3..-1])[0..65]
    digest = params[:digest].split.pack('H*')
    signature = params[:signature].split.pack('H*')
    
    account = if pub == Bitcoin::OpenSSL_EC.recover_compact(digest, signature)
      Account.find_or_create_by(name: account_name)
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
end
