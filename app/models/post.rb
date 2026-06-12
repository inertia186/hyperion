class Post < ApplicationRecord
  extend Immutable
  
  DIFF_MATCH_PATCH_PATTERN = /@@ -[0-9]+(?:,[0-9]+)? \+[0-9]+(?:,[0-9]+)? @@/
  IMAGE_URL_PATTERN = /(http(s?):\/\/.*\.(jpeg|jpg|gif|png))/
  YOUTUBE_SHORT_URL_PATTERN = /http(s?):\/\/youtu.be\/(.*)/
  YOUTUBE_LONG_URL_PATTERN = /http(s?):\/\/.*youtube.com\/.*?.*v=(.*)(&?).*/
  PLACEHOLDER_IMAGE_URL = 'data:image/gif;base64,R0lGODdhAQABAPAAAMPDwwAAACwAAAAAAQABAAACAkQBADs='
  DISPLAY_BODY_UNSET = PostDisplayBody::DISPLAY_BODY_UNSET
  LIST_COLUMNS = %i(
    id author permlink title category metadata block_num trx_id deleted_at
    blacklisted blacklist_reasons author_reputation tags_count payout payout_amount
    payout_currency payout_fetched_at payout_unavailable_at payout_source net_rshares
    created_at updated_at
  )
  
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
      r = r.where(id: Tag.where(tag: t).select(:post_id))
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
    
    r
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

  scope :order_by_tag_count, lambda { |direction = :desc|
    direction = direction.to_s.downcase == 'asc' ? :asc : :desc

    order(tags_count: direction)
  }
  
  scope :order_by_prolific, lambda {|tag = nil, direction = :desc|
    tag = [tag].flatten.compact.reject(&:empty?)
    direction = direction.to_s.downcase == 'asc' ? 'ASC' : 'DESC'
    
    prolific_order = if tag.none?
      sanitize_sql_array(["(SELECT count(*) FROM posts distinct_author_posts WHERE distinct_author_posts.author = posts.author) #{direction}, posts.author #{direction}"])
    else
      sanitize_sql_array(["(SELECT count(*) FROM posts distinct_author_posts INNER JOIN tags ON tags.post_id = distinct_author_posts.id WHERE distinct_author_posts.author = posts.author AND tags.tag IN (?)) #{direction}, posts.author #{direction}", tag])
    end

    order(Arel.sql(prolific_order))
  }

  scope :order_by_payout, lambda { |direction = :desc|
    direction = direction.to_s.downcase == 'asc' ? 'ASC' : 'DESC'

    order(Arel.sql("payout_amount #{direction} NULLS LAST, posts.created_at DESC"))
  }
  
  def self.group_by_tag_count(direction = :desc)
    joins(:tags).group(:tag).order("count_all #{direction}").count(:all)
  end
  
  def to_param
    [id, author, permlink].join('/').parameterize
  end

  def capture_payout!(payout_value, fetched_at: Time.current, source: 'exact')
    amount, currency = self.class.parse_payout(payout_value)

    update!(
      payout: payout_value.presence,
      payout_amount: amount,
      payout_currency: currency,
      payout_fetched_at: fetched_at,
      payout_unavailable_at: nil,
      payout_source: source
    )
  end

  def mark_payout_unavailable!(unavailable_at: Time.current)
    update!(payout_unavailable_at: unavailable_at, payout_source: nil)
  end

  def self.parse_payout(payout_value)
    match = payout_value.to_s.strip.match(/\A(?<amount>-?\d+(?:\.\d+)?)\s+(?<currency>[A-Z]{2,10})\z/)
    return [nil, nil] unless match

    [BigDecimal(match[:amount]), match[:currency]]
  end

  def display_body(body_override = DISPLAY_BODY_UNSET)
    display_body_service.display_body(body_override)
  end

  def display_post(body_override = DISPLAY_BODY_UNSET)
    display_body_service.display_post(body_override)
  end

  def cross_post_reference(body_override = DISPLAY_BODY_UNSET)
    display_body_service.cross_post_reference(body_override)
  end

  def cross_post_copied_body(body_override = DISPLAY_BODY_UNSET)
    display_body_service.cross_post_copied_body(body_override)
  end
  
  def post_image_url(body_override = DISPLAY_BODY_UNSET)
    thumbnail_url = [metadata.fetch('image')].flatten[0] rescue nil
    post_body = display_body(body_override)
    
    thumbnail_url ||= if matches = post_body.match(IMAGE_URL_PATTERN)
      matches[1]
    end
    
    thumbnail_url ||= if matches = post_body.match(YOUTUBE_SHORT_URL_PATTERN)
      "https://img.youtube.com/vi/#{matches[2]}/0.jpg"
    end
    
    thumbnail_url ||= if matches = post_body.match(YOUTUBE_LONG_URL_PATTERN)
      "https://img.youtube.com/vi/#{matches[2]}/0.jpg"
    end
    
    thumbnail_url = URI.parse(thumbnail_url).to_s rescue nil
    thumbnail_url = nil unless thumbnail_url.present?
    
    thumbnail_url
  end

  def thumbnail_url(body_override = DISPLAY_BODY_UNSET)
    post_image_url(body_override) || PLACEHOLDER_IMAGE_URL
  end

  def placeholder_image_url
    PLACEHOLDER_IMAGE_URL
  end

  def author_avatar_url
    "https://images.hive.blog/u/#{author}/avatar"
  end
  
  def canonical_url
    metadata.fetch('canonical_url', "https://hive.blog/#{category}/@#{author}/#{permlink}") rescue nil
  end
  
  def app
    ((metadata.fetch('app', nil) rescue nil) || 'unknown').split('/')[0]
  end

  def cross_post?
    metadata_tags = [metadata.fetch('tags')].flatten.map(&:to_s).map(&:downcase) rescue []
    return true if metadata_tags.include?('cross-post')

    tags.loaded? ? tags.any? { |tag| tag.tag == 'cross-post' } : tags.where(tag: 'cross-post').exists?
  end

  def display_body_service
    PostDisplayBody.new(self)
  end
  
  def fetch_latest
    Post::with_simple_failover do
      comment_found = false
      
      begin
        Post::bridge.get_discussion(author: author, permlink: permlink) do |result|
          comment = result["#{author}/#{permlink}"]
          
          # Post might be deleted or not indexed yet.
          return if comment.nil?
          
          self.body = comment.body
          self.metadata = comment.json_metadata
          
          # Also ensure this really is an edit for this payout window.  Some
          # authors go back and edit their content. which will look like a whole
          # new post, if we're not careful.
          self.created_at = Time.parse(comment.created + 'Z')
          comment_found = true
        end
      rescue Hive::ArgumentError => e
        # Post might be deleted.
        
        return
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

  def load_body!
    return body if body.present?

    self.body = HafsqlPostIndexer.new.fetch_body(author, permlink) if HafsqlRecord.configured?

    if body.blank?
      fetch_latest
    end

    save! if changed?
    body
  end

  def refresh_latest_revision!(revisions_service: HafbePostRevisions.new)
    load_body!

    revision = revisions_service.revisions_for(self).last
    unless revision
      fetch_latest_revision_fallback if body.blank? || body.to_s.match?(DIFF_MATCH_PATCH_PATTERN)
      save! if changed?
      return body
    end

    if body.to_s.match?(DIFF_MATCH_PATCH_PATTERN) && revision[:block_num].present? && block_num.to_i > revision[:block_num].to_i
      fetch_latest_revision_fallback
      save! if changed?
      return body
    end

    self.body = revision[:body].to_s if revision[:body].to_s.present? && body.to_s != revision[:body].to_s
    self.title = revision[:title].to_s if revision[:title].to_s.present? && title.to_s != revision[:title].to_s
    self.metadata = revision[:json_metadata] if revision[:json_metadata_present] && metadata != revision[:json_metadata]
    self.category = revision[:parent_permlink].to_s if revision[:parent_permlink].to_s.present? && category.to_s != revision[:parent_permlink].to_s
    self.block_num = revision[:block_num].to_i if revision[:block_num].present? && block_num.to_i != revision[:block_num].to_i
    self.trx_id = revision[:trx_id].to_s if revision[:trx_id].to_s.present? && trx_id.to_s != revision[:trx_id].to_s
    self.updated_at = revision[:published_at_time] if revision[:published_at_time] && updated_at != revision[:published_at_time]

    save! if changed?
    body
  rescue HafbePostRevisions::MissingBaseUrl, HafbePostRevisions::FetchError => e
    Rails.logger.debug "Unable to refresh latest revision for #{author}/#{permlink}: #{e.class}: #{e.message}"
    fetch_latest_revision_fallback if body.blank? || body.to_s.match?(DIFF_MATCH_PATCH_PATTERN)
    save! if changed?
    body
  end

  def fetch_latest_revision_fallback
    fetch_latest
  rescue => e
    Rails.logger.debug "Unable to fetch latest post fallback for #{author}/#{permlink}: #{e.class}: #{e.message}"
  end
  
  # Checks if this post is in the latest blog with roughly the same timestamp.
  def in_blog?(limit = 100)
    begin
      Post::bridge.get_account_posts(sort: 'blog', account: author, limit: [20, limit].min) do |blog|
        blog.each do |post|
          next unless post.author == author
          next unless post.permlink == permlink

          timestamp = Time.parse(post.created + 'Z')

          return (created_at - timestamp).abs < 60 # It's ok if we drift into the shuffle window.
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
