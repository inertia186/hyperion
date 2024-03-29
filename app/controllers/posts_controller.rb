class PostsController < ApplicationController
  skip_before_action :sign_in, only: :content_loading
  
  def index
    read_params
    
    @posts = Post.tagged_any(@tag)
    
    @posts = @posts.tagged_all(@other_tags) if @other_tags.any?
    
    if @without_tags.any?
      @posts = @posts.where.not(id: Tag.where(tag: @without_tags).select(:post_id))
    end
    
    @posts = if !!@author
      @posts = @posts.author(@author)
    elsif @only_deleted
      @posts.deleted
    else
      @posts.active.blacklisted(@only_blacklisted) # but not older than 7 days
    end
    
    if !!@app
      [@app].flatten.each do |a|
        if a.starts_with? '-'
          @posts = @posts.app(a.split('-').last, false)
        else
          @posts = @posts.app(a)
        end
      end
    end
    
    @posts = if @only_ignored
      @posts.where(id: Tag.where(tag: ignored_tags).select(:post_id))
    elsif @only_read
      @posts.where(id: current_account.read_posts.select(:post_id))
    elsif !!@author
      @posts
    elsif @only_deleted
      @posts
    elsif @only_blacklisted
      @posts
    else
      @posts.unread(by: current_account, allow_tag: @tag)
    end
    
    @posts = @posts.where("body ILIKE ?", "%#{@query}%") if !!@query
    
    unless @author
      if !!session[:muted_authors_enabled]
        @posts = @posts.where.not(author: current_account.reload.muted_authors)
      end
      if !!session[:only_favorite_tags]
        @posts = @posts.where(id: Tag.where(tag: current_account.favorite_tags.select(:tag)).select(:post_id))
      end
    end

    @all_posts = @posts
    @related_authors = @posts.distinct.limit(1000).order(:author).pluck(:author)
    @pagy, @posts = pagy(@posts, items: @limit)
    
    @posts = case @sort
    when 'latest' then @posts.order(created_at: :desc)
    when 'oldest' then @posts.order(created_at: :asc)
    when 'most_tags' then @posts.order('(SELECT count(tag) FROM tags WHERE tags.post_id = posts.id) DESC')
    when 'least_tags' then @posts.order('(SELECT count(tag) FROM tags WHERE tags.post_id = posts.id) ASC')
    when 'most_prolific' then @posts.order_by_prolific(@tag, :DESC)
    when 'least_prolific' then @posts.order_by_prolific(@tag, :ASC)
    else
      @posts
    end
    
    @related_tags = if !!@author
      Tag.related_author(@author)
    else
      Tag.related_tags(@tag)
    end
    
    @related_tags = @related_tags.uniq - [[@tag, '']].flatten
    
    community_tags = @related_tags.select{|tag| tag =~ Tag::COMMUNITY_CATEGORY_REGEX}
    @related_communities = Community.where(name: community_tags).map do |community|
      [community.name, community.title]
    end.to_h
    
    @related_tags = @related_tags.map do |tag|
      [(@related_communities[tag] || tag), tag]
    end#.sort_by{|k, v| k.downcase}.to_h
  end
  
  def content_loading
    render layout: false
  end  
  
  def content_sandbox
    @post = Post.find params[:id]
    
    if @post.body =~ Post::DIFF_MATCH_PATCH_PATTERN
      # Detecting edit just in time.
    
      @post.fetch_latest
      @post.save
    end
    
    render layout: false
  end
  
  def mark_as_read
    read_params
    @id = params[:id]
    current_account.mark_post_as_read!(@id)
    
    respond_to do |format|
      format.html {
        redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
      }
      format.js {
        index # to pick up current version of @all_posts
      }
    end
  end
  
  def mark_as_unread
    read_params
    @id = params[:id]
    current_account.mark_post_as_unread!(@id)
    
    respond_to do |format|
      format.html {
        redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
      }
      format.js {
        index # to pick up current version of @all_posts
        
        render :mark_as_read
      }
    end
  end
  
  def mark_all_as_read
    read_params
    post_ids = [params[:post_ids]].flatten
    mark_tag_read = [params[:mark_tag_read]].flatten.compact
    
    post_ids.each do |id|
      current_account.mark_post_as_read!(id)
    end
    
    if mark_tag_read.size > 0
      Post.active.tagged_any(mark_tag_read).unread(by: current_account).find_each do |post|
        ReadPost.find_or_create_by(account: current_account, post: post)
      end
    end
    
    redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
  end
  
  def toggle_mutes
    read_params
    
    if session[:muted_authors_enabled] = !session[:muted_authors_enabled]
      # Do this inline to ensure we have the latest mute list for this author,
      # even though it might be a little slow.
      current_account.refresh_muted_authors
      current_account.save
    end
    
    redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
  end
  
  def toggle_only_favorite_tags
    read_params
    
    session[:only_favorite_tags] = !session[:only_favorite_tags]
    
    redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
  end
  
  def ignore_all
    read_params
    ignore_tag = [params[:ignore_tag]].flatten
    
    ignore_tag.each do |tag|
      current_account.ignored_tags.create(tag: tag)
    end
    
    redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern, only_ignored: true)
  end
  
  def clear_read
    read_params
    clear_read_posts
    
    redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
  end
  
  def clear_ignored_tags
    read_params
    allow_tag = [params[:allow_tag]].flatten
    
    if allow_tag.any?
      current_account.ignored_tags.where(tag: allow_tag).destroy_all
      current_account.poisoned_pill_tags.where(tag: allow_tag).destroy_all
    else
      current_account.ignored_tags.destroy_all
    end
    
    redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
  end
  
  def clear_past_tags
    read_params
    only_ignored = params[:only_ignored] == 'true'
    
    if only_ignored
      current_account.past_tags.where(tag: current_account.ignored_tags.select(:tag)).destroy_all
    else
      current_account.past_tags.destroy_all
    end
    
    redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
  end
  
  def clear_past_tag
    current_account.past_tags.where(tag: params[:id]).destroy_all
    
    respond_to do |format|
      format.html {
        read_params
        
        redirect_to posts_url(sort: @sort, limit: @limit, tag: @tag_pattern)
      }
      format.js {
        head :accepted
      }
    end
  end
  
  def new_saved_query
  end
