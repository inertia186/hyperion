class CreateTagCounts < ActiveRecord::Migration[7.2]
  def up
    create_table :tag_counts do |t|
      t.string :tag, null: false
      t.integer :posts_count, null: false, default: 0
      t.timestamps null: false
    end

    add_index :tag_counts, :tag, unique: true
    add_index :tag_counts, :posts_count

    execute <<~SQL.squish
      INSERT INTO tag_counts (tag, posts_count, created_at, updated_at)
      SELECT tag, COUNT(*), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM tags
      GROUP BY tag
    SQL
  end

  def down
    drop_table :tag_counts
  end
end
