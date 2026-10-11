require "test_helper"
require_relative "support/fake_hive"

class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  # The posting key published for the `social` demo account.
  SOCIAL_POSTING_WIF = '5JrvPrQeBBvCRdjv29iDvkwn3EQYZ9jqfAHzrCyUvfbEbRkrYFC'

  # Stands in for the Hive Keychain extension; signing happens in Ruby.
  FAKE_KEYCHAIN = <<~JS
    window.hive_keychain = {
      requestHandshake(callback) { callback() },
      requestSignBuffer(username, message, keyType, callback) {
        window.hyperionSignBuffer(message).then(
          (result) => callback({success: true, result}),
          (error) => callback({success: false, error: 'user_cancel', message: String(error)})
        )
      }
    }
  JS

  driven_by :playwright, screen_size: [1400, 1400]

  setup do
    FakeHive.start
    @page_errors = []
    page.driver.with_playwright_page do |browser_page|
      browser_page.on('pageerror', ->(error) { @page_errors << error.message })
      context = browser_page.context
      # Keep the browser and the image proxy off the network: external scripts
      # and images load empty.
      context.route(%r{^https?://(?!127\.0\.0\.1[:/])|/api/v1/images/proxy}, ->(route, _request) { route.fulfill(status: 204, body: '') })
      context.expose_function('hyperionSignBuffer', ->(message) { sign_buffer(message) })
      context.add_init_script(script: FAKE_KEYCHAIN)
    end
  end

  teardown do
    unhandled = FakeHive.stop
    assert_empty @page_errors, 'Uncaught browser errors'
    assert_empty unhandled, 'Hive calls the fake node did not answer'
  end

  def sign_in_as_social
    visit new_session_path
    fill_in 'Account Name', with: 'social'
    click_on 'Hive Keychain'
    assert_current_path root_path
  end

private
  # Signs like Keychain's requestSignBuffer: a compact recoverable signature
  # over SHA-256 of the message, prefixed with 31 + the recovery id.
  def sign_buffer(message)
    secret = [Bitcoin.decode_base58(SOCIAL_POSTING_WIF)].pack('H*').byteslice(1, 32)
    context = Secp256k1::Context.new
    private_key = context.key_pair_from_private_key(secret).private_key
    compact, recovery_id = context.sign_recoverable(private_key, Digest::SHA256.digest(message)).compact
    (31 + recovery_id).to_s(16) + compact.unpack1('H*')
  end
end
