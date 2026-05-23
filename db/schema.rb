# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.2].define(version: 2026_05_23_002000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "account_tags", force: :cascade do |t|
    t.string "type", null: false
    t.integer "account_id", null: false
    t.string "tag", null: false
    t.datetime "created_at", precision: nil, null: false
    t.index ["type", "account_id", "tag"], name: "index_type_account_id_tag_on_account_tags", unique: true
  end

  create_table "accounts", force: :cascade do |t|
    t.string "name", null: false
    t.integer "read_posts_count", default: 0, null: false
    t.integer "account_tags_count", default: 0, null: false
    t.json "muted_authors", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_name_on_accounts", unique: true
  end

  create_table "communities", force: :cascade do |t|
    t.string "name", null: false
    t.string "title", null: false
    t.text "about"
    t.string "avatar_url"
    t.json "context", default: {}, null: false
    t.text "description"
    t.text "flag_text"
    t.boolean "is_nsfw", default: false, null: false
    t.string "lang", null: false
    t.integer "num_authors", default: 0, null: false
    t.integer "num_pending", default: 0, null: false
    t.integer "subscribers", default: 0, null: false
    t.integer "sum_pending", default: 0, null: false
    t.json "settings", default: {}, null: false
    t.json "team", default: [], null: false
    t.integer "type_id", default: 1, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_name_on_communities", unique: true
  end

  create_table "indexer_states", force: :cascade do |t|
    t.string "name", null: false
    t.bigint "last_id"
    t.datetime "last_indexed_at"
    t.datetime "last_sweep_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_indexer_states_on_name", unique: true
  end

  create_table "posts", force: :cascade do |t|
    t.string "author", null: false
    t.string "permlink", null: false
    t.string "title", null: false
    t.text "body"
    t.string "category", null: false
    t.json "metadata", default: {}, null: false
    t.integer "block_num", null: false
    t.string "trx_id", null: false
    t.datetime "deleted_at", precision: nil
    t.boolean "blacklisted", default: false, null: false
    t.integer "tags_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author", "blacklisted"], name: "index_author_blacklisted_on_posts"
    t.index ["author", "created_at"], name: "index_posts_author_listing", order: { created_at: :desc }
    t.index ["author", "permlink"], name: "index_author_permlink_on_posts", unique: true
    t.index ["blacklisted", "created_at"], name: "index_posts_active_listing", order: { created_at: :desc }, where: "(deleted_at IS NULL)"
    t.index ["category"], name: "index_community_on_posts", where: "((category)::text ~~ 'hive-%'::text)"
    t.index ["deleted_at", "created_at"], name: "index_posts_deleted_listing", order: { created_at: :desc }
  end

  create_table "read_posts", force: :cascade do |t|
    t.integer "account_id", null: false
    t.integer "post_id", null: false
    t.datetime "created_at", precision: nil, null: false
    t.index ["account_id", "post_id"], name: "index_read_posts_account_id_post_id", unique: true
    t.index ["post_id", "account_id"], name: "index_read_posts_post_id_account_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.string "session_id", null: false
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["session_id"], name: "index_sessions_on_session_id", unique: true
    t.index ["updated_at"], name: "index_sessions_on_updated_at"
  end

  create_table "tag_counts", force: :cascade do |t|
    t.string "tag", null: false
    t.integer "posts_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["posts_count"], name: "index_tag_counts_on_posts_count"
    t.index ["tag"], name: "index_tag_counts_on_tag", unique: true
  end

  create_table "tags", force: :cascade do |t|
    t.integer "post_id", null: false
    t.string "tag", null: false
    t.boolean "category", default: false, null: false
    t.index ["post_id", "tag"], name: "index_post_id_tag_on_tags", unique: true
    t.index ["tag", "post_id"], name: "index_tags_tag_post_id"
  end
end
