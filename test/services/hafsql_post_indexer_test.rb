require 'test_helper'

class HafsqlPostIndexerTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    IndexerState.where(name: HafsqlPostIndexer::STATE_NAME).delete_all
  end

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

  test 'tag replacement preserves retained identities and updates categories counters and community jobs' do
    post = Post.create!(author: 'tag-author', permlink: 'tag-edit', title: 'Original',
      body: 'Cached body', category: 'index-first', metadata: {}, block_num: 1, trx_id: 'tag-edit', created_at: 1.hour.ago)
    original_category = post.tags.create!(tag: 'index-first', category: true)
    retained = post.tags.create!(tag: 'index-keep', category: false)
    removed = post.tags.create!(tag: 'index-remove', category: false)
    counts = TagCount.where(tag: %w(index-first index-keep)).pluck(:tag, :posts_count).to_h
    connection = FakeHafsqlConnection.new([{
      'id' => 50, 'author' => post.author, 'permlink' => post.permlink, 'title' => 'Edited',
      'category' => 'hive-12345', 'metadata' => {'tags' => ['index-first', 'INDEX-KEEP', 'index-keep', 'index-fresh', '', 'x' * 33]},
      'created_at' => post.created_at, 'updated_at' => Time.current
    }])

    assert_enqueued_with(job: CommunityRefreshJob, args: ['hive-12345']) do
      with_blacklist([]) do
        with_hafsql(connection) { HafsqlPostIndexer.new.perform }
      end
    end

    assert_equal 'Cached body', post.reload.body
    assert_equal %w(hive-12345 index-first index-fresh index-keep), post.tags.order(:tag).pluck(:tag)
    assert_equal retained.id, post.tags.find_by!(tag: 'index-keep').id
    assert_equal original_category.id, post.tags.find_by!(tag: 'index-first').id
    assert_not original_category.reload.category?
    assert post.tags.find_by!(tag: 'hive-12345').category?
    assert_not Tag.exists?(removed.id)
    assert_equal counts, TagCount.where(tag: counts.keys).pluck(:tag, :posts_count).to_h
    assert_equal 0, TagCount.find_by!(tag: 'index-remove').posts_count
    assert_equal 1, TagCount.find_by!(tag: 'index-fresh').posts_count
    assert_equal 1, TagCount.find_by!(tag: 'hive-12345').posts_count
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

  test 'indexes every page when update timestamps are equal' do
    freeze_time do
      with_source_rows([4_000_000_000, 3, 8, 1, 6].map { |id| [id, 1.hour.ago] }) do
        HafsqlPostIndexer.new.perform

        assert_equal [1, 3, 6, 8, 4_000_000_000], indexed_source_ids
        state = IndexerState.find_by!(name: HafsqlPostIndexer::STATE_NAME)
        assert_equal 1.hour.ago, state.last_indexed_at
        assert_equal 4_000_000_000, state.last_id
      end
    end
  end

  test 'incremental overlap spans pages and retains edits behind the checkpoint' do
    freeze_time do
      cursor = 1.hour.ago
      IndexerState.fetch!(HafsqlPostIndexer::STATE_NAME).update!(last_indexed_at: cursor, last_sweep_at: Time.current)
      with_source_rows([[20, cursor - 2.minutes], [30, cursor - 1.minute], [10, cursor + 1.minute]]) do
        HafsqlPostIndexer.new.perform

        assert_equal [10, 20, 30], indexed_source_ids
        assert_equal cursor + 1.minute, IndexerState.find_by!(name: HafsqlPostIndexer::STATE_NAME).last_indexed_at
      end
    end
  end

  test 'sweep covers every page and retains the newer incremental checkpoint' do
    freeze_time do
      cursor = 1.hour.ago
      IndexerState.fetch!(HafsqlPostIndexer::STATE_NAME).update!(last_id: 99, last_indexed_at: cursor, last_sweep_at: 2.hours.ago)
      with_source_rows((1..5).map { |id| [id, 2.days.ago + id.seconds] }) do
        HafsqlPostIndexer.new.perform

        assert_equal [1, 2, 3, 4, 5], indexed_source_ids
        state = IndexerState.find_by!(name: HafsqlPostIndexer::STATE_NAME)
        assert_equal cursor, state.last_indexed_at
        assert_equal 99, state.last_id
        assert_equal Time.current, state.last_sweep_at
      end
    end
  end

  test 'failed later page rolls back that page and leaves the pass retryable' do
    freeze_time do
      cursor = 1.hour.ago
      sweep_time = 2.hours.ago
      state = IndexerState.fetch!(HafsqlPostIndexer::STATE_NAME)
      state.update!(last_id: 99, last_indexed_at: cursor, last_sweep_at: sweep_time)
      with_source_rows((1..5).map { |id| [id, 2.days.ago + id.seconds] }) do
        indexer = HafsqlPostIndexer.new
        indexer.define_singleton_method(:upsert_post) do |row, reputations|
          super(row, reputations)
          raise 'interrupted second page' if row.id == 4
        end

        assert_raises(RuntimeError) { indexer.perform }
        assert_equal [1, 2], indexed_source_ids
        assert_equal 2, TagCount.find_by!(tag: 'pagination').posts_count
        assert_equal [99, cursor, sweep_time], state.reload.attributes.values_at('last_id', 'last_indexed_at', 'last_sweep_at')

        HafsqlPostIndexer.new.perform

        assert_equal [1, 2, 3, 4, 5], indexed_source_ids
        assert_equal 5, TagCount.find_by!(tag: 'pagination').posts_count
        assert_equal Time.current, state.reload.last_sweep_at
      end
    end
  end

  test 'rows arriving beyond the initial boundary wait for the next pass' do
    freeze_time do
      with_source_rows((1..3).map { |id| [id, 1.hour.ago + id.seconds] }) do |connection|
        indexer = HafsqlPostIndexer.new
        indexer.define_singleton_method(:upsert_post) do |row, reputations|
          super(row, reputations)
          if row.id == 1
            connection.execute('INSERT INTO hafsql_pagination_rows (id, last_edited) SELECT 4, last_edited FROM hafsql_pagination_rows WHERE id = 3')
          end
        end

        indexer.perform
        assert_equal [1, 2, 3], indexed_source_ids

        HafsqlPostIndexer.new.perform
        assert_equal [1, 2, 3, 4], indexed_source_ids
      end
    end
  end

  test 'empty sweep completes without inventing an incremental checkpoint' do
    freeze_time do
      with_source_rows([]) do
        HafsqlPostIndexer.new.perform

        state = IndexerState.find_by!(name: HafsqlPostIndexer::STATE_NAME)
        assert_nil state.last_id
        assert_nil state.last_indexed_at
        assert_equal Time.current, state.last_sweep_at
      end
    end
  end

