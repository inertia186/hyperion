class CreateAgentAccessTokens < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_access_tokens do |t|
      t.references :account, null: false, foreign_key: true
      t.string :token_digest, null: false
      t.datetime :last_used_at
      t.datetime :revoked_at

      t.timestamps
    end

    add_index :agent_access_tokens, :token_digest, unique: true
    add_index :agent_access_tokens, :revoked_at
  end
end
