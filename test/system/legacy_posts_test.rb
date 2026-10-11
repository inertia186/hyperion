require "application_system_test_case"

class LegacyPostsTest < ApplicationSystemTestCase
  test "legacy posts page sets up tag search and opens a preview" do
    sign_in_as_social
    visit posts_path

    assert_selector '.select2-container'
    click_on 'Allowed Unread'
    assert_selector '.modal.show .modal-title', text: 'Allowed Unread'
  end
end
