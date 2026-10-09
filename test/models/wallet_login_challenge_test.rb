require 'test_helper'

class WalletLoginChallengeTest < ActiveSupport::TestCase
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
  def issue
    WalletLoginChallenge.issue!(account_name: 'fixture-curator', provider: 'keychain', binding: 'binding', origin: 'https://hyperion.zone')
  end
end
