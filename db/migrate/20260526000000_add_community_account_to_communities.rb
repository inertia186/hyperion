class AddCommunityAccountToCommunities < ActiveRecord::Migration[7.2]
  def change
    add_column :communities, :community_account, :json, null: false, default: {}
  end
end
