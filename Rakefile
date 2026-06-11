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
  desc 'Run one index pass.'
  task once: :environment do
    PostCleanupJob.perform_now
    PostIndexJob.perform_now
    newest_post_created_at = Post.maximum(:created_at)
    message = if newest_post_created_at
      age_seconds = Time.current - newest_post_created_at
      age = ActiveSupport::Duration.build(age_seconds).parts.slice(:days, :hours, :minutes).map { |unit, value| "#{value.to_i} #{unit}" }.join(', ')
      "Newest indexed post: #{newest_post_created_at.iso8601} (#{age.presence || 'under 1 minute'} old)"
    else
      'Newest indexed post: none'
    end

    puts message
  end

  desc 'Main index process.'
  task run: :environment do
    loop do
      begin
        Rake::Task['index:once'].execute

        sleep 3
      rescue => e
        puts "Process interrupted: #{e}"

        sleep 3
      end
    end
  end
end
