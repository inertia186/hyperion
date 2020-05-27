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
    @account_name = params[:id]
    @public_key = params[:public_key]
    @response = params[:response]
    
    # TODO Actually check this
    
    @account = Account.find_or_create_by(name: @account_name)
    
    if @account.persisted?
      session[:current_account] = @account
      
      redirect_to posts_path
    else
      redirect_to new_session_url(account_name: @account_name)
    end
  end
  
  def destroy
    reset_session
    
    redirect_to new_session_url
  end
end
