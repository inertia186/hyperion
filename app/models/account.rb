class Account < ApplicationRecord
  extend Immutable
  extend Memoist

  ENABLED_BLACKLIST_SOURCES_SETTING = 'enabled_blacklist_sources'
  THEME_SETTING = 'theme'
  THEMES = %w(light dark system).freeze
  
  has_many :read_posts, dependent: :destroy, counter_cache: :read_posts_count
  has_many :account_tags, dependent: :destroy, counter_cache: :account_tags_count
  has_many :past_tags, -> { past }, class_name: 'AccountTag::Past'
  has_many :ignored_tags, -> { ignored }, class_name: 'AccountTag::Ignored'
  has_many :poisoned_pill_tags, -> { poisoned_pill }, class_name: 'AccountTag::PoisonedPill'
  has_many :favorite_tags, -> { favorite }, class_name: 'AccountTag::Favorite'
  
  validates_presence_of :name
  
  validates_uniqueness_of :name
  
  def self.public_keys(names, role = nil)
    names = [names].flatten
    public_keys = []
    
    with_simple_failover do
      database_api.find_accounts(accounts: names) do |result|
        result.accounts.each do |account|
          if role.nil? || role == :owner
            public_keys += account.owner.key_auths.map{|k| k[0]}
          end
          
          if role.nil? || role == :active
            public_keys += account.active.key_auths.map{|k| k[0]}
          end
          
          if role.nil? || role == :posting
            public_keys += account.posting.key_auths.map{|k| k[0]}
          end
          
          if role.nil? || role == :memo
            public_keys << account.memo_key
          end
        end
      end
    end
    
    public_keys
  end
  
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

  def enabled_blacklist_sources
    normalize_blacklist_sources((settings || {})[ENABLED_BLACKLIST_SOURCES_SETTING])
  end

  def update_enabled_blacklist_sources!(sources)
    update!(settings: (settings || {}).merge(ENABLED_BLACKLIST_SOURCES_SETTING => normalize_blacklist_sources(sources)))
  end

  def theme
    normalize_theme((settings || {})[THEME_SETTING])
  end

  def update_theme!(theme)
    update!(settings: (settings || {}).merge(THEME_SETTING => normalize_theme(theme)))
  end

  def blacklist_source_catalog
    enabled = enabled_blacklist_sources

    self.class.blacklist_source_catalog.map do |source|
      source.merge(enabled: enabled.include?(source[:community]))
    end
  end

  def self.blacklist_source_catalog
    Community.ensure_present!(PostIndexJob::TRUSTED_COMMUNITIES)
    communities = Community.where(name: PostIndexJob::TRUSTED_COMMUNITIES).pluck(:name, :title).to_h

    PostIndexJob::TRUSTED_COMMUNITIES.map do |community|
      {community: community, name: communities[community] || community}
    end
  end
  
  def poisoned_posts(poisoned_posts = true)
    if poisoned_posts
      Post.where(id: Tag.where(tag: poisoned_pill_tags.select(:tag)).select(:post_id))
    else
      Post.where.not(id: Tag.where(tag: poisoned_pill_tags.select(:tag)).select(:post_id))
    end
  end

  def poisoned_authors
    Post.active.
      where(id: Tag.where(tag: poisoned_pill_tags.select(:tag)).select(:post_id)).
      distinct.
      select(:author)
  end
  
  # TODO make this into "refresh_follows" and track both 'ignore' and 'blog'
  # which also requires a new DB field called 'followed_authors'
  def refresh_muted_authors
    self.muted_authors = []
    count = -1
    
    Account::with_simple_failover do
      until count == muted_authors.size
        count = muted_authors.size
        # Public Hive nodes commonly keep this legacy follow method available
        # through condenser_api, even when they do not expose follow_api.
        response = Account::api.rpc_client.rpc_execute(:condenser_api, :get_following, [name, muted_authors.last || '', 'ignore', 1000])
        raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

        self.muted_authors += response.result.map(&:following)
        self.muted_authors = muted_authors.uniq
        
        sleep 0.1
      end
    end
    
    save!
    
    return muted_authors
  end

private
  def normalize_blacklist_sources(sources)
    Array(sources).map(&:to_s).select { |source| PostIndexJob::TRUSTED_COMMUNITIES.include?(source) }.uniq
  end

  def normalize_theme(theme)
    THEMES.include?(theme.to_s) ? theme.to_s : 'system'
  end
end
