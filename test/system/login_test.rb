require "application_system_test_case"

class LoginTest < ApplicationSystemTestCase
  test "login page boots the legacy bundle" do
    visit new_session_path

    # The sessions Stimulus controller focuses the account field on connect.
    assert_selector 'input[name="account_name"]:focus'
    assert page.evaluate_script('[jQuery.fn.select2, jQuery.fn.effect, jQuery.fn.modal].every((plugin) => typeof plugin === "function")')
  end

  test "social signs in with Keychain and sees the curation inbox" do
    sign_in_as_social

    assert_text 'Allowed Unread'
    assert_no_text 'Deleted Allowed'
  end
end
