class CreateWalletLoginChallenges < ActiveRecord::Migration[8.1]
  def change
    create_table :wallet_login_challenges do |t|
      t.string :token, null: false
      t.string :account_name, null: false
      t.string :provider, null: false
      t.string :session_digest, null: false
      t.text :message, null: false
      t.datetime :expires_at, null: false
      t.datetime :consumed_at
      t.timestamps
    end
    add_index :wallet_login_challenges, :token, unique: true
    add_index :wallet_login_challenges, :expires_at
  end
end
