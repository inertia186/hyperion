class AgentDiscoveryController < ApplicationController
  skip_before_action :sign_in

  def show
    render json: {
      name: 'Hyperion',
      description: 'Agent-friendly curation API for Hyperion unread posts, tags, read state, and HiveSigner vote links.',
      authentication: {
        type: 'session_cookie',
        login_url: new_session_url,
        auth_challenge_url: api_v1_agent_auth_challenges_url,
        cookie_name: Rails.application.config.session_options[:key]
      },
      links: {
        llms_txt: llms_url,
        openapi: openapi_url,
        mcp: mcp_url,
        agent_session: api_v1_agent_session_url,
        agent_digest: api_v1_agent_digest_url
      },
      capabilities: %w(auth_challenge session digest post vote_link mark_read ignore_tags unignore_tags mcp)
    }
  end

  def llms
    render plain: llms_text, content_type: 'text/plain'
  end

  def openapi
    render json: openapi_payload
  end

private
  def llms_text
    <<~TEXT
      # Hyperion Agent Guide

      Hyperion exposes a session-cookie authenticated JSON API for AI agents.
      Authenticate by opening #{new_session_url}, then keep the Rails session cookie.

      Useful endpoints:
      - POST #{api_v1_agent_auth_challenges_url}
      - GET #{api_v1_agent_session_url}
      - GET #{api_v1_agent_digest_url}?limit=10
      - GET #{api_v1_agent_post_url(':id')}
      - GET #{api_v1_agent_post_vote_link_url(':id')}?weight=10000
      - POST #{api_v1_agent_read_url}
      - POST #{api_v1_agent_ignored_tags_url}
      - DELETE #{api_v1_agent_ignored_tags_url}
      - POST #{mcp_url}

      To authenticate without scraping the SPA, create an auth challenge, ask the user to open the returned HiveSigner URL, then redeem the copied code with the same HTTP client so it receives the Hyperion session cookie. Keychain clients can submit the returned challenge digest, public key, and signature to the keychain endpoint instead.
      Vote broadcasting is done through HiveSigner links. Hyperion does not store posting keys or broadcast votes server-side.
    TEXT
  end

  def openapi_payload
    {
      openapi: '3.1.0',
      info: {
        title: 'Hyperion Agent API',
        version: '1.0.0'
      },
      paths: {
        '/api/v1/agent/session' => {
          get: {
            summary: 'Return current agent session state.',
            responses: {'200' => json_response('Agent session state')}
          }
        },
        '/api/v1/agent/auth_challenges' => {
          post: {
            summary: 'Create a short-lived agent authentication challenge.',
            responses: {'201' => json_response('Agent auth challenge')}
          }
        },
        '/api/v1/agent/auth_challenges/{id}' => {
          get: {
            summary: 'Return auth challenge status.',
            parameters: [path_parameter('id', 'string', 'Challenge id')],
            responses: {'200' => json_response('Agent auth challenge status')}
          }
        },
        '/api/v1/agent/auth_challenges/{id}/redeem' => {
          post: {
            summary: 'Redeem a HiveSigner copy/paste code and receive a Rails session cookie.',
            parameters: [path_parameter('id', 'string', 'Challenge id')],
            responses: {'200' => json_response('Authenticated account state')}
          }
        },
        '/api/v1/agent/auth_challenges/{id}/keychain' => {
          post: {
            summary: 'Complete an auth challenge with a Hive Keychain signature.',
            parameters: [path_parameter('id', 'string', 'Challenge id')],
            responses: {'200' => json_response('Authenticated account state')}
          }
        },
        '/api/v1/agent/digest' => {
          get: {
            summary: 'Return curated unread posts for agent summarization.',
            parameters: [
              query_parameter('limit', 'integer', 'Maximum posts to return. Defaults to 10.'),
              query_parameter('tag', 'string', 'Optional tag/category filter.'),
              query_parameter('author', 'string', 'Optional author filter.')
            ],
            responses: {'200' => json_response('Curated digest')}
          }
        },
        '/api/v1/agent/posts/{id}' => {
          get: {
            summary: 'Return an agent-oriented post detail payload.',
            parameters: [path_parameter('id', 'integer', 'Post id')],
            responses: {'200' => json_response('Post detail')}
          }
        },
        '/api/v1/agent/posts/{id}/vote_link' => {
          get: {
            summary: 'Create a HiveSigner vote URL for the current account and post.',
            parameters: [
              path_parameter('id', 'integer', 'Post id'),
              query_parameter('weight', 'integer', 'Vote weight from -10000 to 10000. Defaults to 10000.')
            ],
            responses: {'200' => json_response('HiveSigner vote link')}
          }
        },
        '/api/v1/agent/read' => {
          post: {
            summary: 'Mark posts read.',
            responses: {'200' => json_response('Read mutation result')}
          }
        },
        '/api/v1/agent/ignored_tags' => {
          post: {
            summary: 'Ignore tags.',
            responses: {'201' => json_response('Updated tag state')}
          },
          delete: {
            summary: 'Unignore tags.',
            responses: {'200' => json_response('Updated tag state')}
          }
        },
        '/mcp' => {
          post: {
            summary: 'Minimal MCP Streamable HTTP JSON-RPC endpoint.',
            responses: {'200' => json_response('MCP JSON-RPC response')}
          }
        }
      }
    }
  end

  def json_response(description)
    {
      description: description,
      content: {
        'application/json' => {
          schema: {type: 'object'}
        }
      }
    }
  end

  def path_parameter(name, type, description)
    {name: name, in: 'path', required: true, schema: {type: type}, description: description}
  end

  def query_parameter(name, type, description)
    {name: name, in: 'query', required: false, schema: {type: type}, description: description}
  end
end
