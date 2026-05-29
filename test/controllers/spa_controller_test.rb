require 'test_helper'

class SpaControllerTest < ActionController::TestCase
  tests SpaController

  test 'requires authentication' do
    get :show

    assert_redirected_to new_session_url
  end

  test 'renders authenticated spa shell' do
    @request.session[:current_account] = accounts(:curated)

    get :show

    assert_response :success
    assert_includes response.body, "id='root'"
  end
end
