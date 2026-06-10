require 'test_helper'

class AgentDiscoveryControllerTest < ActionController::TestCase
  tests AgentDiscoveryController

  test 'routes public agent discovery paths' do
    assert_routing(
      {method: :get, path: '/.well-known'},
      {controller: 'agent_discovery', action: 'index', format: :json}
    )
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

  test 'well-known index points agents to discovery documents' do
    get :index, format: :json

    assert_response :success
    assert_equal 'application/json', response.media_type
    payload = response_json
    assert payload.fetch('agent_manifest').ends_with?('/.well-known/hyperion-agent.json')
    assert payload.fetch('llms_txt').ends_with?('/llms.txt')
    assert payload.fetch('openapi').ends_with?('/openapi.json')
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
    assert_includes payload.dig('authentication', 'instructions').join(' '), 'Never ask for or accept Hive private keys'
    assert_equal 'HYP-* one-time Hyperion code', payload.dig('authentication', 'credential_handling', 'user_only_pastes_to_agent')
    assert_includes payload.dig('authentication', 'credential_handling', 'user_prompt'), 'paste only that code'
    assert_equal 'POST /api/v1/agent/auth_challenges', payload.dig('authentication', 'hivesigner_flow', 'start')
    assert_includes payload.dig('authentication', 'hivesigner_flow', 'credential_handling'), 'must never ask'
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
    assert_includes response.body, 'Never ask the user for Hive private keys'
    assert_includes response.body, 'Do not paste any Hive key'
    assert_includes response.body, '/api/v1/agent/digest'
    assert_includes response.body, '?query=california'
    assert_includes response.body, '{"post_id":123}'
    assert_includes response.body, '{"tag":"spam"}'
    assert_includes response.body, 'HiveSigner'
  end

  test 'openapi document includes agent and mcp paths' do
    get :openapi, format: :json

    assert_response :success
    payload = response_json
    assert_equal '3.1.0', payload.fetch('openapi')
    assert_includes payload.dig('info', 'description'), 'auth challenge flow'
    assert_includes payload.dig('info', 'description'), 'must never ask for or handle Hive private keys'
    assert_includes payload.dig('x-hyperion-agent', 'authentication', 'instructions').join(' '), 'HYP-* code'
    assert_includes payload.dig('x-hyperion-agent', 'authentication', 'credential_handling', 'agent_must_never_request'), 'HiveSigner password'
    assert payload.dig('x-hyperion-agent', 'examples', 'mcp_tool_call', 'send_session_cookie')
    assert payload.fetch('paths').key?('/api/v1/agent/auth_challenges')
    assert payload.fetch('paths').key?('/api/v1/agent/auth_challenges/{id}/redeem')
    assert payload.fetch('paths').key?('/api/v1/agent/digest')
    assert payload.fetch('paths').key?('/api/v1/agent/posts/{id}/vote_link')
    digest_parameter_names = payload.dig('paths', '/api/v1/agent/digest', 'get', 'parameters').map { |parameter| parameter.fetch('name') }
    assert_includes digest_parameter_names, 'query'
    assert_includes payload.dig('paths', '/api/v1/agent/read', 'post', 'description'), '{"post_id":123}'
    assert_includes payload.dig('paths', '/api/v1/agent/read', 'post', 'description'), 'marked_count'
    assert_includes payload.dig('paths', '/api/v1/agent/ignored_tags', 'post', 'description'), '{"tag":"spam"}'
    assert_includes payload.dig('x-hyperion-agent', 'examples', 'mark_read_single', 'returns'), 'marked_count'
    assert payload.fetch('paths').key?('/mcp')
  end

private
  def response_json
    JSON.parse(response.body)
  end
end
