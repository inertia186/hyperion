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
end
