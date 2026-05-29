class AddBlacklistReasonsToPosts < ActiveRecord::Migration[7.2]
  def change
    add_column :posts, :blacklist_reasons, :json, null: false, default: []
  end
end
