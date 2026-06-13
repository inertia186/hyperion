class AgentOpenapiDocument
  def initialize(context)
    @context = context
  end

  def to_h
    {
      openapi: '3.1.0',
      info: {
        title: 'Hyperion Agent API',
        version: '1.0.0',
        description: openapi_description
      },
      'x-hyperion-agent' => {
        authentication: {
          cookie_name: Rails.application.config.session_options[:key],
          bearer_header: 'Authorization: Bearer <bearer_token>',
          stateless_agent_flow_supported: true,
          browser_cookie_persistence_required: false,
          instructions: context.send(:auth_instructions),
          credential_handling: context.send(:credential_handling_metadata),
          hivesigner_flow: context.send(:hivesigner_flow_metadata),
          keychain_flow: context.send(:keychain_flow_metadata)
        },
        recommended_flow: context.send(:recommended_agent_flow),
        examples: context.send(:example_requests)
      },
      paths: paths
    }
  end

private
  attr_reader :context

  def paths
    {
      '/api/v1/agent/session' => {
        get: {
          summary: 'Return current agent session state.',
          responses: {'200' => json_response('Agent session state')}
        }
      },
      '/api/v1/agent/auth_challenges' => {
        get: {
          summary: 'Create a short-lived agent authentication challenge with GET.',
          description: 'Unauthenticated. Use this first when the agent does not already have a Hyperion session cookie and cannot issue POST. Cookie storage is optional; stateless agents can store challenge_id and redeem challenge_id + HYP-* code for a bearer token.',
          responses: {'201' => json_response('Agent auth challenge')}
        },
        post: {
          summary: 'Create a short-lived agent authentication challenge.',
          description: 'Unauthenticated. Use this first when the agent does not already have a Hyperion session cookie. Cookie storage is optional; stateless agents can store challenge_id and redeem challenge_id + HYP-* code for a bearer token.',
          responses: {'201' => json_response('Agent auth challenge')}
        }
      },
      '/api/v1/agent/auth_challenges/start' => {
        get: {
          summary: 'Create a short-lived agent authentication challenge with GET.',
          description: 'Unauthenticated POST-restricted sandbox fallback. Returns the same payload as POST /api/v1/agent/auth_challenges. Cookie storage is optional; stateless agents can store challenge_id and redeem challenge_id + HYP-* code for a bearer token.',
          responses: {'201' => json_response('Agent auth challenge')}
        }
      },
      '/api/v1/agent/auth_challenges/{id}' => {
        get: {
          summary: 'Return auth challenge status.',
          description: 'Unauthenticated. Agents may poll this while waiting for the user to complete HiveSigner in a browser.',
          parameters: [path_parameter('id', 'string', 'Challenge id')],
          responses: {'200' => json_response('Agent auth challenge status')}
        }
      },
      '/api/v1/agent/auth_challenges/{id}/redeem' => {
        post: {
          summary: 'Redeem a HiveSigner copy/paste code and receive agent credentials.',
          description: 'Unauthenticated before redeem. Submit the HYP-* code shown to the user after they open hivesigner_login_url. The request does not require browser cookies. The response includes bearer_token and sets the _hyperion cookie; stateless agents should use the bearer_token for later requests.',
          parameters: [path_parameter('id', 'string', 'Challenge id')],
          responses: {'200' => json_response('Authenticated account state')}
        },
        get: {
          summary: 'Redeem a HiveSigner copy/paste code with GET.',
          description: 'POST-restricted sandbox fallback. Submit the HYP-* code as the code query parameter. The request does not require browser cookies. Prefer POST when available because URLs may be logged.',
          parameters: [
            path_parameter('id', 'string', 'Challenge id'),
            query_parameter('code', 'string', 'One-time HYP-* code shown to the user.')
          ],
          responses: {'200' => json_response('Authenticated account state')}
        }
      },
      '/api/v1/agent/auth_challenges/{id}/keychain' => {
        post: {
          summary: 'Complete an auth challenge with a Hive Keychain signature.',
          description: 'Unauthenticated before completion. Submit account_name, public_key, digest, and signature for the exact keychain.message returned by the challenge. The response includes bearer_token and sets the _hyperion cookie.',
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
            query_parameter('author', 'string', 'Optional author filter.'),
            query_parameter('query', 'string', 'Optional keyword search filter.')
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
          description: 'Accepts {"post_id":123}, {"id":123}, {"post_ids":[123,456]}, {"ids":[123,456]}, {"all_matching":true,"query":{...}}, or the same payload nested under {"agent":{...}}. Returns normalized post_ids, marked_count, warnings, and read_posts_count.',
          responses: {'200' => json_response('Read mutation result')}
        }
      },
      '/api/v1/agent/ignored_tags' => {
        post: {
          summary: 'Ignore tags.',
          description: 'Accepts {"tag":"spam"}, {"tags":["spam","ai"]}, {"ignored_tag":"spam"}, {"ignored_tags":["spam","ai"]}, comma-separated strings, or the same payload nested under {"agent":{...}}. Returns normalized tags, changed_count, warnings, and current tag state.',
          responses: {'201' => json_response('Updated tag state')}
        },
        delete: {
          summary: 'Unignore tags.',
          description: 'Accepts {"tag":"spam"}, {"tags":["spam","ai"]}, {"ignored_tag":"spam"}, {"ignored_tags":["spam","ai"]}, comma-separated strings, or the same payload nested under {"agent":{...}}. Returns normalized tags, changed_count, warnings, and current tag state.',
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

  def openapi_description
    <<~TEXT.squish
      Hyperion agent API. Agents should not scrape the SPA. Use the auth challenge flow when no _hyperion session cookie exists:
      GET or POST /api/v1/agent/auth_challenges, show hivesigner_login_url to the user, redeem their HYP-* code by POST or the GET fallback when POST is unavailable, then use the returned bearer_token or resulting _hyperion cookie for API and MCP requests. Browser cookie persistence is optional; stateless agents can store challenge_id and bearer_token.
      Agents must never ask for or handle Hive private keys, HiveSigner passwords, or signing credentials. The user completes HiveSigner privately and gives the agent only the HYP-* code.
    TEXT
  end
end
