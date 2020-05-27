class PostCleanupJob < ApplicationJob
  queue_as :default
  
  def perform(*args)
    Post.transaction do
      inactive_count = Post.within_payout_window(false).destroy_all.size
      
      Rails.logger.info "Posts that became inactive: #{inactive_count}"

      not_blacklisted = Post.active.blacklisted(false)
      
      if (newly_blacklisted = not_blacklisted.pluck(:author) & PostIndexJob.new.blacklist).any?
        Rails.logger.info "Found accounts became blacklisted: #{newly_blacklisted.size}"
        
        if (blacklisted_count = not_blacklisted.where(author: newly_blacklisted).update_all(blacklisted: true)) > 0
          Rails.logger.info "Posts that became blacklisted: #{blacklisted_count}"
        end
      end
    end
  end
end
