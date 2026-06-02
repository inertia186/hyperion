class Api::V1::ImagesController < Api::V1::BaseController
  def proxy
    result = ImageProxy.new(url: params[:url], size: params[:size]).call

    expires_in 1.day, public: false
    send_data result.body, type: result.content_type, disposition: 'inline'
  rescue ImageProxy::Error => e
    Rails.logger.warn "Unable to proxy image #{params[:url].inspect}: #{e.message}"
    head :bad_request
  end
end
