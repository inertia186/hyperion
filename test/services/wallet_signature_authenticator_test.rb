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

  test 'rejects malformed signatures and failed account lookups' do
    %w[not-hex 00].each { |signature| assert_not valid_signature?(signature: signature) }
    Account.stub(:database_api, -> { raise Hive::UnknownError, 'unavailable' }) do
      assert_not valid_signature?
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
end
