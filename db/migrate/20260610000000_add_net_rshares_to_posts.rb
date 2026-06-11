class AddNetRsharesToPosts < ActiveRecord::Migration[8.1]
  def change
    add_column :posts, :net_rshares, :decimal, precision: 30, scale: 0
  end
end
