# Hyperion — Full Project Review

_Original review: 2026-06-02. Revised: 2026-06-12 after the `refactor` branch
decomposition pass. Scope: backend (Rails 8.1 / Ruby 3.3.11), HafSQL indexing,
React/Vite SPA, legacy Stimulus + Haml stack, PostgreSQL schema, and tests._

This document is a working checklist. Each item is actionable and grouped by
theme. Severity tags: **[H]** high, **[M]** medium, **[L]** low / low-hanging fruit.
Check items off (`[x]`) as they are addressed.

---

## 0. What the `refactor` branch changed (2026-06-12)

The `refactor` branch carried out a large, behavior-preserving decomposition of
the two biggest maintainability risks (the React SPA and several fat Rails
classes) into small, individually unit-tested units. No public behavior changed;
every step landed with the Rails + frontend suites green and a live HTTP smoke
check.

**Runtime/test environment notes (durable):**
- Backend tests: `RBENV_VERSION=3.3.11 rbenv exec bundle exec rails test ...`
  (or `bin/rails test`).
- Frontend tests: Node 24, e.g. `source ~/.nvm/nvm.sh && nvm use 24 && yarn test:frontend`.
- Asset builds: `yarn build` (legacy esbuild/sass) and `yarn vite:build` (SPA).
- Live smoke check used during the refactor: `http://127.0.0.1:3000/sessions/new`
  returns `200` and renders login HTML.

**Frontend SPA decomposition (`app/frontend/src/`):**
- `CurationInbox.jsx` reduced from **989 → 381 lines**; `App.jsx` from **324 → 228**.
- `App.test.jsx` no longer 1843 lines but coverage moved into focused per-unit
  test files; remaining `App.test.jsx` is still large (2723 lines) and hardened
  for parallel-safe timer cleanup.
- Pure helpers extracted: `curationInboxState`, `curationQuery`,
  `curationReadState`, `curationViewState`, `curationPagination`,
  `postPayloadUpdates`, `previewScroll`, `previewPaneLinks`, `timelineChart`.
- Hooks extracted: `useCurationPosts`, `useCurationSelection`, `useCurationSearch`,
  `useCurationPreferences`, `useCurationPreviewState`, `usePostPreview`,
  `usePreviewChainStats`, `usePreviewVoteActions`, `usePreviewImageSources`,
  `useRevisionDiffModal`, `useTimelineData`, `useDesktopPreviewResize`,
  `useInfiniteLoadMore`, `useSelectedPostListScroll`, `useVotingPower`,
  `useThemePreference`, `useSessionBootstrap`, `useMediaQuery`.
- Components extracted under `components/`: `CurationPostListPanel`,
  `CurationPreviewPanels`, `MobilePreviewDrawer`, `PostListSkeleton`,
  `SelectionBar`, `TagsModal`, `SettingsModal`, `HivesignerVoteModal`,
  `PostActionsDrawer`, `PreviewSkeleton`, `RevisionDiffModal`.
- Legacy Stimulus `posts_controller.js` (~700 → 380 lines) had pure logic pulled
  into testable helpers in `app/javascript/controllers/`: `posts_diff`,
  `posts_navigation`, `posts_keyboard`, `posts_preview`, `posts_details`
  (covered by `legacyPosts*.test.js`).

**Backend service extractions (`app/services/`):**
- `Api::V1::PostSerializer` — post JSON serialization out of the API controller.
- `PostChainPayload` — Hive chain-stat / payout payload assembly.
- `PostKeywordSearch` — keyword normalization, `ILIKE` filtering, fuzzy suggestions.
- `PostCurationParams` / `PostCurationSort` / `PostCurationAssociations` — split
  out of `PostCurationQuery` (param parsing, ordering, association enrichment).
- `PostMedia`, `PostDisplayBody`, `PostPayout` — extracted from the `Post` model
  (model keeps thin compatibility delegators).
- `PostBlacklist` — blacklist refresh/parsing/cache pulled out of `PostIndexJob`.
- `HyperionAgentPostPresenter` — agent post payload formatting out of `HyperionAgent`.
- `AgentOpenapiDocument` — OpenAPI document shape out of `AgentDiscoveryController`.

