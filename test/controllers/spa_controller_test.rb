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
    assert_select '#root', count: 1
    assert_select 'script[src="https://cdn.jsdelivr.net/npm/@hiveio/hive-js/dist/hive.min.js"]', count: 0
    assert_select 'meta[name="hive-api-url"]', count: 0
  end
end
