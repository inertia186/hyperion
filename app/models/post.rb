class Post < ApplicationRecord
  extend Immutable
  
  DIFF_MATCH_PATCH_PATTERN = /@@ -[0-9]+,[0-9]+ \+[0-9]+,[0-9]+ @@/
  IMAGE_URL_PATTERN = /(http(s?):\/\/.*\.(jpeg|jpg|gif|png))/
  YOUTUBE_SHORT_URL_PATTERN = /http(s?):\/\/youtu.be\/(.*)/
  YOUTUBE_LONG_URL_PATTERN = /http(s?):\/\/.*youtube.com\/.*?.*v=(.*)(&?).*/
  
  has_many :tags, dependent: :destroy, counter_cache: :tags_count
  has_many :tags_without_category, -> { include_category(false) }, class_name: 'Tag'
  has_one :community, foreign_key: :name, primary_key: :category, class_name: 'Community', required: false
  has_many :read_posts, counter_cache: :tags_count, dependent: :destroy
  has_many :readers, through: :read_posts, source: :account
  
  validates_presence_of :author
  validates_presence_of :permlink
  
  validates_uniqueness_of :permlink, scope: :author
  
  scope :active, lambda { |active = true|
    if active
      deleted(false).within_payout_window
    else
      where('posts.deleted_at IS NOT NULL OR posts.created_at < ?', 7.days.ago)
    end
  }
  
  scope :within_payout_window, lambda { |within_payout_window = true |
    if within_payout_window
      where('posts.created_at > ?', 7.days.ago)
    else
      where.not('posts.created_at > ?', 7.days.ago)
    end
  }
  
  scope :blacklisted, lambda { |blacklisted = true| where(blacklisted: blacklisted) }
  
  scope :deleted, lambda { |deleted = true|
    if deleted
      where.not(deleted_at: nil)
    else
      where(deleted_at: nil)
    end
  }
  
  scope :tagged_any, lambda { |tag, invert = true|
    tag = [tag].flatten.map(&:to_s).map(&:downcase)
    tag = tag.reject(&:empty?)
    
    if invert
      if tag.empty?
        all
      else
        where(id: Tag.where(tag: tag).select(:post_id))
      end
    else
      where.not(id: Tag.where(tag: tag).select(:post_id))
    end
  }
  
  scope :tagged_all, lambda { |tag, invert = true|
    tag = [tag].flatten.map(&:to_s).map(&:downcase)
    tag = tag.reject(&:empty?)
    
    raise 'Unsupported inversion.' if !invert
    
    r = all
    
    tag.each do |t|
      r = r.where(id: Tag.where(tag: tag).select(:post_id))
    end
    
    r
  }
  
  scope :unread, lambda { |options = {}|
    return all if options[:by].nil?
    account = options[:by]
    allow_tag = [options[:allow_tag]].flatten
    
    r = where.not(id: account.read_posts.select(:post_id))
    
    ignored_tags = account.ignored_tags
    r = r.tagged_any(ignored_tags.pluck(:tag) - allow_tag, false)
    
    unless !!options[:include_muted]
      r = r.where.not(author: account.reload.muted_authors)
    end
    
    # TODO Don't want these to become a black-hole.  Need UI to check for
    # authors who have taken the poisoned pills.  Also, these results don't seem
    # any less spammy than when the normal ignored tag rules are applied.
    # r = r.where.not(id: account.poisoned_posts)
  }
  
  scope :author, lambda { |author = nil, invert = true|
    if invert
      where(author: author)
    else
      where.not(author: author)
    end
  }
  
  scope :app, lambda { |app = nil, invert = true|
    if invert
      where("metadata->>'app' ILIKE ?", "#{app}/%")
    else
      where("metadata->>'app' NOT ILIKE ?", "#{app}/%")
    end
  }
  
  scope :order_by_prolific, lambda {|tag = nil, direction = :DESC|
    tag = [tag].flatten.reject(&:empty?).compact
    
    if tag.none?
      order("(SELECT DISTINCT count(author) FROM posts distinct_author_posts WHERE distinct_author_posts.author = posts.author) #{direction}, author #{direction}")
    else
      order("(SELECT DISTINCT count(author) FROM posts distinct_author_posts INNER JOIN tags ON tags.post_id = distinct_author_posts.id AND tags.tag IN ('#{tag.join(',')}') WHERE distinct_author_posts.author = posts.author) #{direction}, author #{direction}")
    end
  }
  
  def self.group_by_tag_count(direction = :desc)
    joins(:tags).group(:tag).order("count_all #{direction}").count(:all)
  end
  
  def to_param
    [id, author, permlink].join('/').parameterize
  end
  
  def thumbnail_url
    thumbnail_url = [metadata.fetch('image')].flatten[0] rescue nil
    
    thumbnail_url ||= if matches = body.match(IMAGE_URL_PATTERN)
      matches[1]
    end
    
    thumbnail_url ||= if matches = body.match(YOUTUBE_SHORT_URL_PATTERN)
      "https://img.youtube.com/vi/#{matches[2]}/0.jpg"
    end
    
    thumbnail_url ||= if matches = body.match(YOUTUBE_LONG_URL_PATTERN)
      "https://img.youtube.com/vi/#{matches[2]}/0.jpg"
    end
    
    thumbnail_url = URI.parse(thumbnail_url).to_s rescue nil
    thumbnail_url = nil unless thumbnail_url.present?
    
    thumbnail_url || 'data:image/gif;base64,R0lGODdhAQABAPAAAMPDwwAAACwAAAAAAQABAAACAkQBADs='
  end
  
  def canonical_url
    metadata.fetch('canonical_url', "https://hive.blog/#{category}/@#{author}/#{permlink}") rescue nil
  end
  
  def fetch_latest
    Post::with_simple_failover do
      comment_found = false
      
      Post::bridge.get_discussion(author: author, permlink: permlink) do |result|
        comment = result["#{author}/#{permlink}"]
        
        self.body = comment.body
        self.metadata = comment.json_metadata
        
        # Also ensure this really is an edit for this payout window.  Some
        # authors go back and edit their content. which will look like a whole
        # new post, if we're not careful.
        self.created_at = Time.parse(comment.created + 'Z')
        comment_found = true
      end
      
      # Fallback
      
      next if !!comment_found
      
      Post::database_api.list_comments(start: [author, permlink], limit: 1, order: 'by_permlink') do |result|
        if result.nil?
          Rails.logger.warn 'Invalid response from list_comments, retrying ...'
          
          sleep 3
          throw :fetch 
        end
        
        comments = result.comments
        
        if comments.any?
          comment = comments.first
          
          self.body = comment.body
          self.metadata = JSON[comment.json_metadata] rescue {}
          
          # Also ensure this really is an edit for this payout window.  Some
          # authors go back and edit their content. which will look like a whole
          # new post, if we're not careful.
          self.created_at = Time.parse(comment.created + 'Z')
        end
      end
    end
  end
  
  # Checks if this post is in the latest blog (with roughly the same timestamp).
  # Since we just need a way to just check the timestamp.  This old
  # condenser_api method is a good fit because we can request with a truncate
  # body of zero.
  def in_blog?(limit = 100)
    begin
      # This will quickly scan a bit of account history for the timestamp we're
      # looking for and return early.  But not all nodes run this, so we have a
      # fallback method.
      Post::account_history_api.get_account_history(account: author, start: -1, limit: limit) do |result|
        result.history.each do |idx, trx|
          op_type = trx.op.type
          
          next unless op_type == 'comment_operation'
          
          op_value = trx.op.value
          
          next unless op_value.author == author
          next unless op_value.permlink == permlink
          
          timestamp = Time.parse(trx.timestamp + 'Z')
          
          return (created_at - timestamp).abs < 60 # It's ok if we drift into the stuffle window.
        end
      end
      
      # Temporarily disable this fallback method call.  There seems to be a
      # problem with the hivemind index.
      return false
      
      Post::api.get_discussions_by_blog(tag: author, limit: [100, limit].min, truncate_body: 0) do |blog|
        blog.each do |comment|
          comment_created = Time.parse(comment.created + 'Z')
          
          if comment.author == author && comment.permlink == permlink
            return (created_at - comment_created).abs < 60 # It's ok if we drift into the stuffle window.
          end
        end
      end
    rescue => e
      Rails.logger.error "Unable to perform blog lookup for author: #{author} (#{e})"
    end
    
    false
  end
  
  def deleted?
    deleted_at.present?
  end
end
