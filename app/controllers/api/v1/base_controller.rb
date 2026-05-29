class Api::V1::BaseController < ApplicationController
  private

  def sign_in
    return if current_account

    render json: {authenticated: false, login_url: new_session_url}, status: :unauthorized
  end
end
