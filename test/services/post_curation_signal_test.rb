require 'test_helper'

class PostCurationSignalTest < ActiveSupport::TestCase
  test 'prolific signal counts author history outside the filtered result scope' do
    prolific = 7.times.map do |index|
      create_post('prolific', index, created_at: 8.days.ago, deleted_at: 1.hour.ago)
    end
    ordinary = 6.times.map { |index| create_post('ordinary', index) }
    prolific.first.update!(created_at: Time.current, deleted_at: nil)
    scope = Post.active.where(id: [prolific.first.id, ordinary.first.id])

    assert_equal [prolific.first.id], apply_prolific(scope, '').pluck(:id)
  end

  test 'prolific signal preserves matching tag counts and does not duplicate result posts' do
    prolific = 4.times.map { |index| create_post('prolific', index, tags: ["topic'one", 'other']) }
    ordinary = 3.times.map { |index| create_post('ordinary', index, tags: ["topic'one", 'other']) }
    scope = Post.where(id: [prolific.first.id, ordinary.first.id])

    assert_empty apply_prolific(scope, "topic'one").pluck(:id)
    assert_equal [prolific.first.id], apply_prolific(scope, ["topic'one", 'other']).pluck(:id)
    assert_empty apply_prolific(scope.none, ["topic'one", 'other']).pluck(:id)
  end

  test 'high tag utilization uses stored tags at the threshold even when counters are stale' do
    tagged = create_post('tagged', 0, tags: (1..8).map { |index| "tag-#{index}" })
    ordinary = create_post('ordinary', 0, tags: (1..7).map { |index| "tag-#{index}" })
    assert_equal 0, tagged.reload.tags_count
    scope = Post.where(id: [tagged.id, ordinary.id])

    result = PostCurationSignal.apply(scope, signal: PostCurationSignal::HIGH_TAG_UTILIZATION, tag: '')

    assert_equal [tagged.id], result.pluck(:id)
  end

  private

  def apply_prolific(scope, tag)
    PostCurationSignal.apply(scope, signal: PostCurationSignal::HIGH_PROLIFIC_AUTHOR, tag: tag)
  end

  def create_post(author, index, tags: [], **attributes)
    post = Post.create!(
      author: author, permlink: "signal-#{index}", title: 'Signal post',
      category: 'test', metadata: {}, block_num: 1, trx_id: 'test',
      created_at: Time.current, **attributes
    )
    tags.each { |tag| post.tags.create!(tag: tag) }
    post
  end
end
