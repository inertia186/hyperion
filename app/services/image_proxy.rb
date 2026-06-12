require 'digest'
require 'fileutils'
require 'ipaddr'
require 'json'
require 'net/http'
require 'resolv'
require 'tempfile'
require 'timeout'
require 'uri'

class ImageProxy
  CACHE_ROOT = Rails.root.join('tmp/cache/images')
  CACHE_TTL = 7.days
  MAX_BYTES = 5.megabytes
  OPEN_TIMEOUT = 2
  READ_TIMEOUT = 5
  MAX_REDIRECTS = 3
  BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  BROWSER_IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  BROWSER_ACCEPT_LANGUAGE = 'en-US,en;q=0.9'
  ALLOWED_CONTENT_TYPES = {
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/gif' => 'gif',
    'image/webp' => 'webp'
  }.freeze
  HIVE_IMAGE_HOST = 'images.hive.blog'
  IPFS_GATEWAY_HOSTS = %w[
    ipfs.io
    cloudflare-ipfs.com
    dweb.link
    gateway.pinata.cloud
  ].freeze

  Result = Struct.new(:body, :content_type, :cache_key, keyword_init: true)

  class Error < StandardError; end

  def self.cleanup_expired!(cache_root: CACHE_ROOT)
    cache_root = Pathname(cache_root)
    return unless cache_root.exist?

    Dir.glob(cache_root.join('*.json')).each do |metadata_path|
      metadata_path = Pathname(metadata_path)
      metadata = JSON.parse(metadata_path.read)
      next unless Time.iso8601(metadata.fetch('fetched_at')) <= CACHE_TTL.ago

      basename = metadata_path.basename('.json').to_s
      FileUtils.rm_f(cache_root.join("#{basename}.json"))
      FileUtils.rm_f(cache_root.join("#{basename}.bin"))
    rescue ArgumentError, KeyError, JSON::ParserError
      FileUtils.rm_f(metadata_path)
    end
  end

  def initialize(url:, size: nil, cache_root: CACHE_ROOT, fetcher: nil)
    @url = url.to_s
    @size = size.to_s.presence
    @cache_root = Pathname(cache_root)
    @fetcher = fetcher
  end

  def call
    validate_source_url!
    cleanup_expired!

    if (cached = cached_result)
      return cached
    end

    response = fetch_image
    write_cache(response)
    Result.new(body: response.fetch(:body), content_type: response.fetch(:content_type), cache_key: cache_key)
  end

  def cleanup_expired!
    self.class.cleanup_expired!(cache_root: @cache_root)
  end

