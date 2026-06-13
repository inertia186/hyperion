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
        auth_challenge_start_url: start_api_v1_agent_auth_challenges_url,
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
      2. Start a challenge with GET or POST #{api_v1_agent_auth_challenges_url}. If your client requires a distinct GET URL, GET #{start_api_v1_agent_auth_challenges_url}.
      3. Show the returned hivesigner_login_url to the user and ask them to open it.
      4. The user completes HiveSigner privately in their own browser. The agent must not ask for, receive, store, or handle Hive private keys, HiveSigner passwords, or signing credentials.
      5. After HiveSigner redirects back to Hyperion, the user sees a one-time code like HYP-ABC123.
      6. Ask the user to paste only that HYP-* code back to you.
      7. POST {"code":"HYP-ABC123"} to /api/v1/agent/auth_challenges/{challenge_id}/redeem with the same cookie jar. If your sandbox cannot issue POST, GET /api/v1/agent/auth_challenges/{challenge_id}/redeem?code=HYP-ABC123.
      8. Keep the returned bearer_token or _hyperion cookie and use it for subsequent API and MCP requests.

      Suggested user-facing prompt:
      "#{hivesigner_user_prompt}"

      Credential handling rules:
      - Never ask the user for Hive private keys, HiveSigner passwords, or any signing credential.
      - Do not describe HiveSigner login as something the agent needs to complete.
      - The user completes HiveSigner directly; the agent only receives the final HYP-* code.
      - If HiveSigner asks for a private key or password, tell the user to handle that only on the HiveSigner page and never paste it into the agent.
      - Prefer POST for redeem. Use the GET redeem fallback only when the agent sandbox cannot POST; the HYP-* code is one-time and short-lived.

      Browser-side agents may use the existing browser session cookie if they are running same-origin with Hyperion.
      Keychain-capable agents may use the returned keychain.message/keychain.digest and POST account_name, public_key, digest, and signature to /api/v1/agent/auth_challenges/{challenge_id}/keychain.

      Useful endpoints:
      - GET or POST #{api_v1_agent_auth_challenges_url}
      - GET #{start_api_v1_agent_auth_challenges_url} (alternate POST-restricted sandbox fallback for starting auth only)
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
      curl -c hyperion.cookies #{api_v1_agent_auth_challenges_url}
      # POST also works:
      curl -c hyperion.cookies -X POST #{api_v1_agent_auth_challenges_url}
      # Alternate GET fallback:
      curl -c hyperion.cookies #{start_api_v1_agent_auth_challenges_url}
      ask the user to open hivesigner_login_url privately, then:
      curl -b hyperion.cookies -c hyperion.cookies -H 'Content-Type: application/json' -d '{"code":"HYP-ABC123"}' #{redeem_api_v1_agent_auth_challenge_url(':challenge_id')}
      # POST-restricted sandbox redeem fallback:
      curl -b hyperion.cookies -c hyperion.cookies "#{redeem_api_v1_agent_auth_challenge_url(':challenge_id')}?code=HYP-ABC123"
      curl -H 'Authorization: Bearer hyp_at_...' #{api_v1_agent_digest_url}?limit=5

      Vote broadcasting is done through HiveSigner links. Hyperion does not store posting keys or broadcast votes server-side.
    TEXT
  end

  def openapi_payload
    AgentOpenapiDocument.new(self).to_h
  end

  def auth_instructions
    [
      'If you do not already have a Hyperion session cookie, GET or POST /api/v1/agent/auth_challenges before any authenticated call.',
      'If your client requires a distinct fallback URL, GET /api/v1/agent/auth_challenges/start also creates the same challenge payload.',
      'Persist cookies from the challenge response and reuse the same cookie jar when redeeming.',
      'For HiveSigner, show hivesigner_login_url to the user and ask them to complete HiveSigner privately in their own browser.',
      'Only ask the user to paste the displayed HYP-* code. Never ask for or accept Hive private keys, HiveSigner passwords, or signing credentials.',
      'POST the pasted code to /api/v1/agent/auth_challenges/{challenge_id}/redeem.',
      'If your sandbox cannot issue POST for redeem, GET /api/v1/agent/auth_challenges/{challenge_id}/redeem?code=HYP-ABC123 with the same cookie jar.',
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
      start: 'GET or POST /api/v1/agent/auth_challenges',
      start_fallback: 'GET /api/v1/agent/auth_challenges/start also creates the same challenge payload for POST-restricted sandboxes.',
      user_action: 'Open hivesigner_login_url, complete HiveSigner privately in your browser, then copy only the displayed HYP-* code.',
      redeem: 'POST /api/v1/agent/auth_challenges/{challenge_id}/redeem with {"code":"HYP-ABC123"} using the same cookie jar.',
      redeem_fallback: 'GET /api/v1/agent/auth_challenges/{challenge_id}/redeem?code=HYP-ABC123 using the same cookie jar, only when POST is unavailable.',
      result: 'The redeem response returns bearer_token and sets the _hyperion session cookie.',
      user_prompt: hivesigner_user_prompt,
      credential_handling: 'The agent must never ask for or receive Hive private keys, HiveSigner passwords, or signing credentials.'
    }
  end

  def keychain_flow_metadata
    {
      start: 'GET or POST /api/v1/agent/auth_challenges',
      start_fallback: 'GET /api/v1/agent/auth_challenges/start also creates the same challenge payload for POST-restricted sandboxes.',
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
        method: 'GET',
        url: api_v1_agent_auth_challenges_url,
        store_cookies: true
      },
      create_auth_challenge_post: {
        method: 'POST',
        url: api_v1_agent_auth_challenges_url,
        store_cookies: true
      },
      create_auth_challenge_get_fallback: {
        method: 'GET',
        url: start_api_v1_agent_auth_challenges_url,
        store_cookies: true,
        use_when: 'The agent sandbox cannot issue POST before authentication.'
      },
      redeem_hivesigner_code: {
        method: 'POST',
        url: redeem_api_v1_agent_auth_challenge_url(':challenge_id'),
        headers: {'Content-Type' => 'application/json'},
        body: {code: 'HYP-ABC123'},
        reuse_challenge_cookies: true
      },
      redeem_hivesigner_code_get_fallback: {
        method: 'GET',
        url: "#{redeem_api_v1_agent_auth_challenge_url(':challenge_id')}?code=HYP-ABC123",
        reuse_challenge_cookies: true,
        use_when: 'The agent sandbox cannot issue POST. The HYP-* code is one-time and short-lived.'
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

  def hivesigner_user_prompt
    'Please open this HiveSigner link in your browser and complete the login there. Do not paste any Hive key, password, or signing credential into this chat. When Hyperion shows a code beginning with HYP-, paste only that code here.'
  end
end
