require 'open-uri'

class PostIndexJob < ApplicationJob
  extend Memoist
  
  DEPLORABLES = %w(crystalliu anfeng)
  
  queue_as :default
  
  DEFAULT_NODE_URLS = %w(https://api.openhive.network)
  BLOCK_INTERVAL_SEC = 3
  BLOCK_INTERVAL_7_DAYS = (Time.now.utc - 7.days.ago) / BLOCK_INTERVAL_SEC
  MAX_TAGS = 50
  
  def perform(*args)
    database_api = Hive::DatabaseApi.new(url: DEFAULT_NODE_URLS.sample)
    stream = Hive::Stream.new(url: DEFAULT_NODE_URLS.sample)
    head_block_num, blockchain_time = database_api.get_dynamic_global_properties do |dgpo|
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
      stream.blocks(at_block_num: start_block_num) do |block, block_num|
        if block.nil?
          puts "Retrying at block number: #{start_block_num} ..."
          sleep 3
          
          throw :retry
        end
        
        Post.transaction do
          start_block_num = block_num
          timestamp = Time.parse(block.timestamp + 'Z')
          transactions = block.transactions
          comment_batch = {}
          delete_comments = []
          mutes = []
          blog_history_limit = (Time.now - timestamp < 60) ? 1 : 100
          
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
          
          process_comments(comment_batch, block_num, timestamp, blog_history_limit)
          process_delete_comments(delete_comments, timestamp)
          process_mutes(mutes)
        end
      end
    end
  end
  
  def process_comments(comment_batch, block_num, timestamp, blog_history_limit)
    comment_batch.each do |trx_id, comments|
      comments.each do |comment|
        comment_params = comment.slice('title', 'body')
        comment_params[:category] = comment.parent_permlink
        comment_params[:metadata] = JSON[comment.json_metadata] rescue {}
        comment_params[:block_num] = block_num
        comment_params[:trx_id] = trx_id
        comment_params[:blacklisted] = blacklist.include?(comment.author)
        comment_params[:created_at] = timestamp
        
        post = Post.find_or_initialize_by(comment.slice('author', 'permlink'))
        post.update(comment_params)
        
        if post.body =~ Post::DIFF_MATCH_PATCH_PATTERN
          Rails.logger.info "[#{post.author}] - Looks like an edit.  Fetching latest ..."
          
          # Detect if the body contains an edit.  Need to fetch the full
          # body because there's no guarantee we saw the complete previous
          # version at any point.
          
          post.fetch_latest
          post.save
        elsif !post.in_blog?(blog_history_limit)
          if blog_history_limit == 1
            Rails.logger.info "[#{post.author}] - Not in the last blog entry.  Fetching latest ..."
          else
            Rails.logger.info "[#{post.author}] - Not in the last #{blog_history_limit} blog entries.  Fetching latest ..."
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
          Rails.logger.info "[#{post.author}] - New post."
        end
        
        if post.persisted?
          tags = [comment.parent_permlink] + ([post.metadata.fetch('tags')].flatten rescue [])
          
          tags.map(&:downcase).uniq.first(MAX_TAGS).each do |tag|
            next if tag.size > 32
            
            post.tags.find_or_create_by(tag: tag, category: tag == comment.parent_permlink)
          end
        else
          Rails.logger.error post.errors.messages
        end
      end
    end
  end
  
  def process_delete_comments(delete_comments, timestamp)
    delete_comments.each do |delete_comment|
      count = Post.where(delete_comment.slice('author', 'permlink')).update_all(deleted_at: timestamp)
      
      if count > 0
        Rails.logger.info "[#{delete_comment.author}] - Deleted post."
        
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
    open('https://raw.githubusercontent.com/themarkymark-steem/buildawhaleblacklist/master/blacklist.txt').read.split("\n")
  end
  memoize :blacklist
end
