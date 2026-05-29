class Api::V1::TagsController < Api::V1::BaseController
  def create_ignored
    current_account.ignored_tags.find_or_create_by(tag: tag_param)

    render json: tag_state_json, status: :created
  end

  def destroy_ignored
    current_account.ignored_tags.where(tag: tag_param).destroy_all
    current_account.poisoned_pill_tags.where(tag: tag_param).destroy_all

    render json: tag_state_json
  end

  def create_favorite
    current_account.favorite_tags.find_or_create_by(tag: tag_param)

    render json: tag_state_json, status: :created
  end

  def destroy_favorite
    current_account.favorite_tags.where(tag: tag_param).destroy_all

    render json: tag_state_json
  end

  def destroy_past
    current_account.past_tags.where(tag: tag_param).destroy_all

    render json: tag_state_json
  end

  def destroy_past_tags
    if ActiveModel::Type::Boolean.new.cast(params[:only_ignored])
      current_account.past_tags.where(tag: current_account.ignored_tags.select(:tag)).destroy_all
    else
      current_account.past_tags.destroy_all
    end

    render json: tag_state_json
  end

  def destroy_ignored_tags
    current_account.ignored_tags.destroy_all
    current_account.poisoned_pill_tags.destroy_all

    render json: tag_state_json
  end

private
  def tag_param
    params[:tag].to_s
  end

  def tag_state_json
    {
      tag: tag_param,
      ignored_tags: ignored_tags,
      favorite_tags: favorite_tags,
      past_tags: current_account.past_tags.left_outer_joins(:community).select('account_tags.tag', 'communities.title', 'communities.community_account').map { |tag| {name: tag.title || tag.tag, tag: tag.tag, image_url: Community.profile_image_from_account(tag.community_account)} }
    }
  end
end
