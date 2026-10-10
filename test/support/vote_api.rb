class VoteApi < Hive::RPC::ThreadSafeHttpClient
  Response = Struct.new(:code, :body)
  attr_reader :batches

  # votes: {[author, permlink, voter] => vote_percent}
  def initialize(votes = {}, &on_batch)
    super(url: 'https://unused.invalid')
    @votes = votes.sort
    @on_batch = on_batch
    @batches = []
  end

  def rpc_client
    self
  end

  def http_request(request)
    batch = JSON.parse(request.body, symbolize_names: true)
    @batches << batch
    @on_batch&.call
    # Nodes may answer a batch in any order.
    responses = batch.reverse.map do |entry|
      raise "Unexpected vote request: #{entry}" unless entry[:method] == 'database_api.list_votes' && entry.dig(:params, :order) == 'by_comment_voter'

      # Like by_comment_voter, return the first vote at or after the start key.
      found_key, percent = @votes.find { |key, _percent| (key <=> entry.dig(:params, :start)) >= 0 }
      votes = found_key ? [{author: found_key[0], permlink: found_key[1], voter: found_key[2], vote_percent: percent}] : []
      {jsonrpc: '2.0', id: entry[:id], result: {votes: votes}}
    end
    Response.new('200', responses.to_json)
  end
end
