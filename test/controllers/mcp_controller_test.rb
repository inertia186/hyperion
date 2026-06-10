require 'test_helper'

class McpControllerTest < ActionController::TestCase
  tests McpController

  setup do
    account = accounts(:curated)
    def account.blacklist_sources
      ['fixture-curator']
    end
    @request.session[:current_account] = account
    posts(:blacklisted_allowed).update!(blacklist_reasons: [{'account' => 'fixture-curator'}])
  end

  test 'requires authentication' do
    @request.session[:current_account] = nil

    post_json(jsonrpc: '2.0', id: 1, method: 'tools/list')

    assert_response :unauthorized
    assert_equal false, response_json.fetch('authenticated')
  end

  test 'initializes mcp session' do
    post_json(jsonrpc: '2.0', id: 1, method: 'initialize', params: {})

    assert_response :success
    assert_equal '2.0', response_json.fetch('jsonrpc')
    assert_equal '2025-06-18', response_json.dig('result', 'protocolVersion')
    assert_equal 'hyperion', response_json.dig('result', 'serverInfo', 'name')
  end

  test 'lists hyperion tools' do
    post_json(jsonrpc: '2.0', id: 2, method: 'tools/list', params: {})

    assert_response :success
    tools = response_json.dig('result', 'tools')
    tool_names = tools.map { |tool| tool.fetch('name') }
    assert_includes tool_names, 'hyperion_get_digest'
    assert_includes tool_names, 'hyperion_create_vote_link'
    assert_includes tool_names, 'hyperion_mark_read'
    mark_read_tool = tools.find { |tool| tool.fetch('name') == 'hyperion_mark_read' }
    assert_includes mark_read_tool.dig('inputSchema', 'properties').keys, 'post_id'
    ignore_tool = tools.find { |tool| tool.fetch('name') == 'hyperion_ignore_tags' }
    assert_includes ignore_tool.dig('inputSchema', 'properties').keys, 'ignored_tags'
  end

  test 'calls digest tool' do
    posts(:allowed_unread).update!(body: 'Digest body', payout_amount: 4, payout: '4.000 HBD')

    post_json(
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'hyperion_get_digest',
        arguments: {limit: 1}
      }
    )

    assert_response :success
    payload = tool_payload
    assert_equal 1, payload.fetch('posts').size
    assert_equal 'Allowed Unread', payload.fetch('posts').first.fetch('title')
  end

  test 'calls session and post tools' do
    posts(:allowed_unread).update!(body: 'Full post body for agents.')

    post_json(
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'hyperion_get_session',
        arguments: {}
      }
    )

    assert_response :success
    assert_equal 'fixture-curator', tool_payload.dig('account', 'name')

    post_json(
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'hyperion_get_post',
        arguments: {id: posts(:allowed_unread).id}
      }
    )

    assert_response :success
    payload = tool_payload
    assert_equal 'Allowed Unread', payload.fetch('title')
    assert_equal 'Full post body for agents.', payload.fetch('body_markdown')
  end

  test 'calls vote link and read mutation tools' do
    post_json(
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'hyperion_create_vote_link',
        arguments: {id: posts(:allowed_unread).id, weight: -2500}
      }
    )

    assert_response :success
    payload = tool_payload
    assert_equal(-2500, payload.fetch('weight'))
    assert_equal 'https://hivesigner.com/sign/vote?authority=post&voter=fixture-curator&author=visible-author&permlink=allowed-unread&weight=-2500', payload.fetch('hivesigner_url')

    post_json(
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'hyperion_mark_read',
        arguments: {id: posts(:allowed_unread).id}
      }
    )

    assert_response :success
    payload = tool_payload
    assert_equal 1, payload.fetch('marked_count')
    assert_equal [posts(:allowed_unread).id], payload.fetch('post_ids')
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
  end

  test 'calls ignored tag tools' do
    post_json(
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'hyperion_ignore_tags',
        arguments: {ignored_tags: 'agent-spam, second-agent-spam'}
      }
    )

    assert_response :success
    assert_includes tool_payload.fetch('ignored_tags'), 'agent-spam'
    assert_includes tool_payload.fetch('ignored_tags'), 'second-agent-spam'
    assert_equal ['agent-spam', 'second-agent-spam'], tool_payload.fetch('tags')

    post_json(
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'hyperion_unignore_tags',
        arguments: {tag: 'agent-spam'}
      }
    )

    assert_response :success
    assert_not_includes tool_payload.fetch('ignored_tags'), 'agent-spam'
    assert_includes tool_payload.fetch('ignored_tags'), 'second-agent-spam'
    assert_equal 1, tool_payload.fetch('changed_count')
  end

  test 'mutation tools return warnings for empty inputs' do
    post_json(
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'hyperion_mark_read',
        arguments: {}
      }
    )

    assert_response :success
    assert_equal 0, tool_payload.fetch('marked_count')
    assert_includes tool_payload.fetch('warnings'), 'No usable post ids were provided.'

    post_json(
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: {
        name: 'hyperion_ignore_tags',
        arguments: {tag: ''}
      }
    )

    assert_response :success
    assert_equal 0, tool_payload.fetch('changed_count')
    assert_includes tool_payload.fetch('warnings'), 'No usable tags were provided.'
  end

  test 'rejects unsupported protocol versions' do
    @request.headers['MCP-Protocol-Version'] = '1999-01-01'

    post_json(jsonrpc: '2.0', id: 8, method: 'tools/list', params: {})

    assert_response :bad_request
    assert_equal 'Unsupported MCP protocol version', response_json.fetch('error')
  end

  test 'rejects foreign origins' do
    @request.headers['Origin'] = 'https://evil.example'

    post_json(jsonrpc: '2.0', id: 9, method: 'tools/list', params: {})

    assert_response :forbidden
    assert_equal 'Forbidden origin', response_json.fetch('error')
  end

  test 'returns method not found errors' do
    post_json(jsonrpc: '2.0', id: 10, method: 'missing/method', params: {})

    assert_response :success
    assert_equal(-32601, response_json.dig('error', 'code'))
  end

  test 'returns invalid params errors for missing tool arguments' do
    post_json(
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'hyperion_get_post',
        arguments: {}
      }
    )

    assert_response :success
    assert_equal(-32602, response_json.dig('error', 'code'))
  end

  test 'notifications return accepted without a body' do
    post_json(jsonrpc: '2.0', method: 'notifications/initialized', params: {})

    assert_response :accepted
    assert_empty response.body
  end

  test 'get transport stream is not supported' do
    get :show

    assert_response :method_not_allowed
  end

private
  def post_json(payload)
    @request.headers['Content-Type'] = 'application/json'
    post :create, body: JSON.generate(payload)
  end

  def tool_payload
    content = response_json.dig('result', 'content').first
    assert_equal 'text', content.fetch('type')
    JSON.parse(content.fetch('text'))
  end

  def response_json
    JSON.parse(response.body)
  end
end
