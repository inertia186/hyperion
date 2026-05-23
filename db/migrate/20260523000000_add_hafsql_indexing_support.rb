class AddHafsqlIndexingSupport < ActiveRecord::Migration[7.2]
  def change
    change_column_null :posts, :body, true

    create_table :indexer_states do |t|
      t.string :name, null: false
      t.bigint :last_id
      t.datetime :last_indexed_at
      t.datetime :last_sweep_at
      t.timestamps null: false
    end

    add_index :indexer_states, :name, unique: true
  end
end
