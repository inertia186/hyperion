require 'test_helper'

class PostCleanupJobTest < ActiveJob::TestCase
  test 'marks active posts from newly blacklisted authors' do
    post = posts(:allowed_unread)
    blacklist = Struct.new(:blacklist_reasons_by_account).new({post.author => [{'community' => 'hive-163399'}]})

    assert_not post.blacklisted?

    PostIndexJob.stub(:new, blacklist) do
      PostCleanupJob.new.perform
    end

    post.reload
    assert post.blacklisted?
    assert_equal [{'community' => 'hive-163399'}], post.blacklist_reasons
  end

  test 'backfills reasons for active posts already marked blacklisted' do
    post = posts(:blacklisted_allowed)
    post.update!(blacklist_reasons: [])
    blacklist = Struct.new(:blacklist_reasons_by_account).new({post.author => [{'community' => 'hive-139531'}]})

    PostIndexJob.stub(:new, blacklist) do
      PostCleanupJob.new.perform
    end

    assert_equal [{'community' => 'hive-139531'}], post.reload.blacklist_reasons
  end
end
