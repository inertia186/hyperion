require 'test_helper'

class PostHeadingAnchorsTest < ActiveSupport::TestCase
  test 'generates consistent unique heading anchors shared with the browser renderer' do
    cases = JSON.parse(File.read(File.expand_path('../fixtures/files/post_heading_anchors.json', __dir__)))

    cases.each do |example|
      fragment = Nokogiri::HTML::DocumentFragment.parse(PostHeadingAnchors.call(example.fetch('html')))
      headings = fragment.css('h1, h2, h3, h4, h5, h6')
      assert_equal example.fetch('ids'), headings.map { |heading| heading['id'] }, example.fetch('html')
      assert_equal headings.length, fragment.css('[id]').length
    end
  end
end
