class WalletLoginChallenge < ApplicationRecord
  PROVIDERS = %w[keychain hivesigner hiveauth peakvault].freeze
  TTL = 5.minutes

  validates :account_name, format: {with: /\A[a-z][a-z0-9.-]{1,14}[a-z0-9]\z/}
  validates :provider, inclusion: {in: PROVIDERS}

  def self.enabled_providers
    ENV.fetch('HYPERION_WALLET_PROVIDERS', 'keychain,hivesigner').split(',').map(&:strip) & PROVIDERS
  end

  def self.issue!(account_name:, provider:, binding:, origin:)
    raise ArgumentError, 'This wallet is not enabled.' unless enabled_providers.include?(provider)

    token = SecureRandom.urlsafe_base64(32)
    create!(
      token: token, account_name: account_name, provider: provider,
      session_digest: Digest::SHA256.hexdigest(binding), expires_at: TTL.from_now,
      message: "Sign in to Hyperion at #{origin} as @#{account_name} using #{provider}.\nPosting authority only.\nChallenge: #{token}"
    )
  end

  def available_for?(binding)
    binding.present? && consumed_at.nil? && Time.current < expires_at &&
      ActiveSupport::SecurityUtils.secure_compare(session_digest, Digest::SHA256.hexdigest(binding))
  end

  def consume!(binding)
    with_lock do
      raise ArgumentError, 'Login expired or already used. Please start again.' unless available_for?(binding)

      account = yield
      raise ArgumentError, 'Could not verify this account. Please start again.' unless account&.name == account_name
      raise ArgumentError, 'Login expired. Please start again.' unless available_for?(binding)

      update!(consumed_at: Time.current)
      account
    end
  end
end
