module ApplicationHelper
  include Pagy::Frontend
  
  def icon(icon_name, options = {})
    file = File.read(Rails.root.join('app', 'assets', 'images', 'bootstrap-icons', "#{icon_name}.svg"))
    icon = Nokogiri::HTML::DocumentFragment.parse file
    svg = icon.at_css 'svg'
    
    svg['class'] += " " + options[:class] if options[:class].present?
    svg['fill'] = options[:fill] if options[:fill].present?
    svg['stroke'] = options[:stroke] if options[:stroke].present?
    
    icon.to_html.html_safe
  end
  
  def icon_url(icon_name)
    asset_url("images/bootstrap-icon/#{icon_name}.svg")
  end
end
