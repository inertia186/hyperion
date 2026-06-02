class CreateAuthorReputations < ActiveRecord::Migration[7.2]
  def change
    create_table :author_reputations do |t|
      t.string :account, null: false
      t.integer :reputation, null: false, default: 25
      t.datetime :refreshed_at, null: false

      t.timestamps
    end

    add_index :author_reputations, :account, unique: true
    add_index :author_reputations, :refreshed_at

    reversible do |direction|
      direction.up do
        execute <<~SQL.squish
          INSERT INTO author_reputations (account, reputation, refreshed_at, created_at, updated_at)
          SELECT LOWER(author), MAX(author_reputation), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM posts
          WHERE author_reputation <> 25
          GROUP BY LOWER(author)
        SQL
      end
    end
  end
end
