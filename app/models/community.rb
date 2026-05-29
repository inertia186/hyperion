class Community < ApplicationRecord
  extend Immutable

  has_many :posts, foreign_key: :category, primary_key: :name
  
  validates_presence_of :name
  validates_presence_of :title
  
  validates_uniqueness_of :name
  
  before_validation :refresh_community
  
  def refresh_community
    Rails.logger.info "Fetching community: #{name} ..."
    
    bridge = Hive::Bridge.new(url: DEFAULT_NODE_URLS.sample)
    community = bridge.get_community(name: name).result rescue nil
    
    if !!community
      %w(about avatar_url description flag_text is_nsfw lang name num_authors
        num_pending subscribers sum_pending title type_id).each do |key|
        self[key] = community[key]
      end
      
      self.context = community.contest || {}
      self.created_at = Time.parse(community.created_at + 'Z')
      self.settings = community.settings || {}
      self.team = community.team || []
    end

    self.community_account = fetch_community_account || community_account
  end

  def profile_image_url
    self.class.profile_image_from_account(community_account)
  end

  def self.ensure_present!(names)
    Array(names).map(&:presence).compact.uniq.each do |name|
      next if exists?(name: name)

      create!(name: name)
    rescue => e
      Rails.logger.warn "Unable to seed community #{name}: #{e.class}: #{e.message}"
    end
  end

  def self.profile_image_from_account(account)
    account = parse_json_metadata_value(account)
    metadata_values = [
      account['json_metadata'],
      account['posting_json_metadata'],
      account['profile']
    ]

    metadata_values.each do |value|
      metadata = parse_json_metadata_value(value)
      profile = parse_json_metadata_value(metadata['profile'])
      image_url = profile['profile_image'].presence || metadata['profile_image'].presence
      return image_url if image_url
    end

    account['profile_image'].presence || account['avatar_url'].presence
  end

private
  def fetch_community_account
    account = nil

    self.class.with_simple_failover do
      self.class.database_api.find_accounts(accounts: [name]) do |result|
        account = result.accounts.first
      end
    end

    normalize_account(account)
  rescue StandardError => e
    Rails.logger.warn "Unable to fetch community account #{name}: #{e.class}: #{e.message}"
    nil
  end

  def normalize_account(account)
    payload = if account.respond_to?(:to_h)
      account.to_h
    elsif account.respond_to?(:as_json)
      account.as_json
    else
      account
    end

    payload = JSON.parse(payload.to_json)
    payload['json_metadata'] = parse_json_metadata(payload['json_metadata'])
    payload['posting_json_metadata'] = parse_json_metadata(payload['posting_json_metadata'])
    payload
  rescue StandardError
    {}
  end

  def parse_json_metadata(value)
    self.class.parse_json_metadata_value(value)
  end

  def self.parse_json_metadata_value(value)
    return value if value.is_a?(Hash)
    return {} if value.blank?

    JSON.parse(value)
  rescue JSON::ParserError, TypeError
    {}
  end
end
