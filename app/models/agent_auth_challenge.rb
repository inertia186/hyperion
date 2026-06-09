class AgentAuthChallenge < ApplicationRecord
  TTL = 10.minutes
  VERIFICATION_CODE_PREFIX = 'HYP'

  belongs_to :account, optional: true

  before_validation :set_defaults, on: :create

  validates :token, presence: true, uniqueness: true
  validates :nonce, presence: true
  validates :expires_at, presence: true

  def self.issue!
    create!
  end

  def self.find_available!(token)
    challenge = find_by!(token: token)
    raise ActiveRecord::RecordNotFound if challenge.expired?

    challenge
  end

  def expired?
    Time.current >= expires_at
  end

  def keychain_message
    "Sign in to Hyperion agent challenge #{token}: #{nonce}"
  end

  def keychain_digest
    Digest::SHA256.digest(keychain_message).unpack1('H*')
  end

  def authorize_for_copy_code!(account)
    code = self.class.generate_verification_code
    update!(
      account: account,
      verification_code_digest: self.class.digest_verification_code(code),
      redeemed_at: nil
    )
    code
  end

  def redeem!(code)
    raise ActiveRecord::RecordNotFound if expired?
    raise ArgumentError, 'Challenge has not been authorized.' unless account
    raise ArgumentError, 'Challenge has already been redeemed.' if redeemed_at
    raise ArgumentError, 'Invalid verification code.' unless verification_code_matches?(code)

    update!(redeemed_at: Time.current)
    account
  end

  def complete_keychain!(account)
    raise ActiveRecord::RecordNotFound if expired?

    update!(account: account, redeemed_at: Time.current)
    account
  end

  def self.generate_verification_code
    "#{VERIFICATION_CODE_PREFIX}-#{SecureRandom.alphanumeric(6).upcase}"
  end

  def self.digest_verification_code(code)
    Digest::SHA256.hexdigest(code.to_s.upcase)
  end

private
  def set_defaults
    self.token ||= SecureRandom.urlsafe_base64(24)
    self.nonce ||= SecureRandom.hex(16)
    self.expires_at ||= TTL.from_now
  end

  def verification_code_matches?(code)
    return false if verification_code_digest.blank?

    expected = verification_code_digest
    actual = self.class.digest_verification_code(code)
    ActiveSupport::SecurityUtils.secure_compare(expected, actual)
  end
end
