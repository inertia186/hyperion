class TagsController < ApplicationController
  def index
    read_params
    
    @tags = current_account.account_tags
    
    @tags = case @sort
    when 'name_asc' then @tags.left_outer_joins(:community).order('LOWER(CASE WHEN communities.title IS NOT NULL THEN communities.title ELSE account_tags.tag END) ASC')
    when 'name_desc' then @tags.left_outer_joins(:community).order('LOWER(CASE WHEN communities.title IS NOT NULL THEN communities.title ELSE account_tags.tag END) DESC')
    when 'tag_asc' then @tags.order(tag: :asc)
    when 'tag_desc' then @tags.order(tag: :desc)
    when 'latest' then @tags.order(created_at: :desc)
    when 'oldest' then @tags.order(created_at: :asc)
    when 'most_posts' then @tags.order('(SELECT DISTINCT count(post_id) FROM tags WHERE tags.tag = account_tags.tag) DESC')
    when 'least_posts' then @tags.order('(SELECT DISTINCT count(post_id) FROM tags WHERE tags.tag = account_tags.tag) ASC')
    else
      @tags
    end
    
    @tags = case @type
    when :all then @tags
    when :favorite then @tags.favorite
    when :ignored then @tags.ignored
    when :past then @tags.past
    when :poisoned_pill then @tags.poisoned_pill
    else
      @tags
    end
  end
  
  def unread_count
    tag = params[:id]
    
    posts = Post.active.unread(by: current_account).tagged_any(tag)
    
    if !!session[:muted_authors_enabled]
      posts = posts.where.not(author: current_account.muted_authors)
    end
    
    respond_to do |format|
      format.json {
        render json: {tag: tag, count: posts.count}
      }
    end
  end
  
  def create_favorite
    create_type_by_relation(current_account.favorite_tags)
  end
  
  def create_ignored
    create_type_by_relation(current_account.ignored_tags)
  end
  
  def create_past
    create_type_by_relation(current_account.past_tags)
  end
  
  def create_poisoned_pill
    create_type_by_relation(current_account.poisoned_pill_tags)
  end
  
  def destroy
    read_params
    count = current_account.account_tags.where(id: params[:id]).destroy_all
    
    respond_to do |format|
      format.html {
        redirect_to params[:return_to] || tags_url(sort: @sort, limit: @limit, type: @type)
      }
      format.js {
        if count == 0
          head 404
        else
          head :accepted
        end
      }
    end
  end
  
  def destroy_favorite
    destroy_type_by_relation(current_account.favorite_tags)
  end
  
  def destroy_ignored
    destroy_type_by_relation(current_account.ignored_tags)
  end
  
  def destroy_past
    destroy_type_by_relation(current_account.past_tags)
  end
  
  def destroy_poisoned_pill
    destroy_type_by_relation(current_account.poisoned_pill_tags)
  end
private
  def read_params
    @sort = params[:sort] || 'latest'
    @limit = (params[:limit] || '30').to_i
    @type = params[:type]
    
    @type = case @type
    when nil, '', 'all' then :all
    when AccountTag::FAVORITE_TYPE then :favorite
    when AccountTag::IGNORED_TYPE then :ignored
    when AccountTag::PAST_TYPE then :past
    when AccountTag::POISONED_PILL_TYPE then :poisoned_pill
    else
      @type.parameterize.to_sym
    end
  end
  
  def create_type_by_relation(relation)
    read_params
    tag = relation.find_or_create_by(tag: params[:id])
    
    respond_to do |format|
      format.html {
        if tag.persisted?
          redirect_to params[:return_to] || tags_url(sort: @sort, limit: @limit, type: @type)
        else
          render 'new'
        end
      }
      format.js {
        if tag.persisted?
          head :created
        else
          if tag.errors.any?
            raise tag.errors.messages.to_s
          else
            head 400
          end
        end
      }
    end
  end
  
  def destroy_type_by_relation(relation)
    read_params
    count = relation.where(tag: params[:id]).destroy_all
    
    respond_to do |format|
      format.html {
        redirect_to params[:return_to] || tags_url(sort: @sort, limit: @limit, type: @type)
      }
      format.js {
        if count == 0
          head 404
        else
          head :accepted
        end
      }
    end
  end
end
