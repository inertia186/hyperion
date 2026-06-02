require 'test_helper'

class Api::V1::ImagesControllerTest < ActionController::TestCase
  tests Api::V1::ImagesController

  setup do
    @request.session[:current_account] = accounts(:curated)
  end

  test 'proxies image bytes inline' do
    result = ImageProxy::Result.new(body: 'image-bytes', content_type: 'image/png', cache_key: 'cache-key')
    proxy = FakeImageProxy.new(result)

    ImageProxy.stub(:new, ->(**_kwargs) { proxy }) do
      get :proxy, params: {url: 'https://example.com/image.png'}
    end

    assert_response :success
    assert_equal 'image/png', response.media_type
    assert_equal 'image-bytes', response.body
  end

  test 'returns placeholder image for rejected images' do
    proxy = FakeImageProxy.new(ImageProxy::Error.new('bad image'))

    ImageProxy.stub(:new, ->(**_kwargs) { proxy }) do
      get :proxy, params: {url: 'https://127.0.0.1/image.png'}
    end

    assert_response :success
    assert_equal 'image/svg+xml', response.media_type
    assert_includes response.body, 'Image unavailable'
  end

private
  class FakeImageProxy
    def initialize(result)
      @result = result
    end

    def call
      raise @result if @result.is_a?(Exception)

      @result
    end
  end
end
