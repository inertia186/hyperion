class PostCleanupJob < ApplicationJob
  queue_as :default
  
  def perform(*args)
    Post.transaction do
      inactive_count = Post.within_payout_window(false).destroy_all.size
      
      Rails.logger.info "Posts that became inactive: #{inactive_count}"

      blacklist_reasons_by_account = PostIndexJob.new.blacklist_reasons_by_account
      not_blacklisted = Post.active.blacklisted(false)
      
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
    end
  end
end
