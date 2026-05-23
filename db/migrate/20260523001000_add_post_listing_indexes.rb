class AddPostListingIndexes < ActiveRecord::Migration[7.2]
  def change
    add_index :posts, [:blacklisted, :created_at],
      name: 'index_posts_active_listing',
      order: {created_at: :desc},
      where: 'deleted_at IS NULL'

    add_index :posts, [:deleted_at, :created_at],
      name: 'index_posts_deleted_listing',
      order: {created_at: :desc}

    add_index :posts, [:author, :created_at],
      name: 'index_posts_author_listing',
      order: {created_at: :desc}

    add_index :tags, [:tag, :post_id],
      name: 'index_tags_tag_post_id'

    add_index :read_posts, [:account_id, :post_id],
      name: 'index_read_posts_account_id_post_id',
      unique: true

    add_index :read_posts, [:post_id, :account_id],
      name: 'index_read_posts_post_id_account_id'
  end
end
