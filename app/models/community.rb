class Community < ApplicationRecord
  has_many :posts, foreign_key: :category, primary_key: :name
  
  validates_presence_of :name
  validates_presence_of :title
  
  validates_uniqueness_of :name
  
  before_validation :refresh_community
  
  def refresh_community
    Rails.logger.info "Fetching community: #{name} ..."
    
    bridge = Hive::Bridge.new(url: 'http://anyx.io')
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
  end
end
