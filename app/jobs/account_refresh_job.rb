class AccountRefreshJob < ApplicationJob
  queue_as :default
  
  def perform(*args)
    account_id = args[0];
    account = Account.find(account_id)
    
    account.refresh_muted_authors
    
    Rails.logger.debug "Refreshed account: #{account}"
  end
end
