class AddPayoutUnavailableAtToPosts < ActiveRecord::Migration[8.1]
  def change
    add_column :posts, :payout_unavailable_at, :datetime
    add_index :posts, :payout_unavailable_at
  end
end
