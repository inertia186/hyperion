module Immutable
  extend ActiveSupport::Concern

  MAX_RETRY = 10
  MAX_BACKOFF_SEC = 30.0
  NODE_FAILURE_COOLDOWN = ENV.fetch('HIVE_NODE_FAILURE_COOLDOWN', 60).to_i

  def with_simple_failover(&block)
    tries = 0
    backoff = 0.1

    loop do; begin
      tries = tries + 1

      result = yield

      break result
    rescue => e
      raise e if tries > MAX_RETRY

      Rails.logger.error "#{e} ... retrying ..."
      record_hive_node_failure
      api_reset

      sleep [(backoff = backoff * 2), MAX_BACKOFF_SEC].min
    end; end
  end

  def bridge
    @bridge ||= build_hive_client(:bridge) { |url| Hive::Bridge.new(url: url) }
  end

  def api
    @api ||= build_hive_client(:api) { |url| Hive::Api.new(url: url) }
  end

  def account_history_api
    @account_history_api ||= build_hive_client(:account_history_api) { |url| Hive::AccountHistoryApi.new(url: url) }
  end

  def database_api
    @database_api ||= build_hive_client(:database_api) { |url| Hive::DatabaseApi.new(url: url) }
  end
  
  def stream
    @stream ||= build_hive_client(:stream) { |url| Hive::Stream.new(url: url) }
  end
  
  def api_reset
    @bridge = @api = @account_history_api = @database_api = @stream = nil
    @hive_client_urls = nil
  end

  def build_hive_client(name)
    url = HiveNodeSelector.next_url(excluded_urls: failed_hive_node_urls.keys)
    hive_client_urls[name] = url
    yield url
  end

  def hive_client_urls
    @hive_client_urls ||= {}
  end

  def failed_hive_node_urls
    @failed_hive_node_urls ||= {}
    @failed_hive_node_urls.delete_if { |_url, failed_until| failed_until <= Time.current }
  end

  def record_hive_node_failure
    failed_until = NODE_FAILURE_COOLDOWN.seconds.from_now
    hive_client_urls.values.compact.each do |url|
      failed_hive_node_urls[url] = failed_until
    end
  end
end
