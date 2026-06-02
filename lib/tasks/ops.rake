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
end
