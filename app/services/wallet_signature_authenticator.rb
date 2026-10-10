require 'rbsecp256k1'
require 'timeout'

class WalletSignatureAuthenticator
  def self.valid?(account_name:, message:, signature:)
    return false unless signature.to_s.match?(/\A[0-9a-fA-F]{130}\z/)

    bytes = [signature].pack('H*')
    return false unless (31..34).cover?(bytes.getbyte(0))

    context = Secp256k1::Context.new
    proof = context.recoverable_signature_from_compact(bytes.byteslice(1, 64), bytes.getbyte(0) - 31)
    recovered_key = proof.recover_public_key(Digest::SHA256.digest(message)).compressed

    Timeout.timeout(5) do
      Account.with_simple_failover do
        Account.database_api.find_accounts(accounts: [account_name]) do |result|
          chain_account = result.accounts.find { |account| account.name == account_name }
          return false unless chain_account

          authority = chain_account.posting
          # Browser login accepts one direct posting key that meets the threshold.
          return authority.key_auths.any? do |key, weight|
            weight >= authority.weight_threshold &&
              [Bitcoin.decode_base58(key[3..])[0, 66]].pack('H*') == recovered_key
          end
        end
      end
    end
    false
  rescue StandardError => error
    if error.is_a?(Timeout::Error) && Account.hive_client_urls.any?
      Account.record_hive_node_failure
      Account.api_reset
    end
    Rails.logger.warn "Unable to verify wallet login: #{error.class}"
    false
  end
end
