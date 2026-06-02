require 'test_helper'

class OpsDiagnosticsTest < ActiveSupport::TestCase
  test 'inbox returns read-only curation diagnostics' do
    account = accounts(:curated)
    past_tags_count = account.past_tags.count

    payload = OpsDiagnostics.inbox(account.name)

    assert_equal account.name, payload.fetch(:account)
    assert_equal account.minimum_reputation, payload.dig(:settings, :minimum_reputation)
    assert_equal account.blacklist_sources, payload.dig(:settings, :blacklist_sources)
    assert_equal PostCurationQuery.new(account: account, params: {}, session: {}, track_past_tags: false).call.mode_counts, payload.fetch(:mode_counts)
    assert_equal payload.dig(:filters, :final), payload.fetch(:total_count)
    assert_operator payload.fetch(:sample).size, :<=, OpsDiagnostics::SAMPLE_LIMIT
    assert_equal past_tags_count, account.past_tags.reload.count
  end

  test 'reputation returns cache and active post diagnostics' do
    AuthorReputation.create!(account: 'visible-author', reputation: 55, refreshed_at: Time.current)
    Post.where(author: 'visible-author').update_all(author_reputation: 55)

    HiveReputation.stub(:scores_for, ->(authors) { authors.index_with { 55 } }) do
      payload = OpsDiagnostics.reputation(accounts(:curated).name)

      assert_equal accounts(:curated).name, payload.fetch(:account)
      assert_equal AuthorReputation.count, payload.dig(:author_reputations, :total)
      assert_equal AuthorReputation.where(reputation: HiveReputation::DEFAULT_REPUTATION).count, payload.dig(:author_reputations, :default)
      assert_equal Post.active.where('author_reputation >= ?', accounts(:curated).minimum_reputation).count, payload.dig(:active_posts, :at_or_above_minimum)
      assert_operator payload.fetch(:sample_scores).size, :<=, OpsDiagnostics::SAMPLE_LIMIT
    end
  end
end
