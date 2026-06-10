class Api::V1::AgentController < Api::V1::BaseController
  protect_from_forgery except: %i(mark_read create_ignored_tags destroy_ignored_tags)
  skip_before_action :sign_in, only: :show_session
  before_action :validate_agent_origin!, only: %i(mark_read create_ignored_tags destroy_ignored_tags)

  def show_session
    render json: agent.session_payload
  end

  def digest
    render json: agent.digest(params.permit!.to_h)
  end

  def post
    render json: agent.post_payload(params[:id])
  end

  def vote_link
    render json: agent.vote_link(params[:id], params[:weight])
  end

  def mark_read
    render json: agent.mark_read(agent_params)
  end

  def create_ignored_tags
    render json: agent.ignore_tags(agent_params), status: :created
  end

  def destroy_ignored_tags
    render json: agent.unignore_tags(agent_params)
  end

private
  def agent
    @agent ||= HyperionAgent.new(account: current_account, session: session_store, url_helpers: self)
  end

  def session_store
    request.session
  end

  def agent_params
    params.permit!.to_h.deep_symbolize_keys
  end

  def validate_agent_origin!
    return if request.origin.blank?

    origin = URI.parse(request.origin)
    return if origin.scheme == request.scheme && origin.host == request.host && origin.port == request.port

    render json: {error: 'Forbidden origin'}, status: :forbidden
  rescue URI::InvalidURIError
    render json: {error: 'Forbidden origin'}, status: :forbidden
  end
end
