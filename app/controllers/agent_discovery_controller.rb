class AgentDiscoveryController < ApplicationController
  skip_before_action :sign_in

  def index
    render json: {
      name: 'Hyperion well-known index',
      agent_manifest: hyperion_agent_discovery_url,
      llms_txt: llms_url,
      openapi: openapi_url
    }
  end

  def show
    render json: {
      name: 'Hyperion',
      description: 'Agent-friendly curation API for Hyperion unread posts, tags, read state, and HiveSigner vote links.',
      authentication: {
        type: 'session_cookie_or_bearer',
        login_url: new_session_url,
        auth_challenge_url: api_v1_agent_auth_challenges_url,
        cookie_name: Rails.application.config.session_options[:key],
        bearer_header: 'Authorization: Bearer <bearer_token>',
        instructions: auth_instructions,
        credential_handling: credential_handling_metadata,
        hivesigner_flow: hivesigner_flow_metadata,
        keychain_flow: keychain_flow_metadata
      },
      links: {
        llms_txt: llms_url,
        openapi: openapi_url,
        mcp: mcp_url,
        agent_session: api_v1_agent_session_url,
        agent_digest: api_v1_agent_digest_url
      },
      capabilities: %w(auth_challenge session digest post vote_link mark_read ignore_tags unignore_tags mcp),
      recommended_agent_flow: recommended_agent_flow,
      examples: example_requests
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

      Hyperion exposes a session-cookie or bearer-token authenticated JSON API for AI agents. Do not scrape the SPA.

      Recommended TUI/CLI authentication flow:
      1. Start an HTTP client that stores cookies.
      2. POST #{api_v1_agent_auth_challenges_url}.
      3. Show the returned hivesigner_login_url to the user and ask them to open it.
      4. The user completes HiveSigner privately in their own browser. The agent must not ask for, receive, store, or handle Hive private keys, HiveSigner passwords, or signing credentials.
      5. After HiveSigner redirects back to Hyperion, the user sees a one-time code like HYP-ABC123.
      6. Ask the user to paste only that HYP-* code back to you.
      7. POST {"code":"HYP-ABC123"} to /api/v1/agent/auth_challenges/{challenge_id}/redeem with the same cookie jar.
      8. Keep the returned bearer_token or _hyperion cookie and use it for subsequent API and MCP requests.

      Suggested user-facing prompt:
      "#{hivesigner_user_prompt}"

      Credential handling rules:
      - Never ask the user for Hive private keys, HiveSigner passwords, or any signing credential.
      - Do not describe HiveSigner login as something the agent needs to complete.
      - The user completes HiveSigner directly; the agent only receives the final HYP-* code.
      - If HiveSigner asks for a private key or password, tell the user to handle that only on the HiveSigner page and never paste it into the agent.

      Browser-side agents may use the existing browser session cookie if they are running same-origin with Hyperion.
      Keychain-capable agents may use the returned keychain.message/keychain.digest and POST account_name, public_key, digest, and signature to /api/v1/agent/auth_challenges/{challenge_id}/keychain.

      Useful endpoints:
      - POST #{api_v1_agent_auth_challenges_url}
      - GET #{api_v1_agent_session_url}
      - GET #{api_v1_agent_digest_url}?limit=10
      - GET #{api_v1_agent_digest_url}?query=california
      - GET #{api_v1_agent_post_url(':id')}
      - GET #{api_v1_agent_post_vote_link_url(':id')}?weight=10000
      - POST #{api_v1_agent_read_url} with {"post_id":123}, {"id":123}, {"post_ids":[123,456]}, {"ids":[123,456]}, or {"all_matching":true,"query":{...}}
      - POST #{api_v1_agent_ignored_tags_url} with {"tag":"spam"}, {"tags":["spam","ai"]}, or {"ignored_tags":"spam, ai"}
      - DELETE #{api_v1_agent_ignored_tags_url} with {"tag":"spam"}, {"tags":["spam","ai"]}, or {"ignored_tags":"spam, ai"}
      - POST #{mcp_url}

      Example curl flow:
      curl -c hyperion.cookies -X POST #{api_v1_agent_auth_challenges_url}
      ask the user to open hivesigner_login_url privately, then:
      curl -b hyperion.cookies -c hyperion.cookies -H 'Content-Type: application/json' -d '{"code":"HYP-ABC123"}' #{redeem_api_v1_agent_auth_challenge_url(':challenge_id')}
      curl -H 'Authorization: Bearer hyp_at_...' #{api_v1_agent_digest_url}?limit=5

      Vote broadcasting is done through HiveSigner links. Hyperion does not store posting keys or broadcast votes server-side.
    TEXT
  end

  def openapi_payload
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
          instructions: auth_instructions,
          credential_handling: credential_handling_metadata,
          hivesigner_flow: hivesigner_flow_metadata,
          keychain_flow: keychain_flow_metadata
        },
        recommended_flow: recommended_agent_flow,
        examples: example_requests
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
            description: 'Unauthenticated. Use this first when the agent does not already have a Hyperion session cookie. Preserve cookies from this response and use the same cookie jar when redeeming the code.',
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
            description: 'Unauthenticated before redeem. Submit the HYP-* code shown to the user after they open hivesigner_login_url. The response includes bearer_token and sets the _hyperion cookie; use either for later agent requests.',
            parameters: [path_parameter('id', 'string', 'Challenge id')],
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

  def auth_instructions
    [
      'If you do not already have a Hyperion session cookie, POST /api/v1/agent/auth_challenges before any authenticated call.',
      'Persist cookies from the challenge response and reuse the same cookie jar when redeeming.',
      'For HiveSigner, show hivesigner_login_url to the user and ask them to complete HiveSigner privately in their own browser.',
      'Only ask the user to paste the displayed HYP-* code. Never ask for or accept Hive private keys, HiveSigner passwords, or signing credentials.',
      'POST the pasted code to /api/v1/agent/auth_challenges/{challenge_id}/redeem.',
      'After redeem succeeds, use either Authorization: Bearer <bearer_token> or the _hyperion cookie for HTTP API and MCP requests.',
      'Do not ask the user for Hive private keys. Hyperion only creates HiveSigner vote links; it does not broadcast votes server-side.'
    ]
  end

  def credential_handling_metadata
    {
      agent_must_never_request: ['Hive private key', 'HiveSigner password', 'posting key', 'active key', 'owner key', 'memo key', 'signing credential'],
      user_only_pastes_to_agent: 'HYP-* one-time Hyperion code',
      user_prompt: hivesigner_user_prompt,
      if_hivesigner_requests_credentials: 'The user may complete HiveSigner in their own browser, but must never paste keys or passwords into the agent.',
      agent_role: 'Open or present hivesigner_login_url, wait for the user to finish privately, then redeem only the HYP-* code.'
    }
  end

  def hivesigner_flow_metadata
    {
      start: 'POST /api/v1/agent/auth_challenges',
      user_action: 'Open hivesigner_login_url, complete HiveSigner privately in your browser, then copy only the displayed HYP-* code.',
      redeem: 'POST /api/v1/agent/auth_challenges/{challenge_id}/redeem with {"code":"HYP-ABC123"} using the same cookie jar.',
      result: 'The redeem response returns bearer_token and sets the _hyperion session cookie.',
      user_prompt: hivesigner_user_prompt,
      credential_handling: 'The agent must never ask for or receive Hive private keys, HiveSigner passwords, or signing credentials.'
    }
  end

  def keychain_flow_metadata
    {
      start: 'POST /api/v1/agent/auth_challenges',
      sign: 'Ask Hive Keychain to sign keychain.message with Posting authority.',
      submit: 'POST /api/v1/agent/auth_challenges/{challenge_id}/keychain with account_name, public_key, digest, and signature.',
      result: 'The keychain response returns bearer_token and sets the _hyperion session cookie.'
    }
  end

  def recommended_agent_flow
    [
      'GET /.well-known/hyperion-agent.json',
      'GET /api/v1/agent/session',
      'If authenticated is false, run the auth challenge flow.',
      'During auth, ask for only the HYP-* code; never ask for Hive private keys or HiveSigner credentials.',
      'GET /api/v1/agent/digest?limit=10',
      'Present interesting posts and HiveSigner vote links to the user.',
      'Use POST /api/v1/agent/read only after the user asks to mark posts read.',
      'Use POST or DELETE /api/v1/agent/ignored_tags only after the user asks to change ignored tags.'
    ]
  end

  def example_requests
    {
      create_auth_challenge: {
        method: 'POST',
        url: api_v1_agent_auth_challenges_url,
        store_cookies: true
      },
      redeem_hivesigner_code: {
        method: 'POST',
        url: redeem_api_v1_agent_auth_challenge_url(':challenge_id'),
        headers: {'Content-Type' => 'application/json'},
        body: {code: 'HYP-ABC123'},
        reuse_challenge_cookies: true
      },
      get_digest: {
        method: 'GET',
        url: "#{api_v1_agent_digest_url}?limit=10",
        authorization: 'Bearer <bearer_token>',
        send_session_cookie: true
      },
      keyword_digest: {
        method: 'GET',
        url: "#{api_v1_agent_digest_url}?query=california",
        authorization: 'Bearer <bearer_token>',
        send_session_cookie: true
      },
      mark_read_single: {
        method: 'POST',
        url: api_v1_agent_read_url,
        headers: {'Content-Type' => 'application/json'},
        body: {post_id: 123},
        returns: %w(post_ids marked_count warnings)
      },
      mark_read_batch: {
        method: 'POST',
        url: api_v1_agent_read_url,
        headers: {'Content-Type' => 'application/json'},
        body: {post_ids: [123, 456]},
        returns: %w(post_ids marked_count warnings)
      },
      ignore_tags: {
        method: 'POST',
        url: api_v1_agent_ignored_tags_url,
        headers: {'Content-Type' => 'application/json'},
        body: {tags: ['spam', 'ai']},
        returns: %w(tags changed_count warnings ignored_tags)
      },
      unignore_tag: {
        method: 'DELETE',
        url: api_v1_agent_ignored_tags_url,
        headers: {'Content-Type' => 'application/json'},
        body: {tag: 'spam'},
        returns: %w(tags changed_count warnings ignored_tags)
      },
      mcp_tool_call: {
        method: 'POST',
        url: mcp_url,
        headers: {'Content-Type' => 'application/json', 'MCP-Protocol-Version' => '2025-06-18', 'Authorization' => 'Bearer <bearer_token>'},
        body: {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'hyperion_get_digest', arguments: {limit: 10}}},
        send_session_cookie: true
      }
    }
  end

  def openapi_description
    <<~TEXT.squish
      Hyperion agent API. Agents should not scrape the SPA. Use the auth challenge flow when no _hyperion session cookie exists:
      POST /api/v1/agent/auth_challenges, show hivesigner_login_url to the user, redeem their HYP-* code, then use the returned bearer_token or resulting _hyperion cookie for API and MCP requests.
      Agents must never ask for or handle Hive private keys, HiveSigner passwords, or signing credentials. The user completes HiveSigner privately and gives the agent only the HYP-* code.
    TEXT
  end

  def hivesigner_user_prompt
    'Please open this HiveSigner link in your browser and complete the login there. Do not paste any Hive key, password, or signing credential into this chat. When Hyperion shows a code beginning with HYP-, paste only that code here.'
  end
end
