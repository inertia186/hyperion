# Add your own tasks in files placed in lib/tasks ending in .rake,
# for example lib/tasks/capistrano.rake, and they will automatically be available to Rake.

require_relative 'config/application'

Rails.application.load_tasks

namespace :export do
  desc 'Exports read posts intended for populating seeds.rb.'
  task read_posts: :environment do
    ReadPost.find_each do |read_post|
      puts "read_posts.find_or_create_by(post: Post.find_by(author: '#{read_post.post.author}', permlink: '#{read_post.post.permlink}'))"
    end
  end
  
  desc 'Exports favorite tags intended for populating seeds.rb.'
  task favorite_tags: :environment do
    AccountTag::Favorite.find_each do |tag|
      puts "favorite_tags.find_or_create_by(tag: '#{tag.tag}')"
    end
  end
end

namespace :index do
  desc 'Main index process.'
  task run: :environment do
    loop do
      begin
        PostCleanupJob.perform_now
        PostIndexJob.perform_now
      rescue => e
        puts "Process interrupted: #{e}"
        
        sleep 3
      end
    end
  end  
end