private
  def read_params
    @sort = params[:sort] || 'latest'
    @limit = (params[:limit] || '30').to_i
    @tag = [params[:tag] || ''].flatten.first
    @other_tags = [params[:tag] || ''].flatten - [@tag]
    @query = params[:query]
    @author = params[:author]
    @app = params[:app]
    @only_ignored = params[:only_ignored]
    @only_read = params[:only_read]
    @only_blacklisted = (params[:only_blacklisted] || 'false') == 'true'
    @only_deleted = (params[:only_deleted] || 'false') == 'true'
    
    if @tag.starts_with?('@')
      @author = @tag.split('@').last
      @tag = @tag.gsub("@#{@author}", '')
    end
    
    if @tag.starts_with?('app:')
      @app = @tag.split('app:').last
      @tag = @tag.gsub("app:#{@app}", '')
    end
    
    @tag = @tag.gsub('+', ' ')
    @tag, *@other_tags = @tag.split(' ') + @other_tags if @tag.include?(' ')
    @other_tags = @other_tags.uniq
    
    @tag = '' if @tag == '-'
    
    @without_tags = []
    
    @other_tags.each do |tag|
      @without_tags << tag.split('-')[1..-1].join('-') if tag.starts_with?('-')
    end
    
    @other_tags = @other_tags.select do |tag|
      !tag.starts_with?('-')
    end
    
    @tag_pattern = [([@tag] + @other_tags).reject(&:empty?).join('+'), @without_tags].reject(&:empty?).join('+-')
    
    [@tag].flatten.reject(&:empty?).map(&:downcase).each do |tag|
      current_account.past_tags.find_or_create_by(tag: tag)
    end
  end
end
