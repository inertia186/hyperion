# Hyperion vision

Hyperion helps Hive curators turn the active seven-day post window into a
manageable inbox: find posts worth considering, inspect them, vote through a
wallet, and keep track of what has been handled.

The direction is a fast, dependable curation workspace that people can use
directly or through an agent, with their preferences and signing authority
intact.

This base draft was reconstructed from the repository and its history on
2026-10-11 and refreshed against `master` on 2026-10-15. The history and current
foundation describe existing work. The principles, priorities, and success
criteria propose how to carry it forward.

## The problem and the person

A Hive curator has limited attention and a moving window of posts to consider.
Finding relevant work requires narrowing the field, recognizing what has already
been reviewed, and inspecting enough context to make a decision. Repeating those
steps across lists, post pages, and wallets adds friction.

Hyperion's primary user is the curator doing that work repeatedly. The original
interface favored experienced users with dense controls and keyboard navigation.
The SPA plan made the next ambition explicit: preserve that efficiency while
making the workflow easier for other users to understand. Agent access extends
the ways a curator can work with the same inbox and account data.

A useful session leaves the curator with posts considered, decisions recorded,
and a clear place to resume.

## The through-line

The core loop took shape in the first weeks of development in May and June 2020:

1. **Narrow the field.** Use tags, authors, applications, favorites, exclusions,
   and sorting to choose a useful set of posts.
2. **Inspect in context.** Read a preview, examine the author and post metadata,
   and move between candidates without losing the list.
3. **Act deliberately.** Vote through a supported wallet, mark posts read or
   unread, and adjust the filters that shape future sessions.
4. **Keep the progress.** Preserve account read state and tag choices so the
   next session builds on the last one.

The seven-day unread view gives this loop a bounded default. Read, ignored,
blacklisted, deleted, and keyword views provide ways to investigate outside that
default. An empty filtered inbox is a useful outcome when the curator understands
what was included and excluded.

## How the project got here

| Period | Change in direction or emphasis | What carried forward |
| --- | --- | --- |
| May–November 2020 | The Rails/Haml application established tag filtering, previews, read state, mutes, keyboard navigation, and voting. HiveSigner joined the original Keychain path. | Curation is a repeatable inbox workflow with personal state. Evidence: `8ba420a`, `35a2fdf`, `c3db925`, `fdc5eb5`, `7d30816`, `05d106e`. |
| 2021–May 2026 | The visible history moves from indexing and dependency maintenance in 2021 to a substantial modernization in May 2026, with no intervening commits on this lineage. | The restart retained the curation model. The commit gap alone does not establish why development paused. Evidence: `5bd8d8c`, `78442f8`. |
| May 2026: data foundation | HafSQL became the default indexing source, with persisted index state and the original RPC indexer retained as an option. | A usable inbox depends on keeping the active post set current. Evidence: `02810f8`, `6486495`. |
| May 2026: interface | The SPA plan identified an interface that worked for experts but was difficult for normal users. React became the primary inbox, with a persistent preview and Rails retaining sessions and data ownership. | Preserve curation behavior while improving how people reach and use it. Legacy pages remain available during migration. Evidence: `4d797db`, `79deb14`, `e861c49`, `6cff029`. |
| May–June 2026: decision context | Work expanded into poisoned-pill tag filtering, blacklist sources, reputation, sortable payouts, keyword search, revisions, timelines, and richer previews. | Help curators inspect and organize the evidence behind a decision. Evidence: `7076a85`, `b2028c7`, `68af242`, `e8ecf3c`, `649ad83`, `c18a820`. |
| June 2026: agent access | Discovery, JSON endpoints, MCP, device authorization, and bearer tokens made the inbox accessible to agents. | Agents use the curation query and account state; vote execution stays behind wallet approval. Evidence: `064eb61`, `73d2299`, `53e9106`. |
| July 2026: explicit signals | Dedicated filters surfaced prolific authors, heavy tag use, and authors matching poisoned-pill tags. | Give curators more ways to isolate a set for review. Evidence: `eab984d`, `d51ee26`. |
| September–October 2026: trust and reliability | Rendering hardening, CI coverage, verified wallet sessions, and a shared voting adapter received attention. | Reliable identity, content, and action results are part of the curation experience. Evidence: `40c3ecf`, `a32e5af`, `c9de368`. |
| October 2026: verified state and workflows | Heading links improved navigation within previews. Agent digests gained account-specific vote state and an explicit unavailable status, with malformed vote identities kept unknown. Browser tests added coverage for login and previews using simulated Hive and Keychain responses. | Preserve reading context, distinguish missing evidence from confirmed absence, and verify workflows before completing migrations. Evidence: `49d3019`, `08d0bc0`, `7646a35`, `a8fec16`, `8d3825c`. |

The major pivots changed the data source, interface, and available clients. The
underlying job remained consistent: reduce the work required to make considered
curation decisions.

## Principles to carry forward

**Make progress durable and actions reversible where possible.** Read state,
favorites, ignored tags, and mute controls are central product behavior. Moving
quickly through the inbox should preserve the ability to revisit a decision.

**Keep the curator's choices visible.** Filters and rankings should be
understandable. Payout, reputation, posting frequency, and tag use are evidence
for consideration; they do not establish content quality. The current agent
digest's `interesting` order uses payout, reputation, and recency. Any broader
claim about relevance needs a deliberate definition and evidence.

