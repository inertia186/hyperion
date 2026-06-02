class Api::V1::ImagesController < Api::V1::BaseController
  PLACEHOLDER_SVG = <<~SVG.freeze
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="Image unavailable">
      <rect width="640" height="360" fill="#f1f5f9"/>
      <rect x="1" y="1" width="638" height="358" fill="none" stroke="#cbd5e1" stroke-width="2"/>
      <path d="M274 210l34-42 28 34 18-22 42 52H244l30-22z" fill="#94a3b8"/>
      <circle cx="386" cy="135" r="18" fill="#cbd5e1"/>
      <text x="320" y="282" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#475569">Image unavailable</text>
    </svg>
  SVG

  def proxy
    result = ImageProxy.new(url: params[:url], size: params[:size]).call

    expires_in 1.day, public: false
    send_data result.body, type: result.content_type, disposition: 'inline'
  rescue ImageProxy::Error => e
    Rails.logger.warn "Unable to proxy image #{params[:url].inspect}: #{e.message}"
    expires_in 5.minutes, public: false
    send_data PLACEHOLDER_SVG, type: 'image/svg+xml', disposition: 'inline'
  end
end
