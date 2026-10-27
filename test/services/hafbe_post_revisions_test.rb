require 'test_helper'

class HafbePostRevisionsTest < ActiveSupport::TestCase
  test 'normalizes comment revisions and reconstructs diff match patch bodies' do
    post = Post.new(author: 'alice', permlink: 'edited-post', title: 'Current title')
    response = hafbe_response(
      'operations_result' => [
        comment_op(post, body: "Hello world\nBye", title: 'Original', block: 20, timestamp: '2026-01-02T00:00:00', json_metadata: '{"tags":["hive"]}', parent_permlink: 'hive'),
        {'op' => {'type' => 'vote_operation', 'value' => {'author' => post.author, 'permlink' => post.permlink}}, 'block' => 21},
        comment_op(post, body: 'Wrong author', author: 'bob', block: 22),
        comment_op(post, body: 'Wrong post', permlink: 'another-post', block: 22),
        comment_op(post, body: "Earlier body", title: 'Earlier', block: 10, timestamp: '2026-01-01T00:00:00', json_metadata: '{', parent_permlink: 'old'),
        comment_op(post, body: "@@ -1,15 +1,21 @@\n Hello \n+brave \n world%0ABye\n", title: 'Patched', block: 23, timestamp: '2026-01-03T00:00:00')
      ]
    )

    Net::HTTP.stub(:get_response, response) do
      revisions = HafbePostRevisions.new(base_url: 'https://hafbe.example').revisions_for(post)

      assert_equal ['Earlier body', "Hello world\nBye", "Hello brave world\nBye"], revisions.map { |revision| revision.fetch(:body) }
      assert_equal({}, revisions.first.fetch(:json_metadata))
      assert_equal true, revisions.first.fetch(:json_metadata_present)
      assert_equal({'tags' => ['hive']}, revisions.second.fetch(:json_metadata))
      assert_equal false, revisions.third.fetch(:json_metadata_present)
      assert_equal Time.utc(2026, 1, 3), revisions.third.fetch(:published_at_time)
    end
  end

  test 'latest revision can be a deleted placeholder with blank parent permlink' do
    post = Post.new(author: 'igormuba', permlink: 'hive-all-time-low-just-d0e9837a15ed9', title: 'Original title')
    response = hafbe_response(
      'operations_result' => [
        comment_op(post, body: 'Original long body', title: 'HIVE all time low', block: 107011262, timestamp: '2026-06-05T16:30:00', json_metadata: '{"tags":["hive-125125"]}', parent_permlink: 'hive-125125'),
        comment_op(post, body: '\\[DELETED\\] accidental repost', title: '[DELETED] accidental repost', block: 107011827, timestamp: '2026-06-05T16:58:18', json_metadata: '{"tags":[],"description":"DELETED"}', parent_permlink: '')
      ]
    )

    Net::HTTP.stub(:get_response, response) do
      latest = HafbePostRevisions.new(base_url: 'https://hafbe.example').revisions_for(post).last

      assert_equal '\\[DELETED\\] accidental repost', latest.fetch(:body)
      assert_equal '[DELETED] accidental repost', latest.fetch(:title)
      assert_equal({'tags' => [], 'description' => 'DELETED'}, latest.fetch(:json_metadata))
      assert_equal '', latest.fetch(:parent_permlink)
      assert_equal 107011827, latest.fetch(:block_num)
    end
  end

  test 'does not expose diff match patch bodies that cannot be reconstructed' do
    post = Post.new(author: 'seattlea', permlink: 'introducing-hivelytics-2-0-or', title: 'Current title')
    patch_body = "@@ -0,0 +1,12 @@\n+Hello world\n"
    response = hafbe_response(
      'operations_result' => [
        comment_op(post, body: patch_body, block: 30, timestamp: '2026-01-03T00:00:00')
      ]
    )

    Net::HTTP.stub(:get_response, response) do
      revisions = HafbePostRevisions.new(base_url: 'https://hafbe.example').revisions_for(post)

      assert_empty revisions
    end
  end

  test 'does not append a local diff match patch body as a rendered revision' do
    post = Post.new(author: 'seattlea', permlink: 'introducing-hivelytics-2-0-or', title: 'Current title')
    response = hafbe_response('operations_result' => [])

    Net::HTTP.stub(:get_response, response) do
      revisions = HafbePostRevisions.new(base_url: 'https://hafbe.example').call(
        post: post,
        local_body: "@@ -0,0 +1,12 @@\n+Hello world\n",
        render_body: ->(body) { body }
      )

      assert_empty revisions
    end
  end

  test 'recognizes diff match patch headers with omitted lengths' do
    post = Post.new(author: 'alice', permlink: 'edited-post', title: 'Current title')
    response = hafbe_response(
      'operations_result' => [
        comment_op(post, body: "Hello\n", block: 20, timestamp: '2026-01-02T00:00:00'),
        comment_op(post, body: "@@ -6 +6,6 @@\n %0A\n+Again\n", block: 21, timestamp: '2026-01-03T00:00:00')
      ]
    )

    Net::HTTP.stub(:get_response, response) do
      revisions = HafbePostRevisions.new(base_url: 'https://hafbe.example').revisions_for(post)

      assert_equal ["Hello\n", "Hello\nAgain"], revisions.map { |revision| revision.fetch(:body) }
    end
  end

  test 'applies diff match patch hunks with minor whitespace drift' do
    post = Post.new(author: 'seattlea', permlink: 'introducing-hivelytics-2-0-or', title: 'Current title')
    response = hafbe_response(
      'operations_result' => [
        comment_op(post, body: 'Why I have created the[  2.0 Version](https://example.com)?', block: 20, timestamp: '2026-01-02T00:00:00'),
        comment_op(post, body: "@@ -19,10 +19,9 @@\n the\n-[ \n+[\n 2.0 \n", block: 21, timestamp: '2026-01-03T00:00:00')
      ]
    )

    Net::HTTP.stub(:get_response, response) do
      revisions = HafbePostRevisions.new(base_url: 'https://hafbe.example').revisions_for(post)

      assert_equal [
        'Why I have created the[  2.0 Version](https://example.com)?',
        'Why I have created the[2.0 Version](https://example.com)?'
      ], revisions.map { |revision| revision.fetch(:body) }
    end
  end

  test 'reuses raw responses by full identity without sharing mutable parsed histories' do
    service = HafbePostRevisions.new(base_url: 'https://hafbe.example')
    calls = []
    posts = [Post.new(author: 'alice', permlink: 'one'), Post.new(author: 'alice', permlink: 'two'),
             Post.new(author: 'bob', permlink: 'one'), Post.new(author: 'alice', permlink: 'empty')]
    fetch = lambda do |uri|
      calls << uri.path
      post = posts.find { |p| uri.path.end_with?("/#{p.author}/operations/comments/#{p.permlink}") }
      hafbe_response('operations' => post.permlink == 'empty' ? [] : [comment_op(post, body: post.permlink)])
    end

    Net::HTTP.stub(:get_response, fetch) do
      posts.each do |post|
        first = service.revisions_for(post)
        first.first[:body].replace('Changed by caller') if first.any?
        rendered = service.call(post: post, local_body: 'Local fallback', render_body: ->(body) { body })
        assert_equal 'Local fallback', rendered.last.fetch(:body)
        expected = post.permlink == 'empty' ? [] : [post.permlink]
        assert_equal expected, service.revisions_for(post).pluck(:body)
      end
    end

    assert_equal 4, calls.size
    assert_equal 4, calls.uniq.size
  end

  test 'reuses a timeout within one service while a new instance can recover' do
    post = Post.new(author: 'alice', permlink: 'retry')
    calls = 0
    fetch = lambda do |_uri|
      calls += 1
      raise Timeout::Error, 'fixed timeout' if calls == 1
      hafbe_response('operations' => [])
    end

    Net::HTTP.stub(:get_response, fetch) do
      service = HafbePostRevisions.new(base_url: 'https://hafbe.example')
      2.times do
        error = assert_raises(HafbePostRevisions::FetchError) { service.revisions_for(post) }
        assert_includes error.message, 'fixed timeout'
      end
      assert_equal 1, calls
      assert_empty HafbePostRevisions.new(base_url: 'https://hafbe.example').revisions_for(post)
      assert_equal 2, calls
    end
  end

private
  def hafbe_response(payload)
    Struct.new(:code, :body).new('200', payload.to_json)
  end

  def comment_op(post, body:, title: nil, author: post.author, permlink: post.permlink, block: 1, timestamp: '2026-01-01T00:00:00', json_metadata: nil, parent_permlink: nil)
    value = {
      'author' => author,
      'permlink' => permlink,
      'body' => body,
      'title' => title,
      'json_metadata' => json_metadata,
      'parent_permlink' => parent_permlink
    }.compact

    {
      'op' => {'type' => 'comment_operation', 'value' => value},
      'block' => block,
      'timestamp' => timestamp,
      'trx_id' => "trx-#{block}"
    }
  end
end
