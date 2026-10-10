require 'test_helper'

class WalletSignatureAuthenticatorTest < ActiveSupport::TestCase
  setup do
    @context = Secp256k1::Context.new
    @key = @context.generate_key_pair
    bytes = @key.public_key.compressed
    @public_key = "STM#{Bitcoin.encode_base58((bytes + Digest::RMD160.digest(bytes).byteslice(0, 4)).unpack1('H*'))}"
    @message = 'Sign in to Hyperion: test challenge'
    compact, recovery_id = @context.sign_recoverable(@key.private_key, Digest::SHA256.digest(@message)).compact
    @signature = ([31 + recovery_id].pack('C') + compact).unpack1('H*')
  end

  test 'verifies a real recoverable signature with sufficient direct posting authority' do
    with_authority do
      assert valid_signature?
      assert_not valid_signature?(message: 'a different challenge')
      assert_not valid_signature?(account_name: 'different-account')
    end
  end

  test 'rejects active or memo keys and insufficient multisig weight' do
    with_authority(keys: []) { assert_not valid_signature? }
    with_authority(threshold: 2) { assert_not valid_signature? }
  end

  test 'rejects malformed signatures' do
    %w[not-hex 00].each { |signature| assert_not valid_signature?(signature: signature) }
  end

  test 'replaces a failed cached RPC client and verifies with the next node' do
    calls = []
    with_nodes(calls) do
      Account.database_api
      assert valid_signature?
      assert_equal %w[https://failed.example https://healthy.example], calls
      assert_includes Account.failed_hive_node_urls, 'https://failed.example'
    end
  end

  test 'rejects the signature when every RPC node fails' do
    calls = []
    with_nodes(calls, fail_all: true) do
      assert_not valid_signature?
      assert_operator calls.size, :>, 1
      assert_includes calls, 'https://healthy.example'
    end
  end

  test 'a hung node respects the overall deadline and is replaced on the next login' do
    calls = []
    timeout = Timeout.method(:timeout)
    deadline = ->(seconds, &block) do
      assert_equal 5, seconds
      timeout.call(0.05, &block)
    end
    with_nodes(calls, hang_first: true) do
      Timeout.stub(:timeout, deadline) { assert_not valid_signature? }
      assert_equal ['https://failed.example'], calls
      assert valid_signature?
      assert_equal %w[https://failed.example https://healthy.example], calls
    end
  end

private
  def valid_signature?(**overrides)
    WalletSignatureAuthenticator.valid?(**{account_name: 'fixture-curator', message: @message, signature: @signature}.merge(overrides))
  end

  def with_authority(keys: [[@public_key, 1]], threshold: 1)
    result = Hashie::Mash.new(accounts: [{name: 'fixture-curator', posting: {key_auths: keys, weight_threshold: threshold}}])
    api = Object.new
    api.define_singleton_method(:find_accounts) { |accounts:, &block| block.call(result) }
    Account.stub(:database_api, api) { yield }
  end

  def with_nodes(calls, fail_all: false, hang_first: false)
    Account.api_reset
    Account.failed_hive_node_urls.clear
    result = Hashie::Mash.new(accounts: [{name: 'fixture-curator', posting: {key_auths: [[@public_key, 1]], weight_threshold: 1}}])
    selector = ->(excluded_urls: []) { excluded_urls.include?('https://failed.example') ? 'https://healthy.example' : 'https://failed.example' }
    client = lambda do |url:|
      api = Object.new
      api.define_singleton_method(:find_accounts) do |accounts:, &block|
        calls << url
        sleep 60 if hang_first && url == 'https://failed.example'
        raise Hive::UnknownError, 'unavailable' if fail_all || url == 'https://failed.example'

        block.call(result)
      end
      api
    end
    HiveNodeSelector.stub(:next_url, selector) do
      Hive::DatabaseApi.stub(:new, client) do
        Account.stub(:sleep, nil) { yield }
      end
    end
  ensure
    Account.api_reset
    Account.failed_hive_node_urls.clear
  end
end
