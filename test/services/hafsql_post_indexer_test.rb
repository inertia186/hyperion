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

    with_blacklist([]) do
      with_hafsql(connection) do
        HafsqlPostIndexer.new.perform
      end
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

    with_blacklist([]) do
      with_hafsql(connection) do
        HafsqlPostIndexer.new.perform
      end
    end

    post = Post.find_by!(author: 'alice', permlink: 'broken-metadata')
    assert_equal({}, post.metadata)
    assert_equal ['test'], post.tags.pluck(:tag)
  end

  test 'marks blacklisted authors from blacklist source' do
    connection = FakeHafsqlConnection.new([
      {
        'id' => 12,
        'author' => 'alice',
        'permlink' => 'blacklisted',
        'title' => 'Blacklisted',
        'body' => nil,
        'category' => 'test',
        'metadata' => {},
        'block_num' => 126,
        'trx_id' => 'blacklisted-trx',
        'created_at' => 1.hour.ago,
        'updated_at' => Time.current,
        'deleted_at' => nil
      }
    ])
    with_blacklist('alice' => [{'community' => 'hive-163399'}]) do
      with_hafsql(connection) do
        HafsqlPostIndexer.new.perform
      end
    end

    post = Post.find_by!(author: 'alice', permlink: 'blacklisted')
    assert post.blacklisted?
    assert_equal [{'community' => 'hive-163399'}], post.blacklist_reasons
  end

  test 'preserves existing blacklisted flags when blacklist source is empty' do
    Post.create!(
      author: 'alice',
      permlink: 'already-blacklisted',
      title: 'Already Blacklisted',
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 126,
      trx_id: 'existing-trx',
      blacklisted: true,
      blacklist_reasons: [{'community' => 'hive-163399'}],
      created_at: Time.current
    )
    connection = FakeHafsqlConnection.new([
      {
        'id' => 13,
        'author' => 'alice',
        'permlink' => 'already-blacklisted',
        'title' => 'Already Blacklisted Updated',
        'body' => nil,
        'category' => 'test',
        'metadata' => {},
        'block_num' => 127,
        'trx_id' => 'updated-trx',
        'created_at' => 1.hour.ago,
        'updated_at' => Time.current,
        'deleted_at' => nil
      }
    ])
    with_blacklist([]) do
      with_hafsql(connection) do
        HafsqlPostIndexer.new.perform
      end
    end

    post = Post.find_by!(author: 'alice', permlink: 'already-blacklisted')
    assert post.blacklisted?
    assert_equal [{'community' => 'hive-163399'}], post.blacklist_reasons
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

  def with_blacklist(reasons_by_account, &block)
    source = FakeBlacklistSource.new(reasons_by_account)

    PostIndexJob.stub(:new, source, &block)
  end

  class FakeBlacklistSource
    def initialize(reasons_by_account)
      @reasons_by_account = reasons_by_account.is_a?(Hash) ? reasons_by_account : reasons_by_account.index_with { [] }
    end

    def blacklist
      @reasons_by_account.keys
    end

    def blacklist_reasons_for(author)
      @reasons_by_account[author.to_s.downcase] || []
    end
  end
end
