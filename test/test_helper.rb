ENV['RAILS_ENV'] ||= 'test'
require_relative 'coverage' if ENV['COVERAGE'] == '1'
require_relative '../config/environment'
Rails.application.eager_load! if ENV['COVERAGE'] == '1'
require 'rails/test_help'
require 'minitest/mock'
require_relative 'support/fake_hive'

class ActiveSupport::TestCase
  # Run tests in parallel with specified workers
  parallelize(workers: :number_of_processors)

  # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
  fixtures :all

  setup do
    FakeHive.start
  end

  teardown do
    assert_empty FakeHive.stop, 'Hive calls the fake node did not answer'
  end

  # Add more helper methods to be used by all tests here...
  def with_env(values)
    old_values = values.keys.index_with { |key| ENV[key] }
    values.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }

    yield
  ensure
    old_values.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  def with_hafsql(connection)
    with_env(
      'HAFSQL_DATABASE_URL' => 'postgres://hafsql.example/hafsql',
      'HAFSQL_COMMENTS_RELATION' => 'hafsql.comments'
    ) do
      HafsqlRecord.stub(:configured?, true) do
        HafsqlRecord.stub(:connection, connection) do
          yield
        end
      end
    end
  end
end
