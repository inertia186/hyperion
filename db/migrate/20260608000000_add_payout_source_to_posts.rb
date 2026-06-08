class AddPayoutSourceToPosts < ActiveRecord::Migration[8.1]
  def change
    add_column :posts, :payout_source, :string
    add_index :posts, :payout_source
  end
end
