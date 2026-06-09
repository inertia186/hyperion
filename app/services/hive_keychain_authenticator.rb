require 'rbsecp256k1'

class HiveKeychainAuthenticator
  def self.valid_signature?(account_name:, public_key:, digest_hex:, signature_hex:)
    new.valid_signature?(
      account_name: account_name,
      public_key: public_key,
      digest_hex: digest_hex,
      signature_hex: signature_hex
    )
  end

  def valid_signature?(account_name:, public_key:, digest_hex:, signature_hex:)
    return false unless Account.public_keys(account_name).include?(public_key)

    expected_public_key = [Bitcoin.decode_base58(public_key[3..-1])[0, 66]].pack('H*')
    digest = [digest_hex.to_s].pack('H*')
    signature = [signature_hex.to_s].pack('H*')

    return false unless digest.bytesize == 32
    return false unless signature.bytesize == 65

    recovery_id = (signature.bytes.first - 27) & 3
    compact_signature = signature.byteslice(1, 64)
    recoverable_signature = Secp256k1::Context.new.recoverable_signature_from_compact(compact_signature, recovery_id)

    recoverable_signature.recover_public_key(digest).compressed == expected_public_key
  rescue ArgumentError, TypeError, NoMethodError, Secp256k1::Error
    false
  end
end
