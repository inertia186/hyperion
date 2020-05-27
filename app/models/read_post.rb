class ReadPost < ApplicationRecord
  belongs_to :account
  belongs_to :post
  
  validates_presence_of :account
  validates_presence_of :post
  
  validates_uniqueness_of :post, scope: :account
end
