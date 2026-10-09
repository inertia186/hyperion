class VoteApi < Hive::RPC::BaseClient
  attr_reader :batches

  def initialize(votes = {}, &on_batch)
    super()
    @votes = votes
    @on_batch = on_batch
    @batches = []
  end

  def rpc_client
    self
  end

  def rpc_batch_execute(api_name:, request_object:)
    @batches << request_object
    @on_batch&.call
    request_object.reverse_each do |request|
      raise "Unexpected vote request: #{request}" unless api_name == :condenser_api && request[:method] == 'condenser_api.get_active_votes'

      result = @votes.fetch(request[:params], [])
      yield result, nil, request[:id]
    end
  end
end
