class PostCleanupJob < ApplicationJob
  AUTHOR_REPUTATION_STATE_NAME = 'author_reputations'

  queue_as :default
  
  def perform(*args)
    blacklist = PostIndexJob.new
    blacklist_reasons_by_account = blacklist.blacklist_reasons_by_account
    author_reputations = active_author_reputations

    Post.transaction do
      inactive_count = Post.within_payout_window(false).destroy_all.size
      
      Rails.logger.info "Posts that became inactive: #{inactive_count}"

      not_blacklisted = Post.active.blacklisted(false)
      refresh_author_reputations(author_reputations)
      
      if (newly_blacklisted = not_blacklisted.pluck(:author).map(&:downcase) & blacklist_reasons_by_account.keys).any?
        Rails.logger.info "Found accounts became blacklisted: #{newly_blacklisted.size}"
        
        blacklisted_count = 0
        newly_blacklisted.each do |author|
          blacklisted_count += not_blacklisted.where('LOWER(author) = ?', author).update_all(blacklisted: true, blacklist_reasons: blacklist_reasons_by_account[author])
        end

        Rails.logger.info "Posts that became blacklisted: #{blacklisted_count}" if blacklisted_count > 0
      end

      existing_blacklisted = Post.active.blacklisted(true).where("blacklist_reasons::text = '[]'")
      backfilled_count = 0
      (existing_blacklisted.pluck(:author).map(&:downcase) & blacklist_reasons_by_account.keys).each do |author|
        backfilled_count += existing_blacklisted.where('LOWER(author) = ?', author).update_all(blacklist_reasons: blacklist_reasons_by_account[author])
      end

      Rails.logger.info "Blacklisted posts with reasons backfilled: #{backfilled_count}" if backfilled_count > 0

      unless blacklist.blacklist_refresh_failed?
        still_blacklisted = blacklist_reasons_by_account.keys
        stale_blacklisted = Post.active.blacklisted(true)
        stale_blacklisted = stale_blacklisted.where.not('LOWER(author) IN (?)', still_blacklisted) if still_blacklisted.any?
        unblacklisted_count = stale_blacklisted.update_all(blacklisted: false, blacklist_reasons: [])

        Rails.logger.info "Posts that became unblacklisted: #{unblacklisted_count}" if unblacklisted_count > 0
      end
    end
  end

private
  def active_author_reputations
    state = IndexerState.fetch!(AUTHOR_REPUTATION_STATE_NAME)
    scope = Post.active.where(author_reputation: HiveReputation::DEFAULT_REPUTATION)

    legacy_scope = scope.where(<<~SQL.squish)
      NOT EXISTS (
        SELECT 1
        FROM author_reputations
        WHERE author_reputations.account = LOWER(posts.author)
      )
    SQL

    if state.last_indexed_at.present?
      recent_scope = scope.where('posts.created_at > ?', state.last_indexed_at)
      authors = (legacy_scope.distinct.pluck(:author) + recent_scope.distinct.pluck(:author)).uniq
    else
      authors = scope.distinct.pluck(:author)
    end

    Rails.logger.info "Refreshing author reputations: #{authors.size}"
    reputations = HiveReputation.scores_for_indexing(authors, api: PostIndexJob::api)
    state.update!(last_indexed_at: Time.current)
    reputations
  end

  def refresh_author_reputations(reputations)
    updated_count = 0

    reputations.each do |author, reputation|
      updated_count += Post.active.where('LOWER(author) = ?', author).update_all(author_reputation: reputation)
    end

    Rails.logger.info "Author reputations refreshed: #{updated_count}" if updated_count > 0
  end
end