private
  def validate_source_url!
    source_uri
    raise Error, 'Unsupported image URL scheme.' unless %w(http https).include?(source_uri.scheme)
    raise Error, 'Image URL host is missing.' if source_uri.host.blank?

    validate_public_host!(source_uri.host)
  rescue URI::InvalidURIError
    raise Error, 'Invalid image URL.'
  end

  def validate_public_host!(host)
    addresses = Resolv.getaddresses(host)
    raise Error, 'Image URL host could not be resolved.' if addresses.empty?

    addresses.each do |address|
      ip = IPAddr.new(address)
      raise Error, 'Image URL host is not allowed.' unless public_ip?(ip)
    end
  rescue Resolv::ResolvError, IPAddr::InvalidAddressError
    raise Error, 'Image URL host could not be resolved.'
  end

  def public_ip?(ip)
    return false if ip.loopback?
    return false if ip.private?
    blocked_ipv4 = [
      IPAddr.new('0.0.0.0/8'),
      IPAddr.new('169.254.0.0/16'),
      IPAddr.new('224.0.0.0/4'),
      IPAddr.new('192.0.2.0/24'),
      IPAddr.new('198.51.100.0/24'),
      IPAddr.new('203.0.113.0/24')
    ]
    blocked_ipv6 = [
      IPAddr.new('::/128'),
      IPAddr.new('fe80::/10'),
      IPAddr.new('ff00::/8'),
      IPAddr.new('2001:db8::/32')
    ]

    return false if ip.ipv4? && blocked_ipv4.any? { |range| range.include?(ip) }
    return false if ip.ipv6? && blocked_ipv6.any? { |range| range.include?(ip) }

    true
  end

  def cached_result
    metadata = read_metadata(metadata_path)
    return nil unless metadata && body_path.exist?

    fetched_at = Time.iso8601(metadata.fetch('fetched_at'))
    if fetched_at <= CACHE_TTL.ago
      FileUtils.rm_f(metadata_path)
      FileUtils.rm_f(body_path)
      return nil
    end

    Result.new(body: body_path.binread, content_type: metadata.fetch('content_type'), cache_key: cache_key)
  rescue ArgumentError, KeyError
    FileUtils.rm_f(metadata_path)
    FileUtils.rm_f(body_path)
    nil
  end

  def fetch_image
    response = @fetcher ? @fetcher.call(fetch_uri) : fetch_with_net_http(fetch_uri)
    body = response.fetch(:body).to_s.b
    raise Error, 'Image is too large.' if body.bytesize > MAX_BYTES
    content_type = image_content_type(response.fetch(:content_type), body)
    raise Error, 'Unsupported image content type.' unless ALLOWED_CONTENT_TYPES.key?(content_type)

    {body: body, content_type: content_type}
  end

  def fetch_with_net_http(uri, redirects_remaining = MAX_REDIRECTS)
    validate_public_host!(uri.host)

    Timeout.timeout(OPEN_TIMEOUT + READ_TIMEOUT + 1) do
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https', open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
        request = Net::HTTP::Get.new(uri.request_uri)
        apply_browser_image_headers(request)
        response = http.request(request)

        if response.is_a?(Net::HTTPRedirection)
          raise Error, 'Image fetch redirected too many times.' if redirects_remaining <= 0

          location = response['Location'].to_s
          raise Error, 'Image fetch redirected without a location.' if location.blank?

          redirect_uri = URI.join(uri, location)
          raise Error, 'Image fetch redirected to an unsupported URL scheme.' unless %w(http https).include?(redirect_uri.scheme)
          validate_public_host!(redirect_uri.host)
          return fetch_with_net_http(redirect_uri, redirects_remaining - 1)
        end

        content_length = response['Content-Length'].to_i
        raise Error, 'Image is too large.' if content_length > MAX_BYTES
        content_type = normalize_content_type(response['Content-Type'])
        unless response.is_a?(Net::HTTPSuccess) || ALLOWED_CONTENT_TYPES.key?(content_type)
          raise Error, "Image fetch failed with #{response.code}."
        end

        {body: response.body.to_s.b, content_type: response['Content-Type']}
      end
    end
  rescue Timeout::Error
    raise Error, 'Image fetch timed out.'
  rescue Errno::ECONNREFUSED, Errno::EHOSTUNREACH, Errno::ENETUNREACH, Net::OpenTimeout, Net::ReadTimeout, SocketError
    raise Error, 'Image fetch failed.'
  end

  def apply_browser_image_headers(request)
    request['User-Agent'] = BROWSER_USER_AGENT
    request['Accept'] = BROWSER_IMAGE_ACCEPT
    request['Accept-Language'] = BROWSER_ACCEPT_LANGUAGE
  end

  def write_cache(response)
    FileUtils.mkdir_p(@cache_root)
    write_atomic(body_path, response.fetch(:body))
    write_atomic(metadata_path, JSON.generate({
      source_url: @url,
      fetch_url: fetch_uri.to_s,
      size: @size,
      content_type: response.fetch(:content_type),
      fetched_at: Time.current.iso8601
    }))
  end

  def write_atomic(path, content)
    Tempfile.create([path.basename.to_s, '.tmp'], @cache_root) do |file|
      file.binmode
      file.write(content)
      file.flush
      file.close
      FileUtils.mv(file.path, path)
    end
  end

  def read_metadata(path)
    return nil unless path.exist?

    JSON.parse(path.read)
  end

  def normalize_content_type(content_type)
    content_type.to_s.split(';', 2).first.to_s.downcase.strip
  end

  def image_content_type(content_type, body)
    normalized_content_type = normalize_content_type(content_type)
    return normalized_content_type if ALLOWED_CONTENT_TYPES.key?(normalized_content_type)

    sniff_image_content_type(body)
  end

  def sniff_image_content_type(body)
    return 'image/png' if body.start_with?("\x89PNG\r\n\x1A\n".b)
    return 'image/jpeg' if body.start_with?("\xFF\xD8\xFF".b)
    return 'image/gif' if body.start_with?('GIF87a'.b) || body.start_with?('GIF89a'.b)
    return 'image/webp' if body.bytesize >= 12 && body[0, 4] == 'RIFF'.b && body[8, 4] == 'WEBP'.b

    ''
  end

  def cache_key
    @cache_key ||= Digest::SHA256.hexdigest(JSON.generate({url: @url, size: @size}))
  end

  def body_path
    @cache_root.join("#{cache_key}.bin")
  end

  def metadata_path
    @cache_root.join("#{cache_key}.json")
  end

  def source_uri
    @source_uri ||= URI.parse(@url)
  end

  def fetch_uri
    @fetch_uri ||= if @size
      if already_resized_hive_image? || hive_avatar_image? || ipfs_gateway_image?
        source_uri
      else
        URI.parse("https://#{HIVE_IMAGE_HOST}/#{@size}/#{@url}")
      end
    else
      source_uri
    end
  end

  def already_resized_hive_image?
    source_uri.host == HIVE_IMAGE_HOST && source_uri.path.match?(%r{\A/(?:\d+x\d+|x\d+|\d+x)/https?://}i)
  end

  def hive_avatar_image?
    source_uri.host == HIVE_IMAGE_HOST && source_uri.path.match?(%r{\A/u/[^/]+/avatar\z}i)
  end

  def ipfs_gateway_image?
    IPFS_GATEWAY_HOSTS.include?(source_uri.host.to_s.downcase) &&
      source_uri.path.match?(%r{\A/ipfs/[A-Za-z0-9]+(?:/.*)?\z})
  end
end