---

## 1. Architecture & Tech Debt

- [ ] **[H] Two parallel frontends.** A modern React/Vite SPA lives in
  `app/frontend/` while a legacy Stimulus/jQuery/Turbolinks stack lives in
  `app/javascript/` + Haml views in `app/views/`. The refactor made the legacy
  Stimulus controller easier to maintain (extracted `posts_*` helpers) but did
  **not** remove it. Decide which is canonical and schedule removal of the dead
  stack. Carrying both inflates `package.json` (`jquery`, `jquery-ui`, `select2`,
  `bootstrap@4`, `popper.js`, `turbolinks`, `@rails/ujs`, `@hotwired/stimulus`)
  and the asset build matrix (esbuild + sass + vite all configured).
- [ ] **[H] Duplicated query logic.** `PostsController#index`
  (`app/controllers/posts_controller.rb`) still re-implements logic that lives in
  `PostCurationQuery` (now slimmed to ~230 lines and split across
  `PostCurationParams`/`Sort`/`Associations`), which the API
  (`Api::V1::PostsController#index`) uses. Collapse the legacy controller onto
  `PostCurationQuery` or delete it if the SPA has fully replaced the
  server-rendered views.
- [ ] **[M] `read_params` duplicated.** The identical param-parsing block exists
  in both `PostsController#read_params` and the curation param parser. With
  `PostCurationParams` now extracted, route the legacy controller through it
  instead of keeping a second copy.
- [ ] **[M] Mixed bundlers.** `jsbundling-rails` + `esbuild` (`yarn build`),
  `cssbundling-rails` + `sass` (`yarn build:css`), `sprockets-rails`, AND
  `vite_rails` are all present. Consolidate on Vite for the SPA and drop the
  redundant esbuild/sprockets pipeline once the legacy views are gone.

## 2. Correctness / Bugs

- [x] **[H] `Post.tagged_all` does not filter by ALL tags.** Fixed: the loop now
  uses the iteration variable `t` (`Tag.where(tag: t)`); regression test added.
- [ ] **[H] Broken / mis-targeted counter caches.**
  - `Post has_many :read_posts, counter_cache: :tags_count` points reads at
    `tags_count` (the tag counter) and, because `counter_cache` belongs on the
    `belongs_to` side, is ineffective anyway. `ReadPost belongs_to :post` has no
    `counter_cache: true`.
  - `accounts.read_posts_count` column is never incremented (no
    `counter_cache: true` on `ReadPost belongs_to :account`).
  - Decide whether these counters are needed; if so wire `counter_cache: true`
    on the `belongs_to` associations and backfill. If not, drop the columns.
- [ ] **[M] `body ILIKE "%...%"` is unsanitized for LIKE metacharacters.** Keyword
  filtering now lives in `PostKeywordSearch` and the legacy `PostsController#index`.
  Confirm both escape `%` / `_` with `ActiveRecord::Base.sanitize_sql_like` before
  wrapping in `%...%`.
- [ ] **[L] `to_param` + `Post.find(params[:id])`.** `to_param` emits
  `id/author/permlink` but the API/controllers look up by `params[:id]` (leading
  integer is parsed by Rails). Confirm the routes/constraints handle the slug
  form consistently; document the contract.

## 3. Performance — Low-Hanging Fruit (do these first)

- [ ] **[H] N+1 `Community.find_by` per post.** Serialization moved into
  `Api::V1::PostSerializer` / `PostChainPayload`; verify community lookup is now
  resolved from a preloaded map (`PostCurationAssociations` builds community
  payloads) rather than `Community.find_by(name: display_post.category)` per post.
- [ ] **[H] N+1 `muted_authors.include?` per post.** Hoist
  `current_account.muted_authors` into a memoized `Set` once per request inside
  the serializer.
- [ ] **[H] Five separate COUNT queries per request.** `PostCurationQuery`
  mode-count assembly still issues independent `COUNT(*)` queries plus muted/total
  counts. Combine where possible (single grouped query / `FILTER (WHERE ...)`)
  and/or compute lazily only for the active mode.
