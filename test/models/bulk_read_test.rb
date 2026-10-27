require 'test_helper'

class BulkReadTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  setup do
    @account = Account.create!(name: "bulk-#{SecureRandom.hex(8)}")
    @other = Account.create!(name: "other-#{SecureRandom.hex(8)}")
    now = Time.current
    Post.insert_all!((1..2005).map do |i|
      {author: @account.name, permlink: "post-#{i}", title: 'Bulk', category: 'bulk',
       block_num: i, trx_id: 'bulk', created_at: now, updated_at: now}
    end)
    @posts = Post.where(author: @account.name)
  end

  teardown do
    @account&.destroy!
    @other&.destroy!
    @posts&.delete_all
  end

  test 'bulk reads preserve timestamps and validate post existence and account isolation' do
    id = @posts.minimum(:id)
    before = 1.day.ago.change(usec: 0)
    @account.read_posts.create!(post_id: id, created_at: before)
    @other.read_posts.create!(post_id: id)
    scope = Post.where(id: [id, id, id + 1, -1, 'invalid', nil])

    assert_equal 2, @account.mark_posts_as_read!(scope)
    assert_equal [id, id + 1], @account.read_posts.order(:post_id).pluck(:post_id)
    assert_equal before, @account.read_posts.find_by!(post_id: id).created_at
    assert_equal [id], @other.read_posts.pluck(:post_id)
    assert_equal 2, @account.mark_posts_as_read!(scope)
    assert_equal 0, @account.mark_posts_as_read!(Post.none)
  end

  test 'interrupted batches retain completed work and retries finish without duplicates' do
    proxy = @account.read_posts
    insert = proxy.method(:insert_all)
    calls = 0
    interrupted = lambda do |*args, **options|
      calls += 1
      raise 'injected interruption' if calls == 2
      insert.call(*args, **options)
    end

    proxy.stub(:insert_all, interrupted) do
      error = assert_raises(RuntimeError) { @account.mark_posts_as_read!(@posts) }
      assert_equal 'injected interruption', error.message
    end
    assert_equal 1000, @account.read_posts.count
    before = @account.read_posts.pluck(:post_id, :created_at).to_h

    remaining = @posts.where.not(id: @account.read_posts.select(:post_id))
    assert_equal 1005, @account.mark_posts_as_read!(remaining)
    assert_equal 2005, @account.mark_posts_as_read!(@posts)
    assert_equal @posts.order(:id).ids, @account.read_posts.order(:post_id).pluck(:post_id)
    assert_equal before, @account.read_posts.where(post_id: before.keys).pluck(:post_id, :created_at).to_h
  end

  test 'concurrent attempts create one read record per account and post' do
    ready = Queue.new
    start = Queue.new
    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          account = Account.find(@account.id)
          ready << true
          start.pop
          account.mark_posts_as_read!(Post.where(author: account.name))
        end
      end
    end
    2.times { ready.pop }
    2.times { start << true }
    assert_equal [2005, 2005], threads.map(&:value)
    assert_equal 2005, @account.read_posts.count
    assert_equal @posts.order(:id).ids, @account.read_posts.order(:post_id).pluck(:post_id)
    assert_equal 0, @other.read_posts.count
  ensure
    threads&.each(&:join)
  end
end
