require 'test_helper'

class PostCurationQueryTest < ActiveSupport::TestCase
  test 'keyword counts share one search scan while page and related authors remain scoped' do
    posts(:allowed_unread).update!(body: 'A needle in the body')
    result = nil

    assert_queries_match(/ILIKE/, count: 3) do
      result = PostCurationQuery.new(
        account: accounts(:curated), params: {query: 'needle'}, session: {}, track_past_tags: false
      ).call
    end

    assert_equal [posts(:allowed_unread).id], result.post_ids
    assert_equal [posts(:allowed_unread).author], result.related_authors
    assert_equal 1, result.total_count
  end

  test 'keyword signals retain author history and poison posts outside search matches' do
    post = posts(:allowed_unread)
    post.update!(body: 'A needle in the body')
    history = post.dup
    history.assign_attributes(permlink: 'other-history', title: 'Unrelated history', body: nil)
    history.save!
    account = accounts(:curated)
    account.poisoned_pill_tags.create!(tag: 'spam')

    result = PostCurationQuery.new(
      account: account, params: {only_keyword: true, query: 'needle'}, session: {}, track_past_tags: false
    ).call

    assert_equal [post.id], result.post_ids
    assert_equal 1, result.signal_counts.fetch('high_prolific_author')
    assert_equal 1, result.signal_counts.fetch('poisoned_pills')
  end

  test 'pagination totals match the filtered relation for every mode and signal' do
    freeze_time do
      account = accounts(:curated)
      account.poisoned_pill_tags.create!(tag: 'spam')
      modes = [{}, {only_read: true}, {only_ignored: true}, {only_deleted: true},
               {only_blacklisted: true}, {only_keyword: true}]

      modes.each do |mode|
        ['', *PostCurationSignal::SIGNALS].each do |signal|
          [nil, 'Allowed'].each do |query|
            result = PostCurationQuery.new(
              account: account, params: {tag: 'haf', query: query, signal: signal, limit: 1}.merge(mode),
              session: {muted_authors_enabled: true}, track_past_tags: false
            ).call

            assert_equal result.all_posts.count, result.total_count, "#{mode.inspect}, #{signal}, #{query}"
          end
        end
      end
    end
  end
end
