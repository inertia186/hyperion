class Api::V1::PreferencesController < Api::V1::BaseController
  def mute
    enabled = boolean_param(:enabled)
    enabled = !session[:muted_authors_enabled] if enabled.nil?

    session[:muted_authors_enabled] = enabled
    current_account.refresh_muted_authors if enabled

    render json: {
      muted_authors_enabled: !!session[:muted_authors_enabled],
      muted_authors: current_account.reload.muted_authors
    }
  end

  def only_favorite_tags
    enabled = boolean_param(:enabled)
    enabled = !session[:only_favorite_tags] if enabled.nil?

    session[:only_favorite_tags] = enabled

    render json: {only_favorite_tags: !!session[:only_favorite_tags]}
  end

  def blacklists
    current_account.update_hivewatchers_blacklist_enabled!(params[:hivewatchers_blacklist_enabled]) if params.key?(:hivewatchers_blacklist_enabled)
    PostIndexJob.clear_blacklist_cache!

    render json: {
      blacklist_sources: current_account.blacklist_source_catalog,
      offchain_blacklist_sources: current_account.offchain_blacklist_source_catalog,
      hivewatchers_blacklist_enabled: current_account.hivewatchers_blacklist_enabled?,
      message: 'Blacklists are managed through Hive blacklist and follow_blacklist relationships.'
    }
  end

  def theme
    current_account.update_theme!(params[:theme])

    render json: {theme: current_account.theme}
  end

  def minimum_reputation
    current_account.update_minimum_reputation!(params[:minimum_reputation])

    render json: {minimum_reputation: current_account.minimum_reputation}
  end

private
  def boolean_param(name)
    return nil unless params.key?(name)

    params[name] == true || params[name].to_s == 'true' || params[name].to_s == '1'
  end
end
