require 'test_helper'

class PostCleanupJobTest < ActiveJob::TestCase
  setup do
    IndexerState.where(name: PostCleanupJob::AUTHOR_REPUTATION_STATE_NAME).delete_all
  end

  test 'marks active posts from newly blacklisted authors' do
    post = posts(:allowed_unread)
    blacklist = FakeBlacklist.new({post.author => [{'account' => 'fixture-curator'}]})

    assert_not post.blacklisted?

    with_reputations(post.author => 25) do
      PostIndexJob.stub(:new, blacklist) do
        PostCleanupJob.new.perform
      end
    end

    post.reload
    assert post.blacklisted?
    assert_equal [{'account' => 'fixture-curator'}], post.blacklist_reasons
  end

  test 'refreshes author reputations for active posts' do
    post = posts(:allowed_unread)
    blacklist = FakeBlacklist.new({})

    with_reputations(post.author => 41) do
      PostIndexJob.stub(:new, blacklist) do
        PostCleanupJob.new.perform
      end
    end

    assert_equal 41, post.reload.author_reputation
  end

  test 'refreshes only authors still using default reputation' do
    refreshed_authors = nil
    Post.where(author: posts(:allowed_unread).author).update_all(author_reputation: 41)
    posts(:muted_unread).update!(author_reputation: 25)
    IndexerState.fetch!(PostCleanupJob::AUTHOR_REPUTATION_STATE_NAME).update!(last_indexed_at: 2.days.ago)
    blacklist = FakeBlacklist.new({})
    reputation_scores = ->(authors, **) {
      refreshed_authors = Array(authors)
      refreshed_authors.index_with { 42 }
    }

    HiveReputation.stub(:scores_for, reputation_scores) do
      PostIndexJob.stub(:new, blacklist) do
        PostCleanupJob.new.perform
      end
    end

    assert_not_includes refreshed_authors, posts(:allowed_unread).author
    assert_includes refreshed_authors, posts(:muted_unread).author
    assert_equal 41, posts(:allowed_unread).reload.author_reputation
    assert_equal 42, posts(:muted_unread).reload.author_reputation
  end

  test 'skips legacy default reputations once backfill is present' do
    refreshed_authors = nil
    posts(:allowed_unread).update!(author_reputation: 41)
    posts(:muted_unread).update!(author_reputation: 25)
    blacklist = FakeBlacklist.new({})
    reputation_scores = ->(authors, **) {
      refreshed_authors = Array(authors)
      refreshed_authors.index_with { 42 }
    }

    HiveReputation.stub(:scores_for, reputation_scores) do
      PostIndexJob.stub(:new, blacklist) do
        PostCleanupJob.new.perform
      end
    end

    assert_nil refreshed_authors
    assert_equal 25, posts(:muted_unread).reload.author_reputation
    assert IndexerState.find_by!(name: PostCleanupJob::AUTHOR_REPUTATION_STATE_NAME).last_indexed_at.present?
  end

  test 'backfills reasons for active posts already marked blacklisted' do
    post = posts(:blacklisted_allowed)
    post.update!(blacklist_reasons: [])
    blacklist = FakeBlacklist.new({post.author => [{'account' => 'fixture-curator'}]})

    with_reputations(post.author => 25) do
      PostIndexJob.stub(:new, blacklist) do
        PostCleanupJob.new.perform
      end
    end

    assert_equal [{'account' => 'fixture-curator'}], post.reload.blacklist_reasons
  end

  test 'clears posts no longer on blacklist' do
    post = posts(:blacklisted_allowed)
    post.update!(blacklist_reasons: [{'account' => 'fixture-curator'}])
    blacklist = FakeBlacklist.new({})

    with_reputations(post.author => 25) do
      PostIndexJob.stub(:new, blacklist) do
        PostCleanupJob.new.perform
      end
    end

    post.reload
    assert_not post.blacklisted?
    assert_equal [], post.blacklist_reasons
  end

private
  def with_reputations(reputations)
    reputation_scores = ->(authors, **) {
      Array(authors).map(&:to_s).map(&:downcase).reject(&:blank?).uniq.index_with do |author|
        reputations.fetch(author, HiveReputation::DEFAULT_REPUTATION)
      end
    }

    HiveReputation.stub(:scores_for, reputation_scores) do
      yield
    end
  end

  class FakeBlacklist
    def initialize(reasons)
      @reasons = reasons
    end

    def blacklist_reasons_by_account
      @reasons
    end

    def blacklist_refresh_failed?
      false
    end
  end
end
