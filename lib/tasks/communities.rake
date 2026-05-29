namespace :communities do
  desc 'Ensure trusted blacklist source communities are present'
  task seed_trusted: :environment do
    Community.ensure_present!(PostIndexJob::TRUSTED_COMMUNITIES)
  end
end
