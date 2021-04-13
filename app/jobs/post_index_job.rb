require 'open-uri'

class PostIndexJob < ApplicationJob
  extend Immutable
  extend Memoist
  
  DEPLORABLES = %w(crystalliu anfeng nchain crystalan crystal.liu crystalliuyifei hkex liuyifei lyf)
  TRUSTED_COMMUNITIES = %w(hive-163399 hive-196037 hive-139531 hive-136001)
  
  queue_as :default
  
  DEFAULT_NODE_URLS = (ENV['HYPERION_NODE_URLS'] || 'https://api.openhive.network,https://api.hive.blog,http://anyx.io,https://api.hivekings.com,https://hived.privex.io,https://rpc.ausbit.dev').split(',')
  HIVE_MAX_WITNESSES = 21
  BLOCK_INTERVAL_SEC = 3
  BLOCK_INTERVAL_7_DAYS = (Time.now.utc - 7.days.ago) / BLOCK_INTERVAL_SEC
  BLOCK_INTERVAL_DAY = (Time.now.utc - 1.day.ago) / BLOCK_INTERVAL_SEC
  BLOCK_INTERVAL_SHUFFLE_WINDOW = BLOCK_INTERVAL_SEC * HIVE_MAX_WITNESSES
  MAX_TAGS = 50
  
  def perform(*args)
    head_block_num, blockchain_time = PostIndexJob::database_api.get_dynamic_global_properties do |dgpo|
      [dgpo.head_block_number, Time.parse(dgpo.time + 'Z')]
    end
    start_block_num = (head_block_num - BLOCK_INTERVAL_7_DAYS).to_i
    
    Rails.logger.info "Active posts must be after block_num: #{start_block_num}"
    
    if start_block_num < (maximum_block_num = Post.maximum(:block_num) || 0)
      Rails.logger.info "Resuming index after block_num: #{maximum_block_num}"
      
      start_block_num = maximum_block_num + 1
    else
      Rails.logger.info "Skipping #{start_block_num - maximum_block_num} blocks (too old to index)."
    end
    
    Rails.logger.info "Starting on block_num: #{start_block_num}"
    Rails.logger.info "Blacklist size: #{blacklist(true).size}" # reload blacklist
    
    catch :retry do
      PostIndexJob::stream.blocks(at_block_num: start_block_num) do |block, block_num|
        if block.nil?
          puts "Retrying at block number: #{start_block_num} ..."
          sleep 3
          
          PostIndexJob::api_reset
          throw :retry
        end
        
        # Over one shuffle window of catch-up, don't bother to check with
        # "in_blog?"" method.
        overdue_catch_up = head_block_num - block_num > BLOCK_INTERVAL_SHUFFLE_WINDOW
        
        Post.transaction do
          start_block_num = block_num
          timestamp = Time.parse(block.timestamp + 'Z')
          transactions = block.transactions
          comment_batch = {}
          delete_comments = []
          mutes = []
          
          transactions.each_with_index do |trx, index|
            trx_id = block.transaction_ids[index]
            ops = trx.operations
            comment_batch[trx_id] ||= []
            comment_batch[trx_id] += ops.map do |op|
              next unless op.type == 'comment_operation'
              next unless op.value.parent_author.to_s == ''
              next if DEPLORABLES.include? op.value.author
              
              op.value
            end.compact
            
            delete_comments += ops.map do |op|
              next unless op.type == 'delete_comment_operation'
              next if DEPLORABLES.include? op.value.author
              
              op.value
            end.compact
            
            mutes += ops.map do |op|
              next unless op.type == 'custom_json_operation'
              next if op.value.required_posting_auths.empty?
              next if (DEPLORABLES & op.value.required_posting_auths).any?
              
              author = op.value.required_posting_auths[0]
              # next if Account.where(name: author).none?
              
              payload = JSON[op.value.json] rescue []
              next unless payload[0] == 'follow'
              next unless [payload[1]['what']].flatten.include? 'ignore'
              
              payload[1]
            end.compact
          end
          
          process_comments(comment_batch, block_num, timestamp, overdue_catch_up)
          process_delete_comments(delete_comments, timestamp)
          process_mutes(mutes)
        end
      end
    rescue Hive::UnknownError => e
      if e.to_s.include? 'Request Entity Too Large'
        Hive::BlockApi.const_set 'MAX_RANGE_SIZE', 1
        throw :retry
      else
        raise e
      end
    end
  end
  
  def process_comments(comment_batch, block_num, timestamp, overdue_catch_up = false)
    comment_batch.each do |trx_id, comments|
      comments.each do |comment|
        comment = comment.with_indifferent_access
        comment_params = comment.slice(:title, :body)
        comment_params[:category] = comment[:parent_permlink]
        comment_params[:metadata] = JSON[comment[:json_metadata]] rescue {}
        comment_params[:block_num] = block_num
        comment_params[:trx_id] = trx_id
        comment_params[:blacklisted] = blacklist.include?(comment[:author])
        comment_params[:created_at] = timestamp
        
        comment_params = comment_params.with_indifferent_access
        
        post = Post.find_or_initialize_by(comment.slice(:author, :permlink))
        post.update(comment_params)
        
        if !(post.body =~ Post::DIFF_MATCH_PATCH_PATTERN) && post.body =~ /@@/
          Rails.logger.warn "[#{post.author}/#{post.permlink}] - Non-regex edit match."
        end
        
        if post.body.nil?
          Rails.logger.info "[#{post.author}] - Fixing previous fetch.  Fetching latest ..."
          
          post.fetch_latest
          post.save
        elsif post.body =~ Post::DIFF_MATCH_PATCH_PATTERN
          Rails.logger.info "[#{post.author}] - Looks like an edit.  Fetching latest ..."
          
          # Detect if the body contains an edit.  Need to fetch the full
          # body because there's no guarantee we saw the complete previous
          # version at any point.
          
          post.fetch_latest
          post.save
        elsif !post.in_blog?(overdue_catch_up ? 1000 : 100)
          if overdue_catch_up
            Rails.logger.info "[#{post.author}/#{post.permlink}] - Not in the last blog entry (trying to catch up).  Fetching latest ..."
          else
            Rails.logger.info "[#{post.author}/#{post.permlink}] - Not in the last blog entry.  Fetching latest ..."
          end
          
          # Attempt to determine if this post is in the latest blog for
          # this author.  If not, fetch the latest version because it
          # might be a non-standard edit.
          
          # If it's a non-standard edit, likely someone is using a tool
          # to update an old post, perhaps to add/update metadata like a
          # canonical url.  But this looks identical to a new post, from
          # the stream's perspective.
          
          post.fetch_latest
          post.save
        else
          Rails.logger.info "[#{post.author}/#{post.permlink}] - New post."
        end
        
        if post.persisted?
          tags = [comment[:parent_permlink]] + ([post.metadata.fetch('tags')].flatten rescue [])
          tags = tags.map(&:downcase) rescue [] # Deals with malformed tags.
          
          tags.uniq.first(MAX_TAGS).each do |tag|
            next if tag.size > 32
            
            post.tags.find_or_create_by(tag: tag, category: tag == comment[:parent_permlink])
          end
        else
          Rails.logger.error post.errors.messages
        end
      end
    end
  end
  
  def process_delete_comments(delete_comments, timestamp)
    delete_comments.each do |delete_comment|
      delete_comment = delete_comment.with_indifferent_access
      count = Post.where(delete_comment.slice(:author, :permlink)).update_all(deleted_at: timestamp)
      
      if count > 0
        Rails.logger.info "[#{delete_comment[:author]}] - Deleted post."
        
        PostCleanupJob.perform_later
      end
    end
  end
  
  def process_mutes(mutes)
    mutes.each do |mute|
      account = Account.find_by(name: mute['follower'])
      
      AccountRefreshJob.perform_later(account.to_param) if !!account
    end
  end
  
  def blacklist
    return []
    
    # Old method was to grab the published list.
    # @blacklist_data ||= begin
    #   URI.open('https://raw.githubusercontent.com/themarkymark-steem/buildawhaleblacklist/master/blacklist.txt').read
    # rescue => e
    #   Rails.logger.error "Unable to read blacklist: #{e}"
    # 
    #   ''
    # end.split("\n")
    
    # Instead, we now grab the list from trusted communities.
    
    return @blacklist if !!@blacklist
    
    @blacklist = []
    
    TRUSTED_COMMUNITIES.each do |community_name|
      community = Community.find_or_create_by(name: community_name)
      community.refresh_community
      
      begin
        @blacklist += community.muted_roles
      rescue => e
        Rails.logger.warn "Attempting to refresh blacklist: #{e} (retrying)"
        sleep 3
        
        redo
      end
    end
    
    @blacklist.uniq
  end
  memoize :blacklist
end
