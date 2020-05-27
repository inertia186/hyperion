require 'open-uri'

class ApplicationController < ActionController::Base
  include Pagy::Backend
  
  DEFAULT_NODE_URLS = %w(https://api.openhive.network http://anyx.io)
  
  helper_method :current_account
  helper_method :post_to_slug
  helper_method :bridge
  helper_method :post_body
  helper_method :read_posts, :mark_post_as_read, :post_read?
  helper_method :best_tag_name, :tag_unread_count, :related_tag_post_count, :ignored_tags
  helper_method :random_oneliner
  
  before_action :sign_in
private
  def sign_in
    redirect_to new_session_url unless !!current_account
  end
  
  def current_account
    session[:current_account]
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
    original_body = post.body
    sanitized_body = ActionController::Base.helpers.sanitize(original_body, tags: ALLOWED_TAGS, attributes: ALLOWED_ATTRIBUTES)
    markdown_ready_body = sanitized_body.gsub('>', " markdown=\"span\">\n")
    markdown_ready_body = markdown_ready_body.gsub(/<\/(.*) markdown="span">/, "\n</\\1>")
    kramdown = Kramdown::Document.new(markdown_ready_body)
    html_body = kramdown.to_html
    
    html_body.html_safe
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
    return '&lt;No Tag&gt;'.html_safe unless tag.present?
    
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
      Post.active.unread(by: current_account).tagged_any(tag).count
    elsif tag.to_s == ''
      Post.active.unread(by: current_account).count
    else
      all_tag_unread[tag] || 0
    end
  end
  
  def related_tag_post_count
    @related_tag_post_count ||= Post.joins(:tags).active.tagged_any(@tag).group_by_tag_count
  end
  
  def all_tag_unread
    @all_tag_unread ||= if @only_blacklisted
      Post.active.blacklisted.joins(:tags).unread(by: current_account).group('tags.tag').count
    elsif @only_deleted
      Post.deleted.joins(:tags).unread(by: current_account).group('tags.tag').count
    elsif @only_ignored
      Post.active.joins(:tags).unread(by: current_account, allow_tag: ignored_tags).group('tags.tag').count
    else
      Post.active.joins(:tags).unread(by: current_account).group('tags.tag').count
    end
  end
  
  def ignored_tags
    @ignored_tags ||= current_account.ignored_tags.pluck(:tag)
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