**Preserve reading context.** Fast previews, keyboard navigation, responsive
layouts, and useful media rendering all support the same task. Content revisions
and cross-post identity matter because a curator needs to know what they are
reading and which post an action will affect. Navigation within a post should
keep the curator in the current preview.

**Represent uncertainty honestly.** Unavailable or malformed data leaves a
decision unresolved. A failed vote lookup must remain distinguishable from
confirmed absence of a vote. Both people and agents need to know which facts
were established before acting on them.

**Give people and agents a consistent curation model.** The SPA and agent API
already share the query service and account read/tag data. Extend that foundation
with explicit capabilities and useful errors. An agent should be able to explain
the set it found and the state it changed.

**Keep authentication separate from permission to sign.** Hyperion verifies
account access; wallets handle transaction approval. Agent tokens permit the
documented inbox operations and creation of vote links. They do not authorize
server-side vote broadcasting. A wallet response and an observed chain result
must remain distinguishable.

**Treat freshness and recovery as product requirements.** Indexing delays,
unavailable RPC nodes, failed previews, and stale wallet state affect the
curator's decisions. Keep those conditions understandable and recoverable. The
HafSQL indexer, RPC failover, health checks, and operational diagnostics provide
an existing foundation.

## Current foundation and proposed next direction

The repository contains a working React inbox, a Rails API and persistence layer,
HafSQL indexing, legacy pages, and an agent API with MCP access. Browser voting
uses a shared wallet adapter. Keychain and HiveSigner are the default providers;
HiveAuth and Peak Vault are implemented behind rollout controls, with live
verification still incomplete in the wallet documentation.

Heading links work within both preview interfaces, and agent digests distinguish
confirmed vote state from unavailable evidence. Browser tests cover sign-in and
post previews using simulated Hive and Keychain responses. Those tests provide
workflow regression coverage; live wallet and device checks supply separate
evidence about compatibility.

The next work should strengthen the complete curation loop:

- **Make the default path easier to understand.** A curator should be able to
  see the active filters, understand an empty result, inspect a post, and resume
  work across desktop and mobile sessions.
- **Make the evidence dependable.** Prioritize index freshness, accurate post
  identity and revisions, useful previews, and reliable vote-state reporting.
- **Make agent assistance predictable.** Keep query behavior, account mutations,
  authentication, and approval boundaries explicit across JSON and MCP access.
- **Complete migrations when the replacement is ready.** Consolidate legacy
  inbox behavior and asset paths once the required workflows are covered. Use
  automated coverage of the core loop and real wallet and device checks to
  establish readiness. The SPA plan and project review identify this unfinished
  work; the exact coverage required remains an open decision.

These are proposed priorities, not a dated delivery plan. Replying, reblogging,
publishing, a durable historical archive, and autonomous vote execution each
require an explicit scope decision. The existing SPA plan defers reply and
reblog controls; the implemented agent contract ends voting at an approval link.

## What success should mean

Evaluate progress by whether a curator can:

- Reach useful candidates with less repeated filtering and navigation.
- Understand why a post appears or is excluded, and change that choice.
- Inspect, vote, and mark progress without losing context or seeing false success.
- Resume with prior read state and tag choices intact.
- Use an agent for the supported work while retaining control of signing.
- Recognize stale or unavailable data and recover without losing the session's work.

Useful measures include time to the first considered decision, repeated reviews
caused by lost state, index lag, preview failures, and completed wallet approval
flows. The repository does not establish product targets or measured baselines
for these; those remain to be chosen and collected.

## Decisions still open

- How should discovery balance existing payout and reputation against newer or
  less-visible authors and the curator's explicit interests?
- Which agent actions should require a per-action confirmation, and which can be
  covered by a curator's standing instruction?
- What workflow and device coverage is sufficient to retire the legacy inbox?
- How much post history should remain available beyond the active curation
  window, and for which concrete use cases?

## Source basis

This draft uses `master` at `b288829` (2026-10-15), its reachable history, and
the repository documents and implementation below. That baseline includes the
heading links, agent vote-state fixes, browser tests, and malformed-vote
validation described here. Commit references record the evidence used to prepare
this draft.

- [SPA plan and status](docs/plan-spa.md), including its original version at
  `4d797db`, states the curation goal and migration intent.
- [Curation query](app/services/post_curation_query.rb),
  [sorting](app/services/post_curation_sort.rb), and
  [signals](app/services/post_curation_signal.rb) define the current selection rules.
- [Agent service](app/services/hyperion_agent.rb) and
  [discovery contract](app/controllers/agent_discovery_controller.rb) define agent access;
  [vote lookup](app/services/post_chain_payload.rb) preserves unknown vote state.
- [Wallet documentation](docs/wallets.md) records authentication, approval,
  rollout limits, and verification status.
- [Browser test setup](test/application_system_test_case.rb),
  [login tests](test/system/login_test.rb), and
  [inbox preview test](test/system/curation_inbox_test.rb) show the scope and
  limits of automated browser verification.
- [README](README.md), [HafSQL indexer](app/services/hafsql_post_indexer.rb), and
  [project review](CLAUDE.md) provide operational and migration context. The
  plans and review contain dated status claims; use the implementation and tests
  to establish which work remains open.
