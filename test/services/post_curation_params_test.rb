require 'test_helper'

class PostCurationParamsTest < ActiveSupport::TestCase
  test 'applies defaults and clamps paging values' do
    account = accounts(:curated)
    parsed = PostCurationParams.new(params: {sort: 'surprise', limit: 0, page: -2}, account: account, session: {}).call

    assert_equal PostCurationSort::DEFAULT_SORT, parsed.sort
    assert_equal 1, parsed.limit
    assert_equal 1, parsed.page
    assert_equal account.minimum_reputation, parsed.query_state.fetch(:minimum_reputation)
  end

  test 'parses tag patterns with author app other and excluded tags' do
    account = accounts(:curated)
    parsed = PostCurationParams.new(params: {tag: 'hive+curation+-spam', app: 'peakd'}, account: account, session: {}).call

    assert_equal 'hive', parsed.tag
    assert_equal ['curation'], parsed.other_tags
    assert_equal ['spam'], parsed.without_tags
    assert_equal 'hive+curation+-spam', parsed.tag_pattern
    assert_equal 'peakd', parsed.app
  end

  test 'extracts author and app shorthands from tag input' do
    account = accounts(:curated)
    author = PostCurationParams.new(params: {tag: '@alice'}, account: account, session: {}).call
    app = PostCurationParams.new(params: {tag: 'app:ecency'}, account: account, session: {}).call

    assert_equal 'alice', author.author
    assert_equal '', author.tag
    assert_equal 'ecency', app.app
    assert_equal '', app.tag
  end

  test 'normalizes booleans and session flags into query state' do
    account = accounts(:curated)
    parsed = PostCurationParams.new(
      params: {only_read: '1', only_keyword: 'true', only_deleted: true},
      account: account,
      session: {muted_authors_enabled: true, only_favorite_tags: true}
    ).call

    assert_equal true, parsed.only_read
    assert_equal true, parsed.only_keyword
    assert_equal true, parsed.only_deleted
    assert_equal true, parsed.query_state.fetch(:muted_authors_enabled)
    assert_equal true, parsed.query_state.fetch(:only_favorite_tags)
  end

  test 'tracks only the primary tag when enabled' do
    account = accounts(:curated)
    account.past_tags.where(tag: 'fresh').delete_all

    PostCurationParams.new(params: {tag: 'fresh+other'}, account: account, session: {}, track_past_tags: true).call
    assert account.past_tags.exists?(tag: 'fresh')

    account.past_tags.where(tag: 'untracked').delete_all
    PostCurationParams.new(params: {tag: 'untracked'}, account: account, session: {}, track_past_tags: false).call
    assert_not account.past_tags.exists?(tag: 'untracked')
  end
end
