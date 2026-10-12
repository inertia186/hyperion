# Keeps the app server off Hive services while system tests run: hive-ruby
# JSON-RPC calls are answered in-process, and HafSQL and HAFBE are disabled.
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
      @hafbe_base_url = ENV['HAFBE_BASE_URL']
      ENV['HAFBE_BASE_URL'] = ''
      @active = true
    end

    # Returns the RPC methods the fake could not answer.
    def stop
      @active = false
      @hafbe_base_url.nil? ? ENV.delete('HAFBE_BASE_URL') : ENV['HAFBE_BASE_URL'] = @hafbe_base_url
      @unhandled
    end

    def active?
      @active
    end

    def respond(request)
      payload = JSON.parse(request.body)
      answers = Array.wrap(payload).map { |entry| answer(entry) }
      Response.new('200', (payload.is_a?(Array) ? answers : answers.first).to_json)
    end

  private
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

  module Beacon
    def beacon_scores
      FakeHive.active? ? {} : super
    end
  end

  module Hafsql
    def configured?
      FakeHive.active? ? false : super
    end
  end
end

Hive::RPC::HttpClient.prepend(FakeHive::Transport)
HiveNodeSelector.singleton_class.prepend(FakeHive::Beacon)
HafsqlRecord.singleton_class.prepend(FakeHive::Hafsql)
