require 'test_helper'

class Api::V1::TagsControllerTest < ActionController::TestCase
  tests Api::V1::TagsController

  setup do
    @request.session[:current_account] = accounts(:curated)
  end

  test 'ignored tag mutations update current account state' do
    post :create_ignored, params: {tag: 'new-spam'}

    assert_response :created
    assert_includes response_json.fetch('ignored_tags'), 'new-spam'

    delete :destroy_ignored, params: {tag: 'new-spam'}

    assert_response :success
    assert_not_includes response_json.fetch('ignored_tags'), 'new-spam'
  end

  test 'favorite and past tag mutations update current account state' do
    post :create_favorite, params: {tag: 'new-favorite'}

    assert_response :created
    assert_includes response_json.fetch('favorite_tags'), 'new-favorite'

    delete :destroy_favorite, params: {tag: 'new-favorite'}

    assert_response :success
    assert_not_includes response_json.fetch('favorite_tags'), 'new-favorite'

    delete :destroy_past, params: {tag: 'haf'}

    assert_response :success
    assert_not_includes response_json.fetch('past_tags').map { |tag| tag.fetch('tag') }, 'haf'
  end

  test 'bulk tag cleanup mutations update current account state' do
    accounts(:curated).past_tags.create!(tag: 'spam')
    accounts(:curated).past_tags.create!(tag: 'not-ignored')

    delete :destroy_past_tags, params: {only_ignored: true}

    assert_response :success
    assert_not_includes response_json.fetch('past_tags').map { |tag| tag.fetch('tag') }, 'spam'
    assert_includes response_json.fetch('past_tags').map { |tag| tag.fetch('tag') }, 'not-ignored'

    delete :destroy_ignored_tags

    assert_response :success
    assert_empty response_json.fetch('ignored_tags')

    delete :destroy_past_tags

    assert_response :success
    assert_empty response_json.fetch('past_tags')
  end

private
  def response_json
    JSON.parse(response.body)
  end
end
