class VoteApi < Hive::RPC::ThreadSafeHttpClient
  Response = Struct.new(:code, :body)
  attr_reader :batches

  def initialize(votes = {}, &on_batch)
    super(url: 'https://unused.invalid')
    @votes = votes
    @on_batch = on_batch
    @batches = []
  end

  def rpc_client
    self
  end

  def http_request(request)
    payload = JSON.parse(request.body, symbolize_names: true)
    request_object = payload.is_a?(Array) ? payload : [payload]
    @batches << request_object
    @on_batch&.call
    responses = request_object.reverse.map do |entry|
      raise "Unexpected vote request: #{entry}" unless entry[:method] == 'condenser_api.get_active_votes'

      {jsonrpc: '2.0', id: entry[:id], result: @votes.fetch(entry[:params], [])}
    end
    Response.new('200', (payload.is_a?(Array) ? responses : responses.first).to_json)
  end
end
