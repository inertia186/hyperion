class CreateAccounts < ActiveRecord::Migration[6.0]
  def change
    create_table :accounts do |t|
      t.string :name, null: false
      t.integer :read_posts_count, null: false, default: 0
      t.integer :ignored_tags_count, null: false, default: 0
      t.json :muted_authors, null: false, default: []
      t.timestamps null: false
    end
    
    add_index :accounts, [:name], name: 'index_name_on_accounts', unique: true
    
    create_table :communities do |t|
      t.string :name, null: false
      t.string :title, null: false
      t.text :about
      t.string :avatar_url
      t.json :context, null: false, default: {}
      t.text :description
      t.text :flag_text
      t.boolean :is_nsfw, null: false, default: '0'
      t.string :lang, null: false
      t.integer :num_authors, null: false, default: 0
      t.integer :num_pending, null: false, default: 0
      t.integer :subscribers, null: false, default: 0
      t.integer :sum_pending, null: false, default: 0
      t.json :settings, null: false, default: {}
      t.json :team, null: false, default: []
      t.integer :type_id, null: false, default: 1
      t.timestamps null: false
    end
    
    add_index :communities, [:name], name: 'index_name_on_communities', unique: true

    create_table :posts do |t|
      t.string :author, null: false
      t.string :permlink, null: false
      t.string :title, null: false
      t.text :body, null: false
      t.string :category, null: false
      t.json :metadata, null: false, default: {}
      t.integer :block_num, null: false
      t.string :trx_id, null: false
      t.timestamp :deleted_at
      t.boolean :blacklisted, null: false, default: '0'
      t.integer :tags_count, null: false, default: 0
      t.timestamps null: false
    end

    add_index :posts, [:author, :permlink], name: 'index_author_permlink_on_posts', unique: true
    add_index :posts, [:author, :blacklisted], name: 'index_author_blacklisted_on_posts'
    add_index :posts, [:category], name: 'index_community_on_posts', where: "posts.category LIKE 'hive-%'"
    
    create_table :tags do |t|
      t.integer :post_id, null: false
      t.string :tag, null: false
      t.boolean :category, null: false, default: '0'
    end

    add_index :tags, [:post_id, :tag], name: 'index_post_id_tag_on_tags', unique: true
    
    create_table :read_posts do |t|
      t.integer :account_id, null: false
      t.integer :post_id, null: false
      t.timestamp :created_at, null: false
    end
    
    create_table :ignored_tags do |t|
      t.integer :account_id, null: false
      t.string :tag, null: false
      t.boolean :poisoned_pill, null: false, default: '0'
      t.timestamp :created_at, null: false
    end
    
    add_index :ignored_tags, [:account_id, :tag], name: 'index_account_id_tag_on_ignored_tags', unique: true
  end
end
