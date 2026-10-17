require "application_system_test_case"

class CurationInboxTest < ApplicationSystemTestCase
  test "selecting a post renders its body in the preview" do
    posts(:read_allowed).update!(body: "## Field notes\n\nReplicated **twice** on mainnet.")
    sign_in_as_social

    click_on 'Read Allowed'

    within 'article.post-body' do
      assert_selector 'h2', text: 'Field notes'
      assert_selector 'strong', text: 'twice'
    end
  end
end
