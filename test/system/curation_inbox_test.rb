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

  test "compiled styles preserve themes and responsive controls" do
    page.driver.with_playwright_page { |browser_page| browser_page.emulate_media(colorScheme: 'light') }
    sign_in_as_social
    select 'Light', from: 'Theme', visible: :all

    assert_selector 'html:not(.dark)'
    assert_selector '[aria-label="Select Allowed Unread"]'
    assert_includes page.evaluate_script('getComputedStyle(document.body).fontFamily'), 'Work Sans'
    assert_equal 'rgb(246, 247, 249)', page.evaluate_script('getComputedStyle(document.body).backgroundColor')
    assert_equal 'pointer', page.evaluate_script('getComputedStyle(document.querySelector("[aria-label=\"Select Allowed Unread\"]")).cursor')
    assert_equal '14px', page.evaluate_script('getComputedStyle(document.querySelector("[aria-label=\"Sort posts\"]")).fontSize')
    find('button[aria-label="Settings"]').click
    assert_selector '.settings-modal-footer'
    light_button_color = page.evaluate_script('getComputedStyle(document.querySelector(".settings-modal-footer button:last-child")).backgroundColor')
    find('button[aria-label="Close settings"]').click

    select 'Dark', from: 'Theme', visible: :all
    assert_selector 'html.dark'
    assert_equal 'rgb(17, 19, 23)', page.evaluate_script('getComputedStyle(document.body).backgroundColor')
    find('button[aria-label="Settings"]').click
    assert_selector '.settings-modal-footer'
    assert_not_equal light_button_color, page.evaluate_script('getComputedStyle(document.querySelector(".settings-modal-footer button:last-child")).backgroundColor')
    find('button[aria-label="Close settings"]').click

    page.driver.with_playwright_page do |browser_page|
      browser_page.viewport_size = {width: 390, height: 844}
    end
    assert_equal '16px', page.evaluate_script('getComputedStyle(document.querySelector("[aria-label=\"Sort posts\"]")).fontSize')
  end
end
