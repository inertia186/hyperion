# Keeps tests off Hive nodes: hive-ruby JSON-RPC calls are answered in-process
# and Beacon reports no node scores. System tests also disable HafSQL and HAFBE.
module FakeHive
  Response = Struct.new(:code, :body)

  # The posting key published for the `social` demo account.
  SOCIAL_POSTING_KEY = 'STM5ctejUsoZ9FwfCaVbNvWYYgNMBo9TVsHSE8wHrqAmNJi6sDctt'
  ACCOUNTS = {
    'social' => {name: 'social', posting: {weight_threshold: 1, account_auths: [], key_auths: [[SOCIAL_POSTING_KEY, 1]]}}
  }.freeze

  class << self
    def start
      @unhandled = []
      @saved_env = {}
      # With no scores HiveNodeSelector keeps the configured order. Tests that
      # clear this cache reach a closed local port instead of Beacon.
      HiveNodeSelector.instance_variable_set(:@beacon_cache, {scores: {}, expires_at: 1.hour.from_now})
      swap_env('HIVE_BEACON_NODES_URL' => 'http://127.0.0.1:9/')
      @active = true
    end

    def disable_hafsql_and_hafbe
      swap_env('HAFBE_BASE_URL' => '')
      @hafsql_disabled = true
    end

    # Returns the RPC methods the fake could not answer.
    def stop
      @active = @hafsql_disabled = false
      HiveNodeSelector.clear_cache!
      @saved_env.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
      @unhandled
    end

    def active?
      @active
    end

    def hafsql_disabled?
      @hafsql_disabled
    end

    def respond(request)
      payload = JSON.parse(request.body)
      answers = Array.wrap(payload).map { |entry| answer(entry) }
      Response.new('200', (payload.is_a?(Array) ? answers : answers.first).to_json)
    end

  private
    def swap_env(values)
      values.each do |key, value|
        @saved_env[key] = ENV[key] unless @saved_env.key?(key)
        ENV[key] = value
      end
    end

    def answer(entry)
      method = entry['method']
      result = case method
      when 'database_api.find_accounts'
        {accounts: ACCOUNTS.values_at(*entry.dig('params', 'accounts')).compact}
      when 'bridge.get_follow_list', 'condenser_api.get_accounts', 'condenser_api.get_active_votes', 'condenser_api.get_content_replies'
        []
      when 'bridge.get_discussion'
        {}
      when 'condenser_api.get_content'
        nil
      else
        # hive-ruby falls back to built-in method lists when jsonrpc lookups fail.
        @unhandled << method unless method.start_with?('jsonrpc.')
        return {jsonrpc: '2.0', id: entry['id'], error: {code: -32601, message: "Could not find method #{method}"}}
      end

      {jsonrpc: '2.0', id: entry['id'], result: result}
    end
  end

  module Transport
    def http_request(request)
      FakeHive.active? ? FakeHive.respond(request) : super
    end
  end

  module Hafsql
    def configured?
      FakeHive.hafsql_disabled? ? false : super
    end
  end
end

Hive::RPC::HttpClient.prepend(FakeHive::Transport)
HafsqlRecord.singleton_class.prepend(FakeHive::Hafsql)