- [ ] **[H] Repeated `account.reload`.** `account.reload.muted_authors` is called
  in multiple paths; memoize the muted-author list per request instead of
  refetching the row.
- [ ] **[H] Synchronous Hive RPC inside request path.**
  `Account#blacklist_sources` → `followed_blacklist_accounts` performs a live
  `bridge.get_follow_list` RPC on every curation request. Cache the
  follow/blacklist lists (DB column or Rails.cache with TTL) and refresh
  out-of-band, like `muted_authors` already is.
- [ ] **[M] Missing trigram index for body search.** `body ILIKE '%q%'` cannot use
  any index. If search is used in practice, add `pg_trgm` + a GIN index, or
  restrict search to title. Otherwise it is a full sequential scan over `posts`.
- [ ] **[M] No index for `metadata->>'app'` filter.** `Post.app` scope filters on
  `metadata->>'app' ILIKE ?`; add an expression index if app filtering is common.
- [ ] **[M] `related_authors` pulls up to 1000 rows.** Now in
  `PostCurationAssociations`; confirm index support and consider a smaller cap or
  caching.
- [ ] **[L] `TagCount.count` on every list render.** Cheap but unnecessary per
  request — cache it.
- [ ] **[M] `order_by_prolific` correlated subquery.** The per-author
  `(SELECT count(*) ...)` correlated subquery in the `ORDER BY` is O(n·m).
  Consider a materialized author-post-count or a join+group. (Sort selection now
  lives in `PostCurationSort`.)

## 4. Indexing Pipeline (`HafsqlPostIndexer` / `PostIndexJob`)

- [ ] **[M] Long transaction over a 1000-row batch.** `perform` wraps the entire
  batch in one `Post.transaction` with per-row `find_or_initialize` + `save!` +
  tag replacement, holding locks for the whole batch. Consider chunked
  transactions / `insert_all`/`upsert_all`.
- [x] **[M] Per-row blacklist lookup.** Blacklist refresh/parsing/caching is now
  extracted into `PostBlacklist` with focused tests; `PostIndexJob` keeps
  compatibility wrappers. Confirm per-author batching when wiring into the indexer.
- [ ] **[M] `replace_tags` is N queries per post.** `destroy_all` + per-tag
  `find_or_initialize_by` + `save!`. Use bulk `delete`/`upsert_all` for tags.
- [ ] **[L] `ensure_configured!` is an empty method.** Either implement the
  intended guard or remove it to avoid confusion.

## 5. Tests

- [x] **[M] No direct unit tests for the query engine.** The split produced focused
  tests: `post_curation_params_test`, `post_curation_sort_test`,
  `post_curation_associations_test`, plus `post_keyword_search_test`,
  `post_blacklist_test`, `post_media_test`, `post_display_body_test`,
  `post_payout_test`. `PostCurationQuery` itself is still only exercised
  indirectly — consider a thin integration test over the composed query.
- [ ] **[M] Legacy `PostsController` query branches under-tested.** If kept, mirror
  the curation coverage; if removed (see §1), delete its test.
- [ ] **[L] `App.test.jsx` still large (2723 lines).** Most logic now has focused
  per-hook/component tests (`use*.test.js`, `components/*.test.jsx`,
  `legacyPosts*.test.js`); finish trimming `App.test.jsx` to integration-level
  cases only.
- [x] **[L] Regression test for the `tagged_all` fix** (§2) — added.

## 6. Frontend (React SPA)

- [x] **[M] `CurationInbox.jsx` was 989 lines.** Decomposed into hooks
  (`useCurationPosts`, `useCurationSelection`, `useCurationSearch`,
  `useCurationPreferences`, `useCurationPreviewState`, `useInfiniteLoadMore`,
  `useSelectedPostListScroll`, …), pure helpers (`curationInboxState`,
  `curationQuery`, `curationReadState`, `curationViewState`, `curationPagination`),
  and components (`CurationPostListPanel`, `CurationPreviewPanels`). Now ~381 lines
  of composition/orchestration.
