class AccountTag::PoisonedPill < AccountTag
  def poisoned_authors
    Post.where(id: Tag.where(tag: tag).select(:post_id)).distinct.pluck(:author)
  end
end
