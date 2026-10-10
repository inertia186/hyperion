require 'test_helper'

class WalletLoginChallengeTest < ActiveSupport::TestCase
  test 'HiveAuth challenges stay on one line for the Keychain mobile signing bridge' do
    with_env('HYPERION_WALLET_PROVIDERS' => 'hiveauth') do
      challenge = issue(provider: 'hiveauth')
      assert_no_match(/[\r\n]/, challenge.message)
      assert_includes challenge.message, 'Posting authority only.'
      assert_includes challenge.message, "Challenge: #{challenge.token}"
    end
  end

  test 'a challenge is consumed only once even with the same browser binding' do
    challenge = issue
    assert_equal accounts(:curated), challenge.consume!('binding') { accounts(:curated) }
    assert_raises(ArgumentError) { challenge.consume!('binding') { flunk 'Replayed challenge reached verifier' } }
  end

  test 'wrong account and expiry during verification do not consume the challenge' do
    challenge = issue
    assert_raises(ArgumentError) { challenge.consume!('binding') { Account.new(name: 'someone-else') } }
    assert_nil challenge.reload.consumed_at
    assert_raises(ArgumentError) do
      challenge.consume!('binding') do
        travel WalletLoginChallenge::TTL + 1.second
        accounts(:curated)
      end
    end
    assert_nil challenge.reload.consumed_at
  end

private
  def issue(provider: 'keychain')
    WalletLoginChallenge.issue!(account_name: 'fixture-curator', provider: provider, binding: 'binding', origin: 'https://hyperion.zone')
  end
end
