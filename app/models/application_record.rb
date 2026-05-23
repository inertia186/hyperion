class ApplicationRecord < ActiveRecord::Base
  self.abstract_class = true
  
  DEFAULT_NODE_URLS = (ENV['HYPERION_NODE_URLS'] || 'https://api.hive.blog').split(',')
end
