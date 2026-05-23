class TagCount < ApplicationRecord
  validates_presence_of :tag
  validates_uniqueness_of :tag

  def self.increment!(tag)
    upsert_count(tag, 1)
  end

  def self.decrement!(tag)
    upsert_count(tag, -1)
  end

  def self.group_by_tag_count(direction = :desc, limit: nil, tags: nil)
    relation = all
    relation = relation.where(tag: tags) if tags.present?
    relation = relation.order(posts_count: direction)
    relation = relation.limit(limit) if limit.present?

    relation.pluck(:tag, :posts_count).to_h
  end

  def self.refresh!
    transaction do
      delete_all

      insert_all(
        Tag.group(:tag).count.map do |tag, count|
          {tag: tag, posts_count: count, created_at: Time.current, updated_at: Time.current}
        end
      )
    end
  end

  def self.upsert_count(tag, delta)
    return if tag.blank?

    connection.exec_update(
      <<~SQL.squish,
        INSERT INTO tag_counts (tag, posts_count, created_at, updated_at)
        VALUES ($1, GREATEST($2, 0), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (tag)
        DO UPDATE SET
          posts_count = GREATEST(tag_counts.posts_count + $2, 0),
          updated_at = CURRENT_TIMESTAMP
      SQL
      'TagCount upsert',
      [
        ActiveRecord::Relation::QueryAttribute.new('tag', tag, ActiveRecord::Type::String.new),
        ActiveRecord::Relation::QueryAttribute.new('delta', delta, ActiveRecord::Type::Integer.new)
      ]
    )
  end
end
