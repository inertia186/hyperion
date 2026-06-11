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
        'deleted_at' => nil,
        'net_rshares' => 12_345_678
      }
    ])

    with_blacklist([], reputations: {'alice' => 42}) do
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
    assert_equal BigDecimal('12345678'), post.net_rshares
    assert_equal 42, post.author_reputation
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
    with_blacklist('alice' => [{'account' => 'fixture-curator'}]) do
      with_hafsql(connection) do
        HafsqlPostIndexer.new.perform
      end
    end

    post = Post.find_by!(author: 'alice', permlink: 'blacklisted')
    assert post.blacklisted?
    assert_equal [{'account' => 'fixture-curator'}], post.blacklist_reasons
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
      blacklist_reasons: [{'account' => 'fixture-curator'}],
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
    assert_equal [{'account' => 'fixture-curator'}], post.blacklist_reasons
  end

  test 'reuses stored reputation when indexing known authors' do
    Post.create!(
      author: 'alice',
      permlink: 'known-reputation',
      title: 'Known Reputation',
      body: nil,
      category: 'test',
      metadata: {},
      block_num: 126,
      trx_id: 'known-reputation-trx',
      author_reputation: 66,
      created_at: Time.current
    )
    connection = FakeHafsqlConnection.new([
      {
        'id' => 14,
        'author' => 'alice',
        'permlink' => 'known-reputation-update',
        'title' => 'Known Reputation Update',
        'body' => nil,
        'category' => 'test',
        'metadata' => {},
        'block_num' => 128,
        'trx_id' => 'known-reputation-update-trx',
        'created_at' => 1.hour.ago,
        'updated_at' => Time.current,
        'deleted_at' => nil
      }
    ])

    with_blacklist([], reputations: {'alice' => 99}) do
      with_hafsql(connection) do
        HafsqlPostIndexer.new.perform
      end
    end

    post = Post.find_by!(author: 'alice', permlink: 'known-reputation-update')
    assert_equal 66, post.author_reputation
  end

  test 'sweep refreshes old rows without regressing incremental cursor' do
    original_cursor = 1.day.ago.change(usec: 0)
    new_cursor = Time.current.change(usec: 0)
    sweep_time = 6.days.ago.change(usec: 0)
    IndexerState.fetch!(HafsqlPostIndexer::STATE_NAME).update!(
      last_id: 20,
      last_indexed_at: original_cursor,
      last_sweep_at: 2.hours.ago
    )
    connection = CursorAwareHafsqlConnection.new(
      incremental_rows: [
        {
          'id' => 30,
          'author' => 'alice',
          'permlink' => 'incremental',
          'title' => 'Incremental',
          'body' => nil,
          'category' => 'test',
          'metadata' => {},
          'block_num' => 130,
          'trx_id' => 'incremental-trx',
          'created_at' => new_cursor,
          'updated_at' => new_cursor,
          'deleted_at' => nil
        }
      ],
      sweep_rows: [
        {
          'id' => 10,
          'author' => 'alice',
          'permlink' => 'sweep',
          'title' => 'Sweep',
          'body' => nil,
          'category' => 'test',
          'metadata' => {},
          'block_num' => 120,
          'trx_id' => 'sweep-trx',
          'created_at' => sweep_time,
          'updated_at' => sweep_time,
          'deleted_at' => nil
        }
      ]
    )

    with_blacklist([]) do
      with_hafsql(connection) do
        HafsqlPostIndexer.new.perform
      end
    end

    state = IndexerState.find_by!(name: HafsqlPostIndexer::STATE_NAME)
    assert_equal new_cursor, state.last_indexed_at
    assert_equal 30, state.last_id
    assert Post.exists?(author: 'alice', permlink: 'incremental')
    assert Post.exists?(author: 'alice', permlink: 'sweep')
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

  class CursorAwareHafsqlConnection < FakeHafsqlConnection
    def initialize(incremental_rows:, sweep_rows:)
      super([])
      @incremental_rows = incremental_rows
      @sweep_rows = sweep_rows
    end

    def exec_query(sql, name = nil, binds = [])
      return [] if sql.include?('LIMIT 0')
      return super unless name == 'HafSQL post index'

      bind_names = binds.map(&:name)
      bind_names.include?('last_indexed_at') ? @incremental_rows : @sweep_rows
    end
  end

  def with_blacklist(reasons_by_account = nil, **options, &block)
    reputations = options.delete(:reputations) || {}
    reasons_by_account ||= options
    source = FakeBlacklistSource.new(reasons_by_account)
    reputation_scores = ->(authors, **) {
      Array(authors).map(&:to_s).map(&:downcase).reject(&:blank?).uniq.index_with do |author|
        reputations.fetch(author, HiveReputation::DEFAULT_REPUTATION)
      end
    }

    HiveReputation.stub(:scores_for, reputation_scores) do
      PostIndexJob.stub(:new, source, &block)
    end
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
