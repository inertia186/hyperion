require 'test_helper'

class PostKeywordSearchTest < ActiveSupport::TestCase
  test 'normalizes mention-like terms' do
    assert_equal ['alice', 'hive'], PostKeywordSearch.new('@alice hive').terms
  end

  test 'applies terms across post titles and bodies' do
    posts(:allowed_unread).update!(title: 'Needlecraft Notes', body: 'A post about curation.')
    posts(:read_allowed).update!(title: 'Read Allowed', body: 'More needlecraft detail.')

    titles = PostKeywordSearch.new('needlecraft').apply(Post.all).order(:title).pluck(:title)

    assert_equal ['Needlecraft Notes', 'Read Allowed'], titles
  end

  test 'suggests a nearby keyword that has matching posts' do
    posts(:allowed_unread).update!(title: 'Needlecraft Notes')

    assert_equal 'needlecraft', PostKeywordSearch.new('nedlecraft').suggestion
  end

  test 'returns no suggestion for blank search' do
    assert_nil PostKeywordSearch.new('').suggestion
  end
end
