require 'set'

class PostCurationAssociations
  TAG_CLOUD_LIMIT = 250

  attr_reader :account, :posts, :post_ids, :all_posts, :tag, :author,
    :read_post_ids, :post_tags, :post_bodies, :post_communities,
    :related_tags, :related_authors, :related_communities, :past_tags,
    :favorite_tag_set

  def initialize(account:, posts:, post_ids:, all_posts:, tag:, author:)
    @account = account
    @posts = posts
    @post_ids = post_ids
    @all_posts = all_posts
    @tag = tag
    @author = author
  end

  def call
    @read_post_ids = account.read_posts.where(post_id: post_ids).pluck(:post_id)
    @post_tags = Tag.where(post_id: post_ids).order(:id).pluck(:post_id, :tag, :category).group_by(&:first)
    @post_bodies = Post.where(id: post_ids).pluck(:id, :body).to_h
    @post_communities = communities_by_name(post_community_names)
    @related_authors = all_posts.distinct.limit(1000).order(:author).pluck(:author)
    @related_tags = load_related_tags
    related_tag_counts = load_related_tag_counts(@related_tags)
    @related_communities = communities_by_name(@related_tags.select { |tag_name| tag_name =~ Tag::COMMUNITY_CATEGORY_REGEX })
    @related_tags = related_tags.map do |tag_name|
      community = related_communities[tag_name] || {}
      {name: community[:name] || tag_name, tag: tag_name, count: related_tag_counts[tag_name].to_i, image_url: community[:image_url]}
    end
    @past_tags = load_past_tags
    @favorite_tag_set = account.favorite_tags.pluck(:tag).to_set
    self
  end

  private

  def post_community_names
    (posts.map(&:category) + post_tags.values.flatten(1).map(&:second)).
      select { |tag_name| tag_name =~ Tag::COMMUNITY_CATEGORY_REGEX }.
      uniq
  end

  def communities_by_name(names)
    Community.where(name: names).index_by(&:name).transform_values do |community|
      community_payload(community.title, community.community_account)
    end
  end

  def community_payload(title, community_account)
    return {} if title.blank? && community_account.blank?

    {
      name: title,
      image_url: Community.profile_image_from_account(community_account)
    }
  end

  def load_related_tags
    tags = if author
      Tag.related_author(author, TAG_CLOUD_LIMIT)
    else
      Tag.related_tags(tag, TAG_CLOUD_LIMIT)
    end

    (tags.uniq - [[tag, '']].flatten)
  end

  def load_related_tag_counts(tags)
    return {} if tags.empty?

    if author
      Post.joins(:tags).active.author(author).where(tags: {tag: tags}).group('tags.tag').count
    elsif tag.blank?
      TagCount.group_by_tag_count(tags: tags, limit: tags.size)
    else
      Post.joins(:tags).active.tagged_any(tag).where(tags: {tag: tags}).group('tags.tag').count
    end
  end

  def load_past_tags
    account.past_tags.left_outer_joins(:community).select('account_tags.tag', 'communities.title', 'communities.community_account').map do |account_tag|
      community = community_payload(account_tag.title, account_tag.community_account)
      {name: community[:name] || account_tag.tag, tag: account_tag.tag, image_url: community[:image_url]}
    end
  end
end
