class CommunityRefreshJob < ApplicationJob
  queue_as :default
  
  def perform(*args)
    name = args[0]
    community = Community.find_or_initialize_by(name: name)
    
    community.save
    
    Rails.logger.debug "Refreshed community: #{community.title} (#{name})"
  end
end
