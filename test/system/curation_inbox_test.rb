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

  test "keyboard focus remains visible with normal and forced colors" do
    sign_in_as_social

    page.driver.with_playwright_page do |browser_page|
      reset = browser_page.locator('button[title="Reset"]')
      reset.focus
      reset.press('Tab')
      browser_page.keyboard.press('Shift+Tab')
    end
    assert_equal 'Reset', page.evaluate_script('document.activeElement.title')
    assert_not_equal 'none', page.evaluate_script('getComputedStyle(document.activeElement).boxShadow')

    page.driver.with_playwright_page do |browser_page|
      browser_page.emulate_media(forcedColors: 'active')
    end
    assert page.evaluate_script('matchMedia("(forced-colors: active)").matches')
    assert_equal 'solid', page.evaluate_script('getComputedStyle(document.activeElement).outlineStyle')
    assert_operator page.evaluate_script('parseFloat(getComputedStyle(document.activeElement).outlineWidth)'), :>=, 2
    assert_not_equal page.evaluate_script('getComputedStyle(document.activeElement).backgroundColor'),
      page.evaluate_script('getComputedStyle(document.activeElement).outlineColor')
  end

  test "toolbar controls fit mobile tablet and desktop widths" do
    posts(:read_allowed).update!(body: 'Mobile preview')
    sign_in_as_social

    [320, 390, 768, 1400].each do |width|
      page.driver.with_playwright_page do |browser_page|
        browser_page.viewport_size = {width: width, height: 900}
      end
      assert_selector 'button[aria-label="Search"]'
      geometry = page.evaluate_script(<<~JS)
        (() => {
          const search = document.querySelector('button[aria-label="Search"]').getBoundingClientRect();
          const sort = document.querySelector('select[aria-label="Sort posts"]');
          const control = sort.closest('label').getBoundingClientRect();
          return {
            viewport: innerWidth, content: document.documentElement.scrollWidth,
            searchHeight: search.height, searchWidth: search.width,
            controlHeight: control.height, controlLeft: control.left, controlRight: control.right,
            fontSize: getComputedStyle(sort).fontSize
          };
        })()
      JS
      assert_operator geometry.fetch('content'), :<=, geometry.fetch('viewport'), "Horizontal overflow at #{width}px"
      assert_operator geometry.fetch('searchHeight'), :>=, 44
      assert_operator geometry.fetch('searchWidth'), :>=, 44
      assert_operator geometry.fetch('controlHeight'), :>=, 44
      assert_operator geometry.fetch('controlLeft'), :>=, 0
      assert_operator geometry.fetch('controlRight'), :<=, geometry.fetch('viewport')
      assert_equal width < 768 ? '16px' : '14px', geometry.fetch('fontSize')
    end

    page.driver.with_playwright_page do |browser_page|
      browser_page.viewport_size = {width: 390, height: 844}
    end
    select 'Keywords', from: 'Search form'
    fill_in 'Search title or body keywords', with: 'Read Allowed'
    click_on 'Search', exact: true
    assert_selector '[data-post-list-row]'
    click_on 'Read Allowed'
    assert_selector '[role="dialog"][aria-label="Post preview"] article.post-body', text: 'Mobile preview'
  end
end
