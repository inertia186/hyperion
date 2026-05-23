class HafsqlRecord < ActiveRecord::Base
  self.abstract_class = true

  class MissingConfiguration < StandardError; end

  def self.configured?
    true
  end

  def self.connection_config
    if ENV['HAFSQL_DATABASE_URL'].present?
      ENV['HAFSQL_DATABASE_URL']
    else
      {
        adapter: 'postgresql',
        host: ENV.fetch('HAFSQL_HOST', 'hafsql-sql.mahdiyari.info'),
        port: ENV.fetch('HAFSQL_PORT', 5432),
        database: ENV.fetch('HAFSQL_DATABASE', 'haf_block_log'),
        username: ENV.fetch('HAFSQL_USERNAME', 'hafsql_public'),
        password: ENV.fetch('HAFSQL_PASSWORD', 'hafsql_public'),
        pool: ENV.fetch('HAFSQL_POOL', ENV.fetch('RAILS_MAX_THREADS', 5)),
        timeout: ENV.fetch('HAFSQL_TIMEOUT', 5000)
      }
    end
  end

  def self.connection
    unless @hafsql_connection_established
      establish_connection connection_config
      @hafsql_connection_established = true
    end

    super
  end
end
