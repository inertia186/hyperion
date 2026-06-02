namespace :images do
  desc 'Remove expired image proxy cache entries'
  task cleanup: :environment do
    ImageProxy.cleanup_expired!
  end
end
