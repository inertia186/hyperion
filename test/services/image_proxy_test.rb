require 'test_helper'
require 'tmpdir'

class ImageProxyTest < ActiveSupport::TestCase
  setup do
    @cache_root = Pathname(Dir.mktmpdir('image-proxy-test'))
    @fetch_count = 0
  end

  teardown do
    FileUtils.rm_rf(@cache_root)
  end

  test 'cache miss fetches and stores image bytes' do
    with_public_dns do
      result = proxy(fetcher: image_fetcher(body: 'png-bytes', content_type: 'image/png')).call

      assert_equal 'png-bytes', result.body
      assert_equal 'image/png', result.content_type
      assert_equal 1, @fetch_count
      assert_equal 1, Dir.glob(@cache_root.join('*.bin')).size
      assert_equal 1, Dir.glob(@cache_root.join('*.json')).size
    end
  end

  test 'cache hit avoids upstream fetch' do
    with_public_dns do
      first = proxy(fetcher: image_fetcher(body: 'first-body', content_type: 'image/jpeg')).call
      second = proxy(fetcher: ->(_uri) { raise 'unexpected upstream fetch' }).call

      assert_equal first.body, second.body
      assert_equal 'image/jpeg', second.content_type
      assert_equal 1, @fetch_count
    end
  end

  test 'entries older than seven days are expired and refetched' do
    with_public_dns do
      proxy(fetcher: image_fetcher(body: 'old-body', content_type: 'image/png')).call
      metadata_path = Pathname(Dir.glob(@cache_root.join('*.json')).first)
      metadata = JSON.parse(metadata_path.read)
      metadata['fetched_at'] = 8.days.ago.iso8601
      metadata_path.write(JSON.generate(metadata))

      result = proxy(fetcher: image_fetcher(body: 'fresh-body', content_type: 'image/png')).call

      assert_equal 'fresh-body', result.body
      assert_equal 2, @fetch_count
    end
  end

  test 'cleanup removes expired cache files and metadata' do
    with_public_dns do
      proxy(fetcher: image_fetcher(body: 'old-body', content_type: 'image/png')).call
      metadata_path = Pathname(Dir.glob(@cache_root.join('*.json')).first)
      metadata = JSON.parse(metadata_path.read)
      metadata['fetched_at'] = 8.days.ago.iso8601
      metadata_path.write(JSON.generate(metadata))

      proxy(fetcher: image_fetcher(url: 'https://example.com/other.png', body: 'new-body', content_type: 'image/png'), url: 'https://example.com/other.png').call

      metadata_values = Dir.glob(@cache_root.join('*.json')).map { |path| JSON.parse(File.read(path)).fetch('source_url') }
      assert_equal ['https://example.com/other.png'], metadata_values
      assert_equal 1, Dir.glob(@cache_root.join('*.bin')).size
    end
  end

  test 'unsafe protocols are rejected' do
    assert_raises(ImageProxy::Error) do
      proxy(url: 'file:///etc/passwd', fetcher: image_fetcher).call
    end
  end

  test 'private hosts are rejected' do
    Resolv.stub(:getaddresses, ['127.0.0.1']) do
      assert_raises(ImageProxy::Error) do
        proxy(fetcher: image_fetcher).call
      end
    end
  end

  test 'svg and non-image responses are rejected' do
    with_public_dns do
      assert_raises(ImageProxy::Error) do
        proxy(fetcher: image_fetcher(content_type: 'image/svg+xml')).call
      end

      assert_raises(ImageProxy::Error) do
        proxy(fetcher: image_fetcher(content_type: 'text/html')).call
      end
    end
  end

  test 'oversized images are rejected' do
    with_public_dns do
      assert_raises(ImageProxy::Error) do
        proxy(fetcher: image_fetcher(body: 'x' * (ImageProxy::MAX_BYTES + 1))).call
      end
    end
  end

  test 'net http requests include browser image headers' do
    fake_http = FakeHttp.new(http_response(body: 'png-bytes', content_type: 'image/png'))

    with_public_dns do
      with_fake_http(fake_http) do
        proxy(fetcher: nil).call
      end
    end

    assert_includes fake_http.last_request['User-Agent'], 'Chrome/'
    assert_includes fake_http.last_request['User-Agent'], 'Safari/'
    assert_includes fake_http.last_request['Accept'], 'image/avif'
    assert_includes fake_http.last_request['Accept'], 'image/webp'
    assert_includes fake_http.last_request['Accept'], 'image/*'
    assert_equal 'en-US,en;q=0.9', fake_http.last_request['Accept-Language']
    assert_nil fake_http.last_request['Referer']
  end

  test 'browser user agent avoids provider html interstitial responses' do
    fake_http = FakeHttp.new(->(request) {
      if request['User-Agent'] == 'Hyperion image proxy'
        http_response(body: '<html>not the image</html>', content_type: 'text/html')
      else
        http_response(body: 'provider-image', content_type: 'image/png')
      end
    })

    with_public_dns do
      with_fake_http(fake_http) do
        result = proxy(fetcher: nil).call

        assert_equal 'provider-image', result.body
        assert_equal 'image/png', result.content_type
      end
    end

    assert_equal 1, Dir.glob(@cache_root.join('*.bin')).size
    assert_equal 1, Dir.glob(@cache_root.join('*.json')).size
  end

  test 'image content is proxied when upstream returns an error status' do
    fake_http = FakeHttp.new(http_response(body: 'not-found-image', content_type: 'image/png', code: '404', message: 'Not Found'))

    with_public_dns do
      with_fake_http(fake_http) do
        result = proxy(fetcher: nil).call

        assert_equal 'not-found-image', result.body
        assert_equal 'image/png', result.content_type
      end
    end
  end

  test 'non-image upstream error responses are rejected' do
    fake_http = FakeHttp.new(http_response(body: '<html>not found</html>', content_type: 'text/html', code: '404', message: 'Not Found'))

    with_public_dns do
      with_fake_http(fake_http) do
        assert_raises(ImageProxy::Error) do
          proxy(fetcher: nil).call
        end
      end
    end
  end

  test 'sized requests fetch through hive image host' do
    requested_uri = nil

    with_public_dns do
      proxy(size: '0x96', fetcher: ->(uri) {
        requested_uri = uri
        {body: 'resized', content_type: 'image/webp'}
      }).call
    end

    assert_equal 'images.hive.blog', requested_uri.host
    assert_includes requested_uri.to_s, '/0x96/https://example.com/image.png'
  end

  test 'sized requests for already-resized hive image URLs fetch the source directly' do
    requested_uri = nil
    source_url = 'https://images.hive.blog/768x0/https://example.com/image.png'

    with_public_dns do
      proxy(url: source_url, size: '0x96', fetcher: ->(uri) {
        requested_uri = uri
        {body: 'avatar', content_type: 'image/png'}
      }).call
    end

    assert_equal source_url, requested_uri.to_s
  end

  test 'sized requests for hive avatar URLs fetch the source directly' do
    requested_uri = nil
    source_url = 'https://images.hive.blog/u/example/avatar'

    with_public_dns do
      proxy(url: source_url, size: '0x96', fetcher: ->(uri) {
        requested_uri = uri
        {body: 'avatar', content_type: 'image/png'}
      }).call
    end

    assert_equal source_url, requested_uri.to_s
  end

  test 'sized requests for IPFS gateway URLs fetch the source directly' do
    requested_uri = nil
    source_url = 'https://ipfs.io/ipfs/QmWgz8KrYkhDYCgT7mHP9WERkDDtZ61uvDeyhtbwMrcZq9'

    with_public_dns do
      proxy(url: source_url, size: '1280x0', fetcher: ->(uri) {
        requested_uri = uri
        {body: 'ipfs-image', content_type: 'image/png'}
      }).call
    end

    assert_equal source_url, requested_uri.to_s
  end

  test 'gateway images with generic content types are accepted when bytes identify an image' do
    png_body = "\x89PNG\r\n\x1A\nimage-bytes".b
    source_url = 'https://ipfs.io/ipfs/QmWgz8KrYkhDYCgT7mHP9WERkDDtZ61uvDeyhtbwMrcZq9'

    with_public_dns do
      result = proxy(
        url: source_url,
        fetcher: image_fetcher(url: source_url, body: png_body, content_type: 'application/octet-stream')
      ).call

      assert_equal png_body, result.body
      assert_equal 'image/png', result.content_type
    end
  end

private
  def proxy(url: 'https://example.com/image.png', size: nil, fetcher:)
    ImageProxy.new(url: url, size: size, cache_root: @cache_root, fetcher: fetcher)
  end

  def image_fetcher(url: 'https://example.com/image.png', body: 'image-bytes', content_type: 'image/png')
    ->(uri) {
      assert uri.to_s.include?(url) if url
      @fetch_count += 1
      {body: body, content_type: content_type}
    }
  end

  def with_public_dns(&block)
    Resolv.stub(:getaddresses, ['93.184.216.34'], &block)
  end

  def with_fake_http(fake_http, &block)
    Net::HTTP.stub(:start, ->(*_args, **_kwargs, &http_block) { http_block.call(fake_http) }, &block)
  end

  def http_response(body:, content_type:, code: '200', message: 'OK')
    response = Net::HTTPOK.new('1.1', code, message)
    response['Content-Type'] = content_type
    response.body = body
    response.instance_variable_set(:@read, true)
    response
  end

  class FakeHttp
    attr_reader :last_request

    def initialize(response)
      @response = response
    end

    def request(request)
      @last_request = request
      @response.respond_to?(:call) ? @response.call(request) : @response
    end
  end
end
