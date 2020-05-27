class IgnoredTag < ApplicationRecord
  belongs_to :account
  
  validates_presence_of :account
  validates_presence_of :tag
  
  validates_uniqueness_of :tag, scope: :account
  
  scope :poisoned_pill, lambda { |poisoned_pill = true| where(poisoned_pill: poisoned_pill) }
  
  def poisoned_authors
    return [] unless poisoned_pill?
    
    Post.where(id: Tag.where(tag: tag).select(:post_id)).distinct.pluck(:author)
  end
end
