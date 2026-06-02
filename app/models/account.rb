class Account < ApplicationRecord
  extend Immutable
  extend Memoist

  THEME_SETTING = 'theme'
  THEMES = %w(light dark system).freeze
  MINIMUM_REPUTATION_SETTING = 'minimum_reputation'
  DEFAULT_MINIMUM_REPUTATION = HiveReputation::DEFAULT_REPUTATION
  MINIMUM_REPUTATION_RANGE = (-100..100)
  HIVEWATCHERS_BLACKLIST_SETTING = 'hivewatchers_blacklist_enabled'
  
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

  def theme
    normalize_theme((settings || {})[THEME_SETTING])
  end

  def update_theme!(theme)
    update!(settings: (settings || {}).merge(THEME_SETTING => normalize_theme(theme)))
  end

  def minimum_reputation
    normalize_minimum_reputation((settings || {})[MINIMUM_REPUTATION_SETTING])
  end

  def update_minimum_reputation!(minimum_reputation)
    update!(settings: (settings || {}).merge(MINIMUM_REPUTATION_SETTING => normalize_minimum_reputation(minimum_reputation)))
  end

  def hivewatchers_blacklist_enabled?
    truthy_setting?((settings || {})[HIVEWATCHERS_BLACKLIST_SETTING])
  end

  def update_hivewatchers_blacklist_enabled!(enabled)
    update!(settings: (settings || {}).merge(HIVEWATCHERS_BLACKLIST_SETTING => truthy_setting?(enabled)))
  end

  def blacklist_sources
    sources = [name] + followed_blacklist_accounts
    sources << 'hivewatchers' if hivewatchers_blacklist_enabled?
    sources.map(&:to_s).map(&:downcase).reject(&:blank?).uniq
  end

  def blacklist_source_catalog
    ([name] + followed_blacklist_accounts).map(&:to_s).map(&:downcase).reject(&:blank?).uniq.map do |source|
      {account: source, name: source}
    end
  end

  def offchain_blacklist_source_catalog
    [
      {
        account: 'hivewatchers',
        name: 'Hivewatchers',
        enabled: hivewatchers_blacklist_enabled?,
        description: 'Powered by the Spaminator active blacklist.'
      }
    ]
  end

  def followed_blacklist_accounts
    fetch_bridge_follow_list_accounts('follow_blacklist')
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
    self.muted_authors = fetch_following_accounts('ignore')

    save!

    return muted_authors
  end

private
  def fetch_following_accounts(type)
    accounts = []
    count = -1

    Account::with_simple_failover do
      until count == accounts.size
        count = accounts.size
        # Public Hive nodes commonly keep this legacy follow method available
        # through condenser_api, even when they do not expose follow_api.
        response = Account::api.rpc_client.rpc_execute(:condenser_api, :get_following, [name, accounts.last || '', type, 1000])
        raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

        accounts += response.result.map { |follow| follow.following.to_s.downcase }
        accounts = accounts.reject(&:blank?).uniq

        sleep 0.1
      end
    end

    accounts
  end

  def fetch_bridge_follow_list_accounts(type)
    response = Account::api.rpc_client.rpc_execute(:bridge, :get_follow_list, {observer: name, follow_type: type})
    raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

    Array(response.result).map { |follow| follow.respond_to?(:name) ? follow.name : follow['name'] || follow[:name] }.
      map(&:to_s).
      map(&:downcase).
      reject(&:blank?).
      uniq
  rescue => e
    Rails.logger.warn "Unable to refresh #{type} follow list for #{name}: #{e.class}: #{e.message}"
    []
  end

  def normalize_theme(theme)
    THEMES.include?(theme.to_s) ? theme.to_s : 'system'
  end

  def normalize_minimum_reputation(minimum_reputation)
    value = Integer(minimum_reputation)
    value.clamp(MINIMUM_REPUTATION_RANGE.min, MINIMUM_REPUTATION_RANGE.max)
  rescue ArgumentError, TypeError
    DEFAULT_MINIMUM_REPUTATION
  end

  def truthy_setting?(value)
    value == true || value.to_s == 'true' || value.to_s == '1'
  end

  memoize :followed_blacklist_accounts
end
