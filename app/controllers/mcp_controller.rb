class McpController < Api::V1::BaseController
  SUPPORTED_PROTOCOL_VERSIONS = %w(2025-06-18 2025-03-26).freeze

  protect_from_forgery except: %i(create destroy)
  before_action :validate_mcp_origin!, only: %i(create destroy)
  before_action :validate_protocol_version!, only: %i(create)

  def create
    message = JSON.parse(request.raw_post)

    if message['id'].nil?
      head :accepted
      return
    end

    render json: response_for(message)
  rescue JSON::ParserError
    render json: json_rpc_error(nil, -32700, 'Parse error'), status: :bad_request
  end

  def show
    head :method_not_allowed
  end

  def destroy
    head :method_not_allowed
  end

private
  def response_for(message)
    method = message['method'].to_s
    params = message['params'] || {}

    result = case method
    when 'initialize' then initialize_result
    when 'tools/list' then tools_list_result
    when 'tools/call' then tools_call_result(params)
    else
      return json_rpc_error(message['id'], -32601, "Method not found: #{method}")
    end

    {
      jsonrpc: '2.0',
      id: message['id'],
      result: result
    }
  rescue ArgumentError, KeyError => e
    json_rpc_error(message['id'], -32602, e.message)
  rescue ActiveRecord::RecordNotFound => e
    json_rpc_error(message['id'], -32000, e.message)
  end

  def initialize_result
    {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'hyperion',
        version: '1.0.0'
      }
    }
  end

  def tools_list_result
    {
      tools: [
        tool_schema('hyperion_get_session', 'Return the current Hyperion session and account state.', {}),
        tool_schema('hyperion_get_digest', 'Return curated unread posts for agent summarization.', {
          limit: integer_schema('Maximum posts to return. Defaults to 10.'),
          tag: string_schema('Optional tag/category filter.'),
          author: string_schema('Optional author filter.')
        }),
        tool_schema('hyperion_get_post', 'Return an agent-oriented post detail payload.', {
          id: integer_schema('Post id.')
        }, required: ['id']),
        tool_schema('hyperion_create_vote_link', 'Create a HiveSigner vote URL for the current account and post.', {
          id: integer_schema('Post id.'),
          weight: integer_schema('Vote weight from -10000 to 10000. Defaults to 10000.')
        }, required: ['id']),
        tool_schema('hyperion_mark_read', 'Mark posts read.', {
          id: integer_schema('Single post id to mark read.'),
          post_id: integer_schema('Single post id to mark read.'),
          post_ids: {type: 'array', items: {type: 'integer'}},
          ids: {type: 'array', items: {type: 'integer'}},
          all_matching: {type: 'boolean'},
          query: {type: 'object'}
        }),
        tool_schema('hyperion_ignore_tags', 'Ignore one or more tags.', {
          tags: {type: 'array', items: {type: 'string'}}
        }, required: ['tags']),
        tool_schema('hyperion_unignore_tags', 'Unignore one or more tags.', {
          tags: {type: 'array', items: {type: 'string'}}
        }, required: ['tags'])
      ]
    }
  end

  def tools_call_result(params)
    name = params.fetch('name')
    arguments = (params['arguments'] || {}).deep_symbolize_keys

    payload = case name
    when 'hyperion_get_session' then agent.session_payload
    when 'hyperion_get_digest' then agent.digest(arguments)
    when 'hyperion_get_post' then agent.post_payload(arguments.fetch(:id))
    when 'hyperion_create_vote_link' then agent.vote_link(arguments.fetch(:id), arguments[:weight])
    when 'hyperion_mark_read' then agent.mark_read(arguments)
    when 'hyperion_ignore_tags' then agent.ignore_tags(arguments.fetch(:tags))
    when 'hyperion_unignore_tags' then agent.unignore_tags(arguments.fetch(:tags))
    else
      raise ArgumentError, "Unknown tool: #{name}"
    end

    {
      content: [
        {
          type: 'text',
          text: JSON.pretty_generate(payload)
        }
      ]
    }
  end

  def tool_schema(name, description, properties, required: [])
    {
      name: name,
      description: description,
      inputSchema: {
        type: 'object',
        properties: properties,
        required: required
      }
    }
  end

  def integer_schema(description)
    {type: 'integer', description: description}
  end

  def string_schema(description)
    {type: 'string', description: description}
  end

  def json_rpc_error(id, code, message)
    {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: code,
        message: message
      }
    }
  end

  def agent
    @agent ||= HyperionAgent.new(account: current_account, session: request.session, url_helpers: self)
  end

  def validate_protocol_version!
    version = request.headers['MCP-Protocol-Version'].presence
    return if version.blank? || SUPPORTED_PROTOCOL_VERSIONS.include?(version)

    render json: {error: 'Unsupported MCP protocol version'}, status: :bad_request
  end

  def validate_mcp_origin!
    return if request.origin.blank?

    origin = URI.parse(request.origin)
    return if origin.scheme == request.scheme && origin.host == request.host && origin.port == request.port

    render json: {error: 'Forbidden origin'}, status: :forbidden
  rescue URI::InvalidURIError
    render json: {error: 'Forbidden origin'}, status: :forbidden
  end
end
