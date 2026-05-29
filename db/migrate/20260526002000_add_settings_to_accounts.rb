class AddSettingsToAccounts < ActiveRecord::Migration[7.2]
  def change
    add_column :accounts, :settings, :json, null: false, default: {}
  end
end
