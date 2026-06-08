require 'json'

required_account = ->(args) { args[:account].presence || raise(ArgumentError, 'account is required') }

namespace :ops do
  desc 'Print read-only inbox diagnostics for an account'
  task :inbox, [:account] => :environment do |_task, args|
    puts JSON.pretty_generate(OpsDiagnostics.inbox(required_account.call(args)))
  end

  desc 'Print read-only reputation diagnostics for an account'
  task :reputation, [:account] => :environment do |_task, args|
    puts JSON.pretty_generate(OpsDiagnostics.reputation(required_account.call(args)))
  end

  desc 'Print read-only blacklist diagnostics'
  task blacklist: :environment do
    puts JSON.pretty_generate(OpsDiagnostics.blacklist)
  end

  desc 'Refresh persisted payouts for recent posts. Usage: rake ops:refresh_payouts[7,100]'
  task :refresh_payouts, [:days, :limit] => :environment do |_task, args|
    days = (args[:days].presence || ENV.fetch('PAYOUT_REFRESH_DAYS', 7)).to_f
    limit = (args[:limit].presence || ENV.fetch('PAYOUT_REFRESH_LIMIT', PostPayoutRefresh::DEFAULT_LIMIT)).to_i
    result = PostPayoutRefresh.new(window: days.days, limit: limit).call

    puts JSON.pretty_generate({
      checked: result.checked,
      updated: result.updated,
      unavailable: result.unavailable,
      failed: result.failed,
      errors: result.errors
    })
  end
end
