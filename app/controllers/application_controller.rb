require 'open-uri'

class ApplicationController < ActionController::Base
  include Pagy::Method
  
  DEFAULT_NODE_URLS = (ENV['HYPERION_NODE_URLS'] || 'https://api.hive.blog').split(',')
  
  helper_method :best_title
  helper_method :current_account
  helper_method :post_to_slug
  helper_method :bridge
  helper_method :with_blacklist_sources
  helper_method :without_blacklist_sources
  helper_method :post_body
  helper_method :read_posts, :mark_post_as_read, :post_read?
  helper_method :best_tag_name, :tag_unread_count, :related_tag_post_count
  helper_method :favorite_tags, :ignored_tags, :past_tags, :poisoned_pill_tags
  helper_method :random_oneliner
  helper_method :tags_community_count, :tags_count
  
  before_action :sign_in
private
  def tags_community_count(options = {community: true})
    community = !!options[:community]
    
    Rails.cache.fetch("tags-count-community-#{community}", expires_in: 10.minutes) do
      Tag.community(community).distinct.count(:tag)
    end
  end
  
  def tags_count
    Rails.cache.fetch("tags-count", expires_in: 10.minutes) do
      TagCount.count
    end
  end
  
  def best_title
    best_title = ''
    tags = [params[:tag]].flatten.join(' ').split(/[ \+]/)
    
    tags.each do |tag|
      best_tag = best_tag_name tag
      
      best_title += best_title.empty? ? best_tag : ", #{best_tag}"
    end
    
    if best_title.empty? || best_title == '-'
      best_title = 'Hyperion'
    else
      best_title += ' - Hyperion'
    end
    
    best_title
  end
  
  def sign_in
    unless !!current_account
      session[:return_to] ||= request.original_url
      
      redirect_to new_session_url 
    end
  end
  
  def current_account
    session[:current_account] || bearer_token_account
  end

  def bearer_token_account
    return @bearer_token_account if defined?(@bearer_token_account)

    @bearer_token_account = AgentAccessToken.account_for(bearer_token)
  end

  def bearer_token
    pattern = /\ABearer\s+(.+)\z/i
    authorization = request.authorization.to_s
    match = authorization.match(pattern)

    match && match[1].strip
  end
  
  def post_to_slug(*args)
    case args[0]
    when Hashie::Mash
      post = args[0]
      
      [post.author, post.permlink].join('/').parameterize
    when String then args.join('/').parameterize
    when NilClass then ''
    end
  end
  
  def post_body(post)
    render_post_body(post)
  end
  
  def render_post_body(post, body_override = Post::DISPLAY_BODY_UNSET)
    original_body = body_override.equal?(Post::DISPLAY_BODY_UNSET) ? post.display_body : post.display_body(body_override)
    sanitized_body = ActionController::Base.helpers.sanitize(original_body, tags: ALLOWED_TAGS, attributes: ALLOWED_ATTRIBUTES)
    markdown_ready_body = normalize_post_markdown(sanitized_body)
    markdown_ready_body = markdown_ready_body.gsub('>', " markdown=\"span\">\n")
    markdown_ready_body = markdown_ready_body.gsub(/<\/(.*) markdown="span">/, "\n</\\1>")
    kramdown = Kramdown::Document.new(markdown_ready_body)
    html_body = harden_post_body_html(kramdown.to_html)
    
    html_body.html_safe
  end

  def normalize_post_markdown(body)
    body.gsub(/^([ \t]{0,3}\#{1,6})(?=\S)/) { "\\#{$1}" }
  end

  def harden_post_body_html(html)
    fragment = Nokogiri::HTML::DocumentFragment.parse(html)

    fragment.css('iframe').each do |iframe|
      src = iframe['src'].to_s

      begin
        uri = URI.parse(src)
      rescue URI::InvalidURIError
        iframe.remove
        next
      end

      unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)
        iframe.remove
        next
      end

      if peakd_post_preview_embed_uri?(uri)
        iframe['class'] = [iframe['class'], 'peakd-embed-preview'].compact.join(' ')
        iframe['width'] = '100%'
        iframe['height'] = '590'
        iframe['sandbox'] = 'allow-scripts allow-same-origin allow-popups'
        iframe['data-peakd-resize-bound'] = 'true'
        iframe['data-peakd-resize-loaded'] = 'true'
        iframe['spellcheck'] = 'false'
        parent = iframe.parent
        if parent&.element? && parent['class'].to_s.split.include?('videoWrapper')
          parent['class'] = [parent['class'], 'peakd-embed-wrapper'].compact.join(' ')
        end
      end

      iframe['loading'] = 'lazy'
    end

    fragment.to_html
  end

  def peakd_post_preview_embed_uri?(uri)
    uri.is_a?(URI::HTTPS) &&
      uri.host == 'embed.peakd.com' &&
      uri.path.match?(%r{\A/[A-Za-z0-9_-]+/@[a-z0-9](?:[a-z0-9.-]{1,14}[a-z0-9])?/[a-z0-9][a-z0-9-]{0,255}\z}i)
  end
  
  def post_read?(post)
    current_account.post_read?(post)
  end
  
  def clear_read_posts
    current_account.read_posts.destroy_all
  end
  
  def cleanup_read_posts
    # TODO
    return if session[:read_posts].nil?
    
    session[:read_posts] = session[:read_posts].select do |k, v|
      v >= 7.days.ago
    end
  end
  
  def best_tag_name(tag, post = nil)
    return '&lt;Any Tag&gt;'.html_safe unless tag.present?
    
    @best_tag_name ||= {}
    
    if !!post && !!post.community && post.community.name == tag
      @best_tag_name[tag] ||= post.community.title
    elsif tag =~ Tag::COMMUNITY_CATEGORY_REGEX
      # This condition will only do a community look-up if the tag looks like
      # a community *and* is mentioned in the post.category, which guards
      # against doing lookups when an author tries erroniously to cross-post by
      # tagging multiple communities.
      @best_tag_name[tag] ||= Tag.best_tag_name(tag)
    else
      tag
    end
  end
  
  def tag_unread_count(tag, async = false)
    if async
      @all_posts.unread(by: current_account, include_muted: !session[:muted_authors_enabled]).tagged_any(tag).count
    elsif tag.to_s == ''
      @all_posts.unread(by: current_account, include_muted: !session[:muted_authors_enabled]).count
    else
      all_tag_unread[tag] || 0
    end
  end
  
  def related_tag_post_count
    Rails.cache.fetch("related-tags-cloud-#{@tag}", expires_in: 10.minutes) do
      if @tag.blank?
        tag_values = @related_tags.map { |(_name, tag)| tag }
        TagCount.group_by_tag_count(tags: tag_values, limit: tag_values.size)
      else
        Post.joins(:tags).active.tagged_any(@tag).group_by_tag_count
      end
    end
  end
  
  def all_tag_unread
    @all_tag_unread ||= if @only_blacklisted
      with_blacklist_sources(Post.active).joins(:tags).unread(by: current_account, include_muted: !session[:muted_authors_enabled]).group('tags.tag').count
    elsif @only_deleted
      Post.deleted.joins(:tags).unread(by: current_account, include_muted: !session[:muted_authors_enabled]).group('tags.tag').count
    elsif @only_ignored
      Post.active.joins(:tags).unread(by: current_account, include_muted: !session[:muted_authors_enabled], allow_tag: ignored_tags).group('tags.tag').count
    else
      Post.active.joins(:tags).unread(by: current_account, include_muted: !session[:muted_authors_enabled]).group('tags.tag').count
    end
  end

  def with_blacklist_sources(relation)
    return relation.none if current_blacklist_sources.empty?

    relation.where(blacklist_source_sql, current_blacklist_sources)
  end

  def without_blacklist_sources(relation)
    return relation if current_blacklist_sources.empty?

    relation.where("NOT #{blacklist_source_sql}", current_blacklist_sources)
  end

  def current_blacklist_sources
    @current_blacklist_sources ||= current_account.blacklist_sources
  end

  def blacklist_source_sql
    "EXISTS (SELECT 1 FROM json_array_elements(posts.blacklist_reasons) AS blacklist_reason WHERE blacklist_reason->>'account' IN (?))"
  end
  
  def favorite_tags
    @favorite_tags ||= current_account.favorite_tags.pluck(:tag)
  end
  
  def ignored_tags
    @ignored_tags ||= current_account.ignored_tags.pluck(:tag)
  end
  
  def past_tags
    @past_tags ||= current_account.past_tags.pluck(:tag)
  end
  
  def poisoned_pill_tags
    @poisoned_pill_tags ||= current_account.poisoned_pill_tags.pluck(:tag)
  end
  
  def cycle_node_url
    DEFAULT_NODE_URLS.sample
  end
  
  def reset_bridge
    @bridge = nil
  end
  
  def bridge
    @bridge ||= Hive::Bridge.new(url: cycle_node_url)
  end
  
  def random_oneliner
    loop do
      oneliner = CGI.escapeHTML(oneliners.reject(&:empty?).sample.split("\n").join(' '))
      
      return oneliner unless oneliner.include?('&')
    end
  end
  
  def oneliners
    File.open(Rails.root.join('app', 'assets', 'text', 'jokes.txt')) do |f|
      f.read.split("\n\n")
    end
  end
end