private
  def indexed_source_ids
    Post.where(author: 'pagination-author').pluck(:permlink).map(&:to_i).sort
  end

  def with_source_rows(rows)
    connection = ActiveRecord::Base.connection
    connection.execute(<<~SQL)
      CREATE TEMPORARY TABLE hafsql_pagination_rows (
        id bigint PRIMARY KEY,
        author text DEFAULT 'pagination-author',
        title text DEFAULT 'Pagination post',
        category text DEFAULT 'pagination',
        json_metadata json DEFAULT '{}',
        created timestamp DEFAULT #{connection.quote(3.days.ago)},
        last_edited timestamp,
        deleted boolean DEFAULT false,
        parent_author text DEFAULT '',
        net_rshares bigint DEFAULT 1234
      )
    SQL
    rows.each do |id, updated_at|
      connection.execute("INSERT INTO hafsql_pagination_rows (id, last_edited) VALUES (#{id}, #{connection.quote(updated_at)})")
    end
    columns = %w(id author title category parent_author net_rshares).to_h { |column| ["HAFSQL_COMMENTS_#{column.upcase}_COLUMN", column] }
    columns.merge!(
      'HAFSQL_COMMENTS_RELATION' => 'hafsql_pagination_rows',
      'HAFSQL_COMMENTS_PERMLINK_COLUMN' => 'id', 'HAFSQL_COMMENTS_METADATA_COLUMN' => 'json_metadata',
      'HAFSQL_COMMENTS_CREATED_COLUMN' => 'created', 'HAFSQL_COMMENTS_UPDATED_COLUMN' => 'last_edited',
      'HAFSQL_COMMENTS_DELETED_COLUMN' => 'deleted', 'HAFSQL_COMMENTS_DELETED_AT_COLUMN' => nil,
      'HAFSQL_COMMENTS_BLOCK_NUM_COLUMN' => nil, 'HAFSQL_COMMENTS_TRX_ID_COLUMN' => nil
    )
    with_env(columns) do
      stub_const(HafsqlPostIndexer, :BATCH_SIZE, 2) do
        with_blacklist([]) do
          HafsqlRecord.stub(:connection, connection) { yield connection }
        end
      end
    end
  ensure
    connection.execute('DROP TABLE IF EXISTS hafsql_pagination_rows')
  end

  class FakeHafsqlConnection
    def initialize(rows, body: nil)
      @rows = rows
      @body = body
    end

    def exec_query(sql, name = nil, _binds = [])
      return [] if sql.include?('LIMIT 0')
      return [{'body' => @body}] if name == 'HafSQL body fetch'
      return [@rows.max_by { |row| [row['updated_at'], row['id']] }].compact if name == 'HafSQL index boundary'

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
      all_rows = (@incremental_rows + @sweep_rows).sort_by { |row| [row['updated_at'], row['id']] }
      return [all_rows.last].compact if name == 'HafSQL index boundary'
      return super unless name == 'HafSQL post index'

      bind_names = binds.map(&:name)
      bind_names.include?('last_indexed_at') ? @incremental_rows : all_rows
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
