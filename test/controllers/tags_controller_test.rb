require 'test_helper'

class TagsControllerTest < ActionController::TestCase
  setup do
    @request.session[:current_account] = accounts(:curated)
  end

  test 'html tag mutations honor internal return_to urls' do
    post :create_favorite, params: {id: 'rails', return_to: '/tags/favorite'}

    assert_redirected_to '/tags/favorite'
  end

  test 'html tag mutations ignore external return_to urls' do
    post :create_favorite, params: {id: 'rails', return_to: 'https://example.com/phishing', sort: 'name_asc', limit: '10', type: 'favorite'}

    assert_redirected_to tags_url(sort: 'name_asc', limit: 10, type: :favorite)
  end
end
