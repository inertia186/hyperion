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

  test 'periodic cleanup removes expired cache files and metadata at its deadline' do
    freeze_time
    with_public_dns do
      proxy(fetcher: image_fetcher(body: 'old-body', content_type: 'image/png')).call
      metadata_path = Pathname(Dir.glob(@cache_root.join('*.json')).first)
      metadata = JSON.parse(metadata_path.read)
      metadata['fetched_at'] = 8.days.ago.iso8601
      metadata_path.write(JSON.generate(metadata))

      travel 60.seconds
      proxy(fetcher: image_fetcher(url: 'https://example.com/other.png', body: 'new-body', content_type: 'image/png'), url: 'https://example.com/other.png').call

      metadata_values = Dir.glob(@cache_root.join('*.json')).map { |path| JSON.parse(File.read(path)).fetch('source_url') }
      assert_equal ['https://example.com/other.png'], metadata_values
      assert_equal 1, Dir.glob(@cache_root.join('*.bin')).size
    end
  end

  test 'fresh hits reuse the cleanup checkpoint across proxy instances until the deadline' do
    freeze_time
    with_public_dns do
      proxy(fetcher: image_fetcher).call
      cleanup = ImageProxy.method(:cleanup_expired!)
      calls = 0
      ImageProxy.stub(:cleanup_expired!, ->(**options) { calls += 1; cleanup.call(**options) }) do
        travel 59.seconds
        2.times { proxy(fetcher: ->(_) { raise 'unexpected fetch' }).call }
        assert_equal 0, calls
        travel 1.second
        proxy(fetcher: ->(_) { raise 'unexpected fetch' }).call
        assert_equal 1, calls
        travel 60.seconds
        proxy(fetcher: ->(_) { raise 'unexpected fetch' }).call
        assert_equal 2, calls
      end
    end
    assert_equal 1, @fetch_count
  end

  test 'corrupt requested metadata is refetched between sweeps' do
    with_public_dns do
      proxy(fetcher: image_fetcher(body: 'old')).call
      Pathname(Dir.glob(@cache_root.join('*.json')).first).write('{broken')
      result = proxy(fetcher: image_fetcher(body: 'fresh')).call
      assert_equal 'fresh', result.body
      assert_equal 2, @fetch_count
      assert_equal 'image/png', result.content_type
    end
  end

  test 'a cached body disappearing during its read falls back to upstream' do
    with_public_dns do
      proxy(fetcher: image_fetcher(body: 'old')).call
      body = Pathname(Dir.glob(@cache_root.join('*.bin')).first)
      request = proxy(fetcher: image_fetcher(body: 'fresh'))
      request.stub(:body_path, body) do
        body.stub(:binread, -> { body.delete; raise Errno::ENOENT }) do
          assert_equal 'fresh', request.call.body
        end
      end
      assert_equal 'fresh', body.binread
      assert_equal 2, @fetch_count
    end
  end

  test 'forced cleanup removes both corrupt metadata and its orphaned image body' do
    with_public_dns { proxy(fetcher: image_fetcher).call }
    metadata = Pathname(Dir.glob(@cache_root.join('*.json')).first)
    body = metadata.sub_ext('.bin')
    metadata.write('{broken')

    ImageProxy.cleanup_expired!(cache_root: @cache_root)

    assert_not metadata.exist?
    assert_not body.exist?
  end

  test 'cleanup tolerates another worker deleting a listed entry' do
    with_public_dns { proxy(fetcher: image_fetcher).call }
    metadata = Pathname(Dir.glob(@cache_root.join('*.json')).first)
    glob = Dir.method(:glob)
    Dir.stub(:glob, ->(pattern) { paths = glob.call(pattern); metadata.delete; paths }) do
      ImageProxy.cleanup_expired!(cache_root: @cache_root)
    end
    assert_not metadata.exist?
  end

  test 'a worker sweeping the cache does not block other cache hits' do
    freeze_time
    entered = Queue.new
    resume = Queue.new
    with_public_dns do
      proxy(fetcher: image_fetcher).call
      travel 60.seconds
      cleanup = ImageProxy.method(:cleanup_expired!)
      calls = 0
      ImageProxy.stub(:cleanup_expired!, ->(**options) {
        calls += 1
        entered << true
        resume.pop
        cleanup.call(**options)
      }) do
        worker = Thread.new { proxy(fetcher: ->(_) { raise 'unexpected fetch' }).call }
        begin
          Timeout.timeout(5) { entered.pop }
          result = Timeout.timeout(5) { proxy(fetcher: ->(_) { raise 'unexpected fetch' }).call }
          assert_equal 'image-bytes', result.body
          assert_equal 1, calls
        ensure
          resume << true
          worker.value
        end
      end
    end
  end

  test 'concurrent cold misses leave usable atomic cache files' do
    entered = Queue.new
    resume = Queue.new
    threads = []
    with_public_dns do
      fetcher = ->(_) { entered << true; resume.pop; {body: 'shared-image', content_type: 'image/png'} }
      threads = 2.times.map { Thread.new { proxy(fetcher: fetcher).call } }
      begin
        Timeout.timeout(5) { 2.times { entered.pop } }
        2.times { resume << true }
        assert_equal ['shared-image', 'shared-image'], threads.map(&:value).map(&:body)
        assert_equal 'shared-image', proxy(fetcher: ->(_) { raise 'unexpected fetch' }).call.body
        assert_equal 1, Dir.glob(@cache_root.join('*.json')).size
        assert_equal 1, Dir.glob(@cache_root.join('*.bin')).size
      ensure
        2.times { resume << true }
        threads.each(&:join)
      end
    end
  end

  test 'cache hits still reject hosts that now resolve to private addresses' do
    with_public_dns { proxy(fetcher: image_fetcher).call }
    Resolv.stub(:getaddresses, ['127.0.0.1']) do
      assert_raises(ImageProxy::Error) { proxy(fetcher: ->(_) { raise 'unexpected fetch' }).call }
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

  test 'ipfs gateway requests use longer network timeouts' do
    fake_http = FakeHttp.new(http_response(body: 'ipfs-image', content_type: 'image/jpeg'))
    start_kwargs = nil
    source_url = 'https://ipfs.io/ipfs/QmWgz8KrYkhDYCgT7mHP9WERkDDtZ61uvDeyhtbwMrcZq9'

    with_public_dns do
      Net::HTTP.stub(:start, ->(*_args, **kwargs, &http_block) {
        start_kwargs = kwargs
        http_block.call(fake_http)
      }) do
        proxy(url: source_url, fetcher: nil).call
      end
    end

    assert_equal ImageProxy::IPFS_OPEN_TIMEOUT, start_kwargs.fetch(:open_timeout)
    assert_equal ImageProxy::IPFS_READ_TIMEOUT, start_kwargs.fetch(:read_timeout)
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
