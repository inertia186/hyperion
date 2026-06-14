require 'json'
require 'net/http'
require 'set'
require 'uri'

class HiveNodeSelector
  DEFAULT_BEACON_URL = 'https://beacon.peakd.com/api/nodes'
  DEFAULT_NODE_URLS = %w[
    https://api.hive.blog
    https://api.deathwing.me
    https://rpc.mahdiyari.info
    https://techcoderx.com
    https://api.c0ff33a.uk
    https://hiveapi.actifit.io
    https://api.syncad.com
    https://api.openhive.network
    https://hive.roelandp.nl
    https://hive-api.arcange.eu
  ].freeze
  DEFAULT_MIN_SCORE = 90
  DEFAULT_BEACON_TTL = 60
  DEFAULT_BEACON_TIMEOUT = 2

  class << self
    def next_url(excluded_urls: [])
      ordered_urls(excluded_urls: excluded_urls).first
    end

    def ordered_urls(excluded_urls: [])
      configured_urls = node_urls
      excluded_keys = excluded_urls.map { |url| node_key(url) }.compact.to_set
      candidates = configured_urls.reject { |url| excluded_keys.include?(node_key(url)) }
      candidates = configured_urls if candidates.empty?

      ranked_urls(candidates)
    end

    def node_urls
      configured = ENV['HYPERION_NODE_URLS'].to_s.split(',').map(&:strip).reject(&:blank?)
      urls = configured.presence || DEFAULT_NODE_URLS
      urls.map { |url| normalize_url(url) }.compact.uniq
    end

    def clear_cache!
      @beacon_cache = nil
    end

    def beacon_scores
      cached = @beacon_cache
      return cached.fetch(:scores) if cached && cached.fetch(:expires_at) > Time.current

      scores = fetch_beacon_scores
      @beacon_cache = {scores: scores, expires_at: beacon_ttl.seconds.from_now}
      scores
    rescue StandardError => e
      Rails.logger.warn "Unable to fetch Hive node Beacon scores: #{e.class}: #{e.message}" if defined?(Rails)
      {}
    end

  private
    def ranked_urls(urls)
      scores = beacon_scores
      return urls if scores.empty?

      min_score = minimum_score
      scored, unreported = urls.partition { |url| scores.key?(node_key(url)) }
      healthy = scored.
        select { |url| scores.fetch(node_key(url)).to_i >= min_score }.
        sort_by { |url| [-scores.fetch(node_key(url)).to_i, urls.index(url)] }

      ranked = healthy + unreported
      ranked.presence || urls
    end

    def fetch_beacon_scores
      uri = URI(beacon_url)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https', open_timeout: beacon_timeout, read_timeout: beacon_timeout) do |http|
        http.get(uri.request_uri)
      end
      raise "Beacon returned #{response.code}" unless response.code.to_i.between?(200, 299)

      JSON.parse(response.body).each_with_object({}) do |node, scores|
        key = node_key(node['name'])
        next unless key

        scores[key] = Integer(node['score'])
      rescue ArgumentError, TypeError
        next
      end
    end

    def normalize_url(value)
      value = value.to_s.strip
      return nil if value.blank?

      value = "https://#{value}" unless value.match?(%r{\Ahttps?://}i)
      uri = URI(value)
      return nil unless uri.host

      uri.to_s
    rescue URI::InvalidURIError
      nil
    end

    def node_key(value)
      normalized = normalize_url(value)
      return nil unless normalized

      uri = URI(normalized)
      host = uri.host.to_s.downcase
      default_port = uri.scheme == 'https' ? 443 : 80
      uri.port == default_port ? host : "#{host}:#{uri.port}"
    rescue URI::InvalidURIError
      nil
    end

    def beacon_url
      ENV.fetch('HIVE_BEACON_NODES_URL', DEFAULT_BEACON_URL)
    end

    def minimum_score
      Integer(ENV.fetch('HIVE_NODE_MIN_SCORE', DEFAULT_MIN_SCORE))
    rescue ArgumentError, TypeError
      DEFAULT_MIN_SCORE
    end

    def beacon_ttl
      Integer(ENV.fetch('HIVE_NODE_BEACON_TTL', DEFAULT_BEACON_TTL))
    rescue ArgumentError, TypeError
      DEFAULT_BEACON_TTL
    end

    def beacon_timeout
      Float(ENV.fetch('HIVE_BEACON_TIMEOUT', DEFAULT_BEACON_TIMEOUT))
    rescue ArgumentError, TypeError
      DEFAULT_BEACON_TIMEOUT
    end
  end
end
