require 'test_helper'

class HafsqlPostIndexerTest < ActiveSupport::TestCase
  test 'indexes root post rows from HafSQL' do
    connection = FakeHafsqlConnection.new([
      {
        'id' => 10,
        'author' => 'alice',
        'permlink' => 'hello',
        'title' => 'Hello',
        'body' => nil,
        'category' => 'hive-12345',
        'metadata' => {'tags' => ['Hive-12345', 'ruby', 'ruby']},
        'block_num' => 123,
        'trx_id' => 'abc',
        'created_at' => 1.hour.ago,
        'updated_at' => Time.current,
        'deleted_at' => nil
      }
    ])

    with_hafsql(connection) do
      HafsqlPostIndexer.new.perform
    end

    post = Post.find_by!(author: 'alice', permlink: 'hello')
    assert_equal 'Hello', post.title
    assert_nil post.body
    assert_equal 'hive-12345', post.category
    assert_equal 123, post.block_num
    assert_equal 'abc', post.trx_id
    assert_equal %w(hive-12345 ruby), post.tags.order(:tag).pluck(:tag)
    assert post.tags.find_by!(tag: 'hive-12345').category?
  end

  test 'malformed metadata indexes as empty metadata' do
    connection = FakeHafsqlConnection.new([
      {
        'id' => 11,
        'author' => 'alice',
        'permlink' => 'broken-metadata',
        'title' => 'Broken',
        'body' => nil,
        'category' => 'test',
        'metadata' => '{',
        'block_num' => 124,
        'trx_id' => 'def',
        'created_at' => 1.hour.ago,
        'updated_at' => Time.current,
        'deleted_at' => nil
      }
    ])

    with_hafsql(connection) do
      HafsqlPostIndexer.new.perform
    end

    post = Post.find_by!(author: 'alice', permlink: 'broken-metadata')
    assert_equal({}, post.metadata)
    assert_equal ['test'], post.tags.pluck(:tag)
  end

  test 'fetches and stores body lazily' do
    post = Post.create!(
      author: 'alice',
      permlink: 'lazy-body',
      title: 'Lazy',
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 125,
      trx_id: 'ghi',
      created_at: Time.current
    )
    connection = FakeHafsqlConnection.new([], body: 'Loaded body')

    with_hafsql(connection) do
      assert_equal 'Loaded body', post.load_body!
    end

    assert_equal 'Loaded body', post.reload.body
  end

private
  class FakeHafsqlConnection
    def initialize(rows, body: nil)
      @rows = rows
      @body = body
    end

    def exec_query(sql, name = nil, _binds = [])
      return [] if sql.include?('LIMIT 0')
      return [{'body' => @body}] if name == 'HafSQL body fetch'

      @rows
    end

    def quote_table_name(name)
      %("#{name}")
    end

    def quote_column_name(name)
      %("#{name}")
    end
  end
end
