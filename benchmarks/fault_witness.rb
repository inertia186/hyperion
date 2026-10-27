require 'json'
require 'minitest/mock'
require_relative '../test/support/fake_hive'

# Independent behavior witnesses validate the frozen mutations, outside the scored suite.
raise 'Scratch database required' unless Rails.env.test? && ActiveRecord::Base.connection.select_value('SELECT current_database()') == 'hyperion_hills_test'
FakeHive.start
id = ENV.fetch('HILLS_FAULT')
observed = expected = nil
ActiveRecord::Base.transaction do
  post = Post.create!(author: 'fault-author', permlink: 'fault-post', title: 'Fault witness', category: 'test', block_num: 1, trx_id: 'test')
  case id
  when /^revision_/
    operations = [{ 'author' => post.author, 'permlink' => post.permlink, 'body' => 'Original', 'block_num' => 1 }]
    case id
    when 'revision_identity'
      operations << operations.first.merge('permlink' => 'another-post', 'body' => 'Foreign', 'block_num' => 2)
      expected = ['Original']
    when 'revision_failed_patch'
      operations << operations.first.merge('body' => "@@ -1,7 +1,7 @@\n-Missing\n+Changed\n", 'block_num' => 2)
      expected = ['Original']
    when 'revision_order'
      operations.unshift(operations.first.merge('body' => 'Later', 'block_num' => 2))
      expected = ['Original', 'Later']
    end
    response = Struct.new(:code, :body).new('200', operations.to_json)
    Net::HTTP.stub(:get_response, response) do
      observed = HafbePostRevisions.new(base_url: 'https://hafbe.example').revisions_for(post).pluck(:body)
    end
  when /^payout_/
    Post.where.not(id: post.id).update_all(created_at: 10.days.ago)
    post.update!(created_at: Time.current, payout_unavailable_at: nil)
    api = Object.new
    api.define_singleton_method(:rpc_client) { self }
    api.define_singleton_method(:rpc_execute) do |_, method, _args|
      raise Timeout::Error, 'fixed timeout' if id == 'payout_timeout'
      result = case method
      when :get_comment_pending_payouts
        {cashout_infos: [{author: post.author, permlink: post.permlink, cashout_info: {
          net_rshares: '4', reward_weight: 5000, max_accepted_payout: {amount: id == 'payout_cap' ? '250' : '100000', precision: 3, nai: '@@000000013'}
        }}]}
      when :get_reward_funds
        {funds: [{name: 'post', recent_claims: '1000', reward_balance: {amount: '1000000', precision: 3, nai: '@@000000021'}}]}
      when :get_current_price_feed
        {base: {amount: '500', precision: 3, nai: '@@000000013'}, quote: {amount: '1000', precision: 3, nai: '@@000000021'}}
      else raise "Unexpected RPC #{method}"
      end
      Struct.new(:result).new(result)
    end
    result = PostPayoutRefresh.new(api: api, limit: 1).call
    raise "Witness infrastructure failure: #{result.errors.inspect}" if result.failed != 0
    observed = id == 'payout_timeout' ? post.reload.payout_unavailable_at.nil? : post.reload.payout
    expected = {'payout_timeout' => true, 'payout_weight' => '1.000 HBD', 'payout_cap' => '0.250 HBD'}.fetch(id)
  when /^read_/
    other = Account.create!(name: 'fault-other')
    account = Account.create!(name: 'fault-curator')
    case id
    when 'read_unread_owner'
      other.read_posts.create!(post_id: post.id)
      account.read_posts.create!(post_id: post.id)
      account.mark_post_as_unread!(post.id)
      observed = [account.post_read?(post.id), other.post_read?(post.id)]
      expected = [false, true]
    when 'read_timestamp'
      old = 1.day.ago.change(usec: 0)
      account.read_posts.create!(post_id: post.id, created_at: old)
      account.mark_posts_as_read!(Post.where(id: post.id))
      observed = account.read_posts.find_by!(post_id: post.id).created_at == old
      expected = true
    end
  else raise "Unknown witness #{id}"
  end
  raise ActiveRecord::Rollback
end
raise 'Unexpected fake Hive calls' unless FakeHive.stop.empty?
puts JSON.generate(id: id, expected: expected, observed: observed, passed: observed == expected)
exit(observed == expected ? 0 : 42)
