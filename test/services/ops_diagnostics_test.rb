require 'test_helper'
require 'digest'
require 'json'

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

  test 'blacklist returns normalized blacklist diagnostics' do
    blacklisted = posts(:blacklisted_allowed)
    blacklisted.update!(blacklist_reasons: [{'account' => 'fixture-curator'}])
    IndexerState.create!(name: 'hafsql_posts', last_id: 123, last_indexed_at: Time.current, last_sweep_at: Time.current)

    payload = OpsDiagnostics.blacklist
    normalized_keys = Post.blacklisted.pluck(:author, :permlink).map { |author, permlink| "#{author}/#{permlink}" }.sort
    reason_map = Post.blacklisted.pluck(:author, :permlink, :blacklist_reasons).each_with_object({}) do |(author, permlink, reasons), map|
      map["#{author}/#{permlink}"] = reasons
    end.sort.to_h

    assert_equal Rails.env, payload.fetch(:environment)
    assert_equal Post.count, payload.dig(:counts, :posts)
    assert_equal Post.blacklisted.count, payload.dig(:counts, :blacklisted)
    assert_equal Post.active.blacklisted.count, payload.dig(:counts, :active_blacklisted)
    assert_equal Post.blacklisted.where.not(blacklist_reasons: []).count, payload.dig(:counts, :blacklisted_with_reasons)
    assert_equal Digest::SHA256.hexdigest(normalized_keys.join("\n")), payload.dig(:signatures, :normalized_blacklisted_keys)
    assert_equal Digest::SHA256.hexdigest(JSON.generate(reason_map)), payload.dig(:signatures, :normalized_blacklist_reasons)
    assert_equal normalized_keys.first(OpsDiagnostics::SAMPLE_LIMIT), payload.dig(:samples, :first)
    assert_equal normalized_keys.last(OpsDiagnostics::SAMPLE_LIMIT), payload.dig(:samples, :last)
    assert_includes payload.fetch(:indexer_states).map { |state| state.fetch('name') }, 'hafsql_posts'
  end
end
