require 'json'
require 'action_dispatch/testing/integration'
require_relative '../test/support/fake_hive'

raise 'Scratch test database required' unless Rails.env.test? && ActiveRecord::Base.connection.select_value('SELECT current_database()') == 'hyperion_hills_test'
FakeHive.start
FakeHive.disable_hafsql_and_hafbe
account = Account.find_by!(name: 'fixture-curator')
_, token = AgentAccessToken.issue_for!(account)
client = ActionDispatch::Integration::Session.new(Rails.application)
client.host!('localhost')
get = lambda do |path|
  client.get(path, headers: {'Authorization' => "Bearer #{token}"})
  raise "#{path}: #{client.response.status}" unless client.response.status == 200
  JSON.parse(client.response.body)
end
session = get.call('/api/v1/session')
session['wallet'] = {'provider' => 'hivesigner'}
posts = get.call('/api/v1/posts?sort=latest&limit=30')
raise 'At least two fixture posts required' unless posts['posts'].size >= 2
details = posts['posts'].to_h do |post|
  Post.find(post['id']).update_columns(body: "## Benchmark body #{post['id']}\n\nReadable post content.\n\n[Jump](#benchmark-body-#{post['id']})\n\n<script>window.unsafePostScript = true</script>")
  [post['id'], get.call("/api/v1/posts/#{post['id']}")]
end
timeline = get.call('/api/v1/posts/timeline?time_zone=UTC')
fixture = {session: session, posts: posts, details: details, timeline: timeline}
output = Rails.root.join('benchmarks/baselines/2026-10-25-startup-fixtures.json')
raise 'Fixture already exists' if output.exist?
output.write(JSON.pretty_generate(fixture) + "\n")
raise 'Unhandled upstream call' unless FakeHive.stop.empty?
