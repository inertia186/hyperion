class AccountTag < ApplicationRecord
  belongs_to :account
  belongs_to :community, foreign_key: :tag, primary_key: :name, class_name: 'Community', required: false
  has_many :tags, foreign_key: :tag, primary_key: :tag
  has_many :posts, through: :tags
  
  validates_presence_of :type
  validates_presence_of :account
  validates_presence_of :tag
  
  validates_uniqueness_of :tag, scope: %i(type account)
  
  PAST_TYPE = 'AccountTag::Past'
  IGNORED_TYPE = 'AccountTag::Ignored'
  POISONED_PILL_TYPE = 'AccountTag::PoisonedPill'
  FAVORITE_TYPE = 'AccountTag::Favorite'
  
  scope :type, lambda { |type, invert = true| invert ? where.not(type: type) : where(type: type) }
  scope :past, lambda { |past = true| type(PAST_TYPE, !past) }
  scope :ignored, lambda { |ignored = true| type(IGNORED_TYPE, !ignored) }
  scope :poisoned_pill, lambda { |poisoned_pill = true| type(POISONED_PILL_TYPE, !poisoned_pill) }
  scope :favorite, lambda { |favorite = true| type(FAVORITE_TYPE, !favorite) }
  
  def best_tag_name
    Tag.best_tag_name(tag)
  end
end
