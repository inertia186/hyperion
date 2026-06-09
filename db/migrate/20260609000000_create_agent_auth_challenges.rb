class CreateAgentAuthChallenges < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_auth_challenges do |t|
      t.references :account, foreign_key: true
      t.string :token, null: false
      t.string :nonce, null: false
      t.string :verification_code_digest
      t.datetime :expires_at, null: false
      t.datetime :redeemed_at
      t.timestamps null: false
    end

    add_index :agent_auth_challenges, :token, unique: true
    add_index :agent_auth_challenges, :expires_at
  end
end
