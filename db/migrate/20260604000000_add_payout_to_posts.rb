class AddPayoutToPosts < ActiveRecord::Migration[8.1]
  def change
    add_column :posts, :payout, :string
    add_column :posts, :payout_amount, :decimal, precision: 12, scale: 3
    add_column :posts, :payout_currency, :string
    add_column :posts, :payout_fetched_at, :datetime

    add_index :posts, :payout_amount
    add_index :posts, :payout_fetched_at
  end
end
