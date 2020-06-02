module Immutable
  extend ActiveSupport::Concern

  DEFAULT_NODE_URLS = %w(https://api.openhive.network)
  MAX_RETRY = 10
  MAX_BACKOFF_SEC = 30.0

  def with_simple_failover(&block)
    tries = 0
    backoff = 0.1

    loop do; begin
      tries = tries + 1

      yield

      break
    rescue => e
      raise e if tries > MAX_RETRY

      Rails.logger.error "#{e} ... retrying ..."

      sleep [(backoff = backoff * 2), MAX_BACKOFF_SEC].min
    end; end
  end

  def api
    @api ||= Hive::Api.new(url: DEFAULT_NODE_URLS.sample)
  end

  def database_api
    @database_api ||= Hive::DatabaseApi.new(url: DEFAULT_NODE_URLS.sample)
  end
  
  def stream
    @stream ||= Hive::Stream.new(url: DEFAULT_NODE_URLS.sample)
  end
  
  def api_reset
    @api = @database_api = stream = nil
  end
end
