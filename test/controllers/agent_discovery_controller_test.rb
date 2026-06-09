require 'test_helper'

class AgentDiscoveryControllerTest < ActionController::TestCase
  tests AgentDiscoveryController

  test 'routes public agent discovery paths' do
    assert_routing(
      {method: :get, path: '/.well-known/hyperion-agent.json'},
      {controller: 'agent_discovery', action: 'show', format: :json}
    )
    assert_routing(
      {method: :get, path: '/llms.txt'},
      {controller: 'agent_discovery', action: 'llms'}
    )
    assert_routing(
      {method: :get, path: '/openapi.json'},
      {controller: 'agent_discovery', action: 'openapi', format: :json}
    )
  end

  test 'well-known discovery describes agent capabilities' do
    get :show, format: :json

    assert_response :success
    assert_equal 'application/json', response.media_type
    payload = response_json
    assert_equal 'Hyperion', payload.fetch('name')
    assert_equal 'session_cookie', payload.dig('authentication', 'type')
    assert payload.dig('authentication', 'auth_challenge_url').ends_with?('/api/v1/agent/auth_challenges')
    assert_includes payload.dig('authentication', 'instructions').join(' '), 'POST /api/v1/agent/auth_challenges'
    assert_equal 'POST /api/v1/agent/auth_challenges', payload.dig('authentication', 'hivesigner_flow', 'start')
    assert payload.dig('examples', 'redeem_hivesigner_code', 'reuse_challenge_cookies')
    assert_equal '_hyperion', payload.dig('authentication', 'cookie_name')
    assert_includes payload.fetch('capabilities'), 'auth_challenge'
    assert_includes payload.fetch('capabilities'), 'vote_link'
    assert payload.dig('links', 'openapi').ends_with?('/openapi.json')
    assert payload.dig('links', 'mcp').ends_with?('/mcp')
  end

  test 'llms txt gives concise agent instructions' do
    get :llms

    assert_response :success
    assert_equal 'text/plain', response.media_type
    assert_includes response.body, 'Hyperion Agent Guide'
    assert_includes response.body, 'Recommended TUI/CLI authentication flow'
    assert_includes response.body, 'same cookie jar'
    assert_includes response.body, '/api/v1/agent/digest'
    assert_includes response.body, 'HiveSigner'
  end

  test 'openapi document includes agent and mcp paths' do
    get :openapi, format: :json

    assert_response :success
    payload = response_json
    assert_equal '3.1.0', payload.fetch('openapi')
    assert_includes payload.dig('info', 'description'), 'auth challenge flow'
    assert_includes payload.dig('x-hyperion-agent', 'authentication', 'instructions').join(' '), 'HYP-* code'
    assert payload.dig('x-hyperion-agent', 'examples', 'mcp_tool_call', 'send_session_cookie')
    assert payload.fetch('paths').key?('/api/v1/agent/auth_challenges')
    assert payload.fetch('paths').key?('/api/v1/agent/auth_challenges/{id}/redeem')
    assert payload.fetch('paths').key?('/api/v1/agent/digest')
    assert payload.fetch('paths').key?('/api/v1/agent/posts/{id}/vote_link')
    assert payload.fetch('paths').key?('/mcp')
  end

private
  def response_json
    JSON.parse(response.body)
  end
end
