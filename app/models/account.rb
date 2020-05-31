class Account < ApplicationRecord
  extend Memoist
  
  has_many :read_posts, dependent: :destroy, counter_cache: :read_posts_count
  has_many :account_tags, dependent: :destroy, counter_cache: :account_tags_count
  has_many :past_tags, -> { past }, class_name: 'AccountTag::Past'
  has_many :ignored_tags, -> { ignored }, class_name: 'AccountTag::Ignored'
  has_many :poisoned_pill_tags, -> { poisoned_pill }, class_name: 'AccountTag::PoisonedPill'
  has_many :favorite_tags, -> { favorite }, class_name: 'AccountTag::Favorite'
  
  validates_presence_of :name
  
  validates_uniqueness_of :name
  
  def to_param
    [id, name].join('-').parameterize
  end
  
  def mark_post_as_read!(id)
    read_posts.find_or_create_by(post_id: id)
  end
  
  def mark_post_as_unread!(id)
    read_post = read_posts.find_by(post_id: id)
    read_post.destroy if !!read_post
  end
  
  def post_read?(id)
    read_posts.where(post_id: id).exists?
  end
  
  def poisoned_posts(invert = true)
    Post.where(id: Tag.where(tag: poisoned_pill_tags(invert).select(:tag)).select(:post_id))
  end
  
  def refresh_muted_authors
    self.muted_authors = []
    count = -1
    follow_api = Hive::Api.new
    
    until count == muted_authors.size
      count = muted_authors.size
      follow_api.get_following(name, muted_authors.last, 'ignore', 1000) do |result|
        self.muted_authors += result.map &:following
        self.muted_authors = muted_authors.uniq
        sleep 0.1
      end
    end
  end
end
