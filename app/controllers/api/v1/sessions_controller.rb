class Api::V1::SessionsController < Api::V1::BaseController
  skip_before_action :sign_in

  def show
    unless current_account
      render json: {authenticated: false, login_url: new_session_url}
      return
    end

    render json: {
      authenticated: true,
      account: {
        id: current_account.id,
        name: current_account.name,
        avatar_url: "https://images.hive.blog/u/#{current_account.name}/avatar"
      },
      preferences: {
        muted_authors_enabled: !!session[:muted_authors_enabled],
        only_favorite_tags: !!session[:only_favorite_tags],
        theme: current_account.theme,
        minimum_reputation: current_account.minimum_reputation,
        hivewatchers_blacklist_enabled: current_account.hivewatchers_blacklist_enabled?,
        hivesigner_available: session[:hivesigner_access_token].present?
      },
      blacklist_sources: current_account.blacklist_source_catalog,
      offchain_blacklist_sources: current_account.offchain_blacklist_source_catalog,
      counts: {
        read_posts: current_account.read_posts.count,
        ignored_tags: ignored_tags.size,
        poisoned_pill_tags: poisoned_pill_tags.size,
        favorite_tags: favorite_tags.size,
        past_tags: past_tags.size,
        tags: tags_count
      },
      muted_authors: current_account.muted_authors,
      ignored_tags: ignored_tags,
      poisoned_pill_tags: poisoned_pill_tags,
      favorite_tags: favorite_tags,
      past_tags: current_account.past_tags.left_outer_joins(:community).select('account_tags.tag', 'communities.title', 'communities.community_account').map { |tag| {name: tag.title || tag.tag, tag: tag.tag, image_url: Community.profile_image_from_account(tag.community_account)} }
    }
  end
end
