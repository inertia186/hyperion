class Tag < ApplicationRecord
  COMMUNITY_CATEGORY_REGEX = /^hive-[1-3]\d{4,6}$/
  
  belongs_to :post
  
  validates_presence_of :post
  validates_presence_of :tag
  
  validates_uniqueness_of :tag, scope: :post
  
  after_create :initalize_community, :increment_tag_count
  after_destroy :decrement_tag_count
  
  scope :include_category, lambda { |include_category = true|
    if include_category
      all
    else
      where(category: false)
    end
  }
  
  scope :community, lambda { |community = true|
    if community
      where("tags.tag LIKE 'hive-%'")
    else
      where("tags.tag NOT LIKE 'hive-%'")
    end
  }
  
  def self.related_tags(tag = nil, limit = 1000)
    return TagCount.group_by_tag_count(limit: limit).keys if tag.blank?

    tags = Post.joins(:tags).active.tagged_any(tag)
    tags = tags.limit(limit).group_by_tag_count
    
    tags.keys
  end
  
  def self.related_author(author = nil, limit = 1000)
    tags = Post.joins(:tags).active.author(author)
    tags = tags.limit(limit).group_by_tag_count
    
    tags.keys
  end
  
  def self.group_by_tag_count(direction = :desc)
    group(:tag).order("count_all #{direction}").count(:all)
  end
  
  def self.best_tag_name(tag)
    return '' unless !!tag
    
    tag = tag.downcase
    name = if tag =~ COMMUNITY_CATEGORY_REGEX
      community_title(tag) || tag
    elsif tag.starts_with?('#')
      tag.split('#').last
    end
    
    name || tag
  end
private  
  def initalize_community
    return unless tag =~ COMMUNITY_CATEGORY_REGEX
    
    unless Community.where(name: tag).exists?
      CommunityRefreshJob.perform_later(tag)
    end
  end

  def increment_tag_count
    TagCount.increment!(tag)
  end

  def decrement_tag_count
    TagCount.decrement!(tag)
  end
  
  def self.community_title(name)
    community = Community.find_or_create_by(name: name)
    
    if !!community
      community.title
    else
      name
    end
  end
end
