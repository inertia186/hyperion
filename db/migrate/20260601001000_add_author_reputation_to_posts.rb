class AddAuthorReputationToPosts < ActiveRecord::Migration[7.2]
  def change
    add_column :posts, :author_reputation, :integer, null: false, default: 25
    add_index :posts, :author_reputation
  end
end