- [x] **[L] `App.jsx` (324 lines).** State extracted into `useVotingPower`,
  `useThemePreference`, `useSessionBootstrap`, and the `SettingsModal` component;
  now ~228 lines.
- [ ] **[M] `PreviewPane.jsx` / `TimelineModal.jsx` follow-up.** `PreviewPane`
  shrank substantially (chain stats, vote actions, image sources, revision diff,
  and leaf modals extracted) and `TimelineModal` now delegates to `useTimelineData`
  + `timelineChart`. Re-review both for any remaining mixed concerns.
- [ ] **[L] Vite `hmr: false`.** HMR is disabled in `vite.config.js`; confirm this
  is intentional or re-enable for local development.

## 7. Configuration & Ops

- [ ] **[L] `README` setup is stale.** `git clone TODO` placeholder; setup
  instructions mention `rake db:create`/`db:seed` only — add Node/Yarn, Vite, and
  HafSQL env var setup for a from-scratch run.
- [ ] **[L] Public HafSQL credentials in `README`.** Default public read-only
  creds are documented; ensure no real secrets land here and that
  `HAFSQL_DATABASE_URL` is the documented prod override.
- [ ] **[L] `stackprof`/profiling gems in default group.** Confirm intended, or
  move dev/profiling-only gems into the `:development` group.
- [ ] **[L] Pin Ruby/Node consistency.** `Gemfile` pins `ruby '3.3.11'`,
  `package.json` pins `node 24.x`. Ensure CI and Heroku buildpacks match.

## 8. Security

- [ ] **[M] LIKE-injection via search wildcards** — see §2 (`sanitize_sql_like`),
  now centralized in `PostKeywordSearch`.
- [ ] **[L] Confirm strong params / authorization** on all `Api::V1` mutating
  actions (`mark_read`, `mark_many_read`, `mark_all_as_read`) scope strictly to
  `current_account`; add tests asserting cross-account isolation.
- [ ] **[L] `condenser_rpc` error handling.** Chain-stat fetching (now in
  `PostChainPayload`) swallows `StandardError`; ensure failures are logged with
  enough context and not masking systemic node outages.

---

## Next Pass — Proposed Plan

The `refactor` branch effectively completed the **Pass 2D frontend
decomposition** and seeded the **Pass 2B query-engine split** and **Pass 2C
blacklist extraction**. Remaining priorities front-load the still-open
high-impact correctness/perf items.

### Pass 3A — Backend perf & correctness (mostly still open)
1. Eliminate the per-post N+1s in `Api::V1::PostSerializer` (community + muted
   authors) using preloaded maps from `PostCurationAssociations` (§3).
2. Memoize `muted_authors` / remove redundant `account.reload` (§3).
3. Collapse `build_mode_counts` into fewer queries (§3).
4. Cache/refresh follow & blacklist lists out-of-band (§3).
5. `sanitize_sql_like` for body search in `PostKeywordSearch` + legacy controller (§2/§8).

### Pass 3B — Stack consolidation
1. Decide the canonical frontend; remove the legacy Stimulus/jQuery/Haml stack
   (now helper-extracted but still live) and its build pipeline + unused deps (§1).
2. Collapse `PostsController#index` onto `PostCurationQuery`/`PostCurationParams`
   or delete the legacy controller/views (§1).
3. Drop the redundant esbuild/sprockets pipeline once legacy views are gone (§1).

### Pass 3C — Indexing & data layer
1. Wire `PostBlacklist` batching into the indexer; batch tag upserts (§4).
2. Chunk the indexer transaction (§4).
3. Add/justify DB indexes for body/app search; decide on `pg_trgm` (§3).
4. Resolve counter-cache correctness (§2).

### Pass 3D — Hardening
1. Cross-account authorization tests for all mutating API endpoints (§8).
2. Finish trimming `App.test.jsx` to integration cases (§5).
3. Re-profile hot endpoints (`stackprof`/`rack-mini-profiler`) to confirm gains.
