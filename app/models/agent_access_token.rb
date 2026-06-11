class AgentAccessToken < ApplicationRecord
  TOKEN_PREFIX = 'hyp_at_'

  belongs_to :account

  validates :token_digest, presence: true, uniqueness: true

  scope :active, -> { where(revoked_at: nil) }

  def self.issue_for!(account)
    raw_token = "#{TOKEN_PREFIX}#{SecureRandom.urlsafe_base64(48)}"
    token = create!(account: account, token_digest: digest(raw_token))

    [token, raw_token]
  end

  def self.account_for(raw_token)
    return nil if raw_token.blank?

    token = active.includes(:account).find_by(token_digest: digest(raw_token))
    return nil unless token

    token.touch(:last_used_at)
    token.account
  end

  def self.digest(raw_token)
    Digest::SHA256.hexdigest(raw_token.to_s)
  end
end
