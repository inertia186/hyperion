require 'test_helper'

class PostIndexJobTest < ActiveJob::TestCase
  test 'dispatches to HafSQL indexer by default' do
    indexer = Minitest::Mock.new
    indexer.expect(:perform, nil)

    HafsqlPostIndexer.stub(:new, indexer) do
      PostIndexJob.new.perform
    end

    assert_mock indexer
  end

  test 'dispatches to RPC indexer when HafSQL is disabled' do
    with_env('HAFSQL_INDEXER_ENABLED' => 'false') do
      job = PostIndexJob.new
      called = false

      job.stub(:perform_with_rpc, ->(*) { called = true }) do
        job.perform
      end

      assert called
    end
  end
end
