require 'test_helper'

class HafsqlTestHelperTest < ActiveSupport::TestCase
  test 'HafSQL connection scopes preserve availability and system test isolation' do
    connection = Object.new

    assert HafsqlRecord.configured?
    with_hafsql(connection) do
      assert_same connection, HafsqlRecord.connection
      assert HafsqlRecord.configured?
    end

    assert HafsqlRecord.configured?
    FakeHive.disable_hafsql_and_hafbe
    refute HafsqlRecord.configured?
  end
end
