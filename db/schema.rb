# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `rails
# db:schema:load`. When creating a new database, `rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema.define(version: 2020_05_20_045555) do

  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "accounts", force: :cascade do |t|
    t.string "name", null: false
    t.integer "read_posts_count", default: 0, null: false
    t.integer "ignored_tags_count", default: 0, null: false
    t.json "muted_authors", default: [], null: false
    t.datetime "created_at", precision: 6, null: false
    t.datetime "updated_at", precision: 6, null: false
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
    t.datetime "created_at", precision: 6, null: false
    t.datetime "updated_at", precision: 6, null: false
    t.index ["name"], name: "index_name_on_communities", unique: true
  end

  create_table "ignored_tags", force: :cascade do |t|
    t.integer "account_id", null: false
    t.string "tag", null: false
    t.boolean "poisoned_pill", default: false, null: false
    t.datetime "created_at", null: false
    t.index ["account_id", "tag"], name: "index_account_id_tag_on_ignored_tags", unique: true
  end

  create_table "posts", force: :cascade do |t|
    t.string "author", null: false
    t.string "permlink", null: false
    t.string "title", null: false
    t.text "body", null: false
    t.string "category", null: false
    t.json "metadata", default: {}, null: false
    t.integer "block_num", null: false
    t.string "trx_id", null: false
    t.datetime "deleted_at"
    t.boolean "blacklisted", default: false, null: false
    t.integer "tags_count", default: 0, null: false
    t.datetime "created_at", precision: 6, null: false
    t.datetime "updated_at", precision: 6, null: false
    t.index ["author", "blacklisted"], name: "index_author_blacklisted_on_posts"
    t.index ["author", "permlink"], name: "index_author_permlink_on_posts", unique: true
    t.index ["category"], name: "index_community_on_posts", where: "((category)::text ~~ 'hive-%'::text)"
  end

  create_table "read_posts", force: :cascade do |t|
    t.integer "account_id", null: false
    t.integer "post_id", null: false
    t.datetime "created_at", null: false
  end

  create_table "sessions", force: :cascade do |t|
    t.string "session_id", null: false
    t.text "data"
    t.datetime "created_at", precision: 6, null: false
    t.datetime "updated_at", precision: 6, null: false
    t.index ["session_id"], name: "index_sessions_on_session_id", unique: true
    t.index ["updated_at"], name: "index_sessions_on_updated_at"
  end

  create_table "tags", force: :cascade do |t|
    t.integer "post_id", null: false
    t.string "tag", null: false
    t.boolean "category", default: false, null: false
    t.index ["post_id", "tag"], name: "index_post_id_tag_on_tags", unique: true
  end

end
