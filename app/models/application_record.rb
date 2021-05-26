class ApplicationRecord < ActiveRecord::Base
  self.abstract_class = true
  
  DEFAULT_NODE_URLS = (ENV['HYPERION_NODE_URLS'] || 'https://api.openhive.network,https://rpc.ecency.com,https://hive-api.arcange.eu').split(',')
end
