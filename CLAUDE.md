# Hyperion — Full Project Review

_Review date: 2026-06-02. Scope: backend (Rails 8.1 / Ruby 3.3.11), HafSQL indexing,
React/Vite SPA, legacy Stimulus + Haml stack, PostgreSQL schema, and tests._

This document is a working checklist. Each item is actionable and grouped by
theme. Severity tags: **[H]** high, **[M]** medium, **[L]** low / low-hanging fruit.
Check items off (`[x]`) as they are addressed.

---

## 1. Architecture & Tech Debt

- [ ] **[H] Two parallel frontends.** A modern React/Vite SPA lives in
  `app/frontend/` while a legacy Stimulus/jQuery/Turbolinks stack lives in
  `app/javascript/` + Haml views in `app/views/`. Decide which is canonical and
  schedule removal of the dead stack. Carrying both inflates `package.json`
  (`jquery`, `jquery-ui`, `select2`, `bootstrap@4`, `popper.js`, `turbolinks`,
  `@rails/ujs`, `@hotwired/stimulus`) and the asset build matrix
  (esbuild + sass + vite all configured).
- [ ] **[H] Duplicated query logic.** `PostsController#index` (~100 lines,
  `app/controllers/posts_controller.rb`) re-implements almost exactly the logic
  already extracted into `PostCurationQuery`
  (`app/services/post_curation_query.rb`), which the API (`Api::V1::PostsController#index`)
  uses. Collapse the legacy controller onto `PostCurationQuery` or delete it if
  the SPA has fully replaced the server-rendered views.
- [ ] **[M] `read_params` duplicated.** The identical param-parsing block exists
  in both `PostsController#read_params` and `PostCurationQuery#read_params`.
  Extract to a single shared parser object.
- [ ] **[M] Mixed bundlers.** `jsbundling-rails` + `esbuild` (`yarn build`),
  `cssbundling-rails` + `sass` (`yarn build:css`), `sprockets-rails`, AND
  `vite_rails` are all present. Consolidate on Vite for the SPA and drop the
  redundant esbuild/sprockets pipeline once the legacy views are gone.

## 2. Correctness / Bugs

- [x] **[H] `Post.tagged_all` does not filter by ALL tags.** In
  `app/models/post.rb` the loop body uses the whole array `tag` instead of the
  iteration variable `t`:
  ```ruby
  tag.each do |t|
    r = r.where(id: Tag.where(tag: tag).select(:post_id))   # uses `tag`, not `t`
  end
  ```
  Every iteration applies the same ANY-of-tags predicate, so "all tags" behaves
  like "any tag". Fix to `Tag.where(tag: t)`. Add a regression test.
- [ ] **[H] Broken / mis-targeted counter caches.**
  - `Post has_many :read_posts, counter_cache: :tags_count`
    (`app/models/post.rb:20`) points reads at `tags_count` (the tag counter) and,
    because `counter_cache` belongs on the `belongs_to` side, is ineffective
    anyway. `ReadPost belongs_to :post` has no `counter_cache: true`.
  - `accounts.read_posts_count` column is never incremented (no
    `counter_cache: true` on `ReadPost belongs_to :account`).
  - Decide whether these counters are needed; if so wire `counter_cache: true`
    on the `belongs_to` associations and backfill. If not, drop the columns.
- [ ] **[M] `body ILIKE "%...%"` is unsanitized for LIKE metacharacters.** In both
  `PostsController#index` and `PostCurationQuery#base_filter_relation`, user
  `query` is interpolated into a bind value but `%` / `_` are not escaped, so
  user-supplied wildcards alter matching semantics. Use
  `ActiveRecord::Base.sanitize_sql_like` before wrapping in `%...%`.
- [ ] **[L] `to_param` + `Post.find(params[:id])`.** `to_param` emits
  `id/author/permlink` but the API/controllers look up by `params[:id]` (leading
  integer is parsed by Rails). Confirm the routes/constraints handle the slug
  form consistently; document the contract.

## 3. Performance — Low-Hanging Fruit (do these first)

- [ ] **[H] N+1 `Community.find_by` per post.** In
  `Api::V1::PostsController#post_json`, `Community.find_by(name: display_post.category)`
  runs once per post in the list. Preload communities for all `display_post`
  categories in `PostCurationQuery#load_associations` (it already builds
  `post_communities`) and look them up from the in-memory map.
- [ ] **[H] N+1 `muted_authors.include?` per post.** Also in `post_json`,
  `current_account.muted_authors.include?(...)` is evaluated per post. Hoist
  `current_account.muted_authors` into a memoized `Set` once per request.
- [ ] **[H] Five separate COUNT queries per request.**
  `PostCurationQuery#build_mode_counts` issues 5 independent `COUNT(*)` queries
  (unread/read/ignored/deleted/blacklisted) plus `build_muted_posts_count` and
  `total_count`. Combine where possible (e.g. a single grouped query or
  `FILTER (WHERE ...)` aggregate) and/or compute lazily only for the active mode.
- [ ] **[H] Repeated `account.reload`.** `account.reload.muted_authors` is called
  in `Post.unread` scope, `PostCurationQuery#build_muted_posts_count`,
  `#base_filter_relation`, and `PostsController#index`. Each reload is a full row
  refetch; memoize the muted-author list per request instead.
- [ ] **[H] Synchronous Hive RPC inside request path.**
  `Account#blacklist_sources` → `followed_blacklist_accounts` →
  `fetch_bridge_follow_list_accounts` performs a live `bridge.get_follow_list`
  RPC on every curation request (memoist only de-dupes within one instance).
  Cache the follow/blacklist lists (DB column or Rails.cache with TTL) and
  refresh out-of-band, like `muted_authors` already is.
- [ ] **[M] Missing trigram index for body search.** `body ILIKE '%q%'` cannot use
  any index (`db/schema.rb` has none on `body`). If search is used in practice,
  add `pg_trgm` + a GIN index, or restrict search to title. Otherwise it is a
  full sequential scan over `posts`.
- [ ] **[M] No index for `metadata->>'app'` filter.** `Post.app` scope filters on
  `metadata->>'app' ILIKE ?`; add an expression index if app filtering is common.
- [ ] **[M] `related_authors` pulls up to 1000 rows.**
  `all_posts.distinct.limit(1000).order(:author).pluck(:author)` runs on the full
  filtered relation every request. Confirm the index support and consider a
  smaller cap or caching.
- [ ] **[L] `TagCount.count` on every list render.** Called in both index actions
  and the API `counts` payload. Cheap but unnecessary per request — cache it.
- [ ] **[M] `order_by_prolific` correlated subquery.** The per-author
  `(SELECT count(*) ... )` correlated subquery in the `ORDER BY`
  (`app/models/post.rb`) is O(n·m). Consider a materialized author-post-count or
  a join+group.

## 4. Indexing Pipeline (`HafsqlPostIndexer`)

- [ ] **[M] Long transaction over a 1000-row batch.** `perform` wraps the entire
  batch (and the sweep batch) in one `Post.transaction`, doing per-row
  `find_or_initialize` + `save!` + tag replacement. This holds locks for the
  whole batch. Consider chunked transactions / `insert_all`/`upsert_all`.
- [ ] **[M] Per-row blacklist lookup.** `upsert_post` calls
  `PostIndexJob.new.blacklist_reasons_for(row.author)` for every row (new object
  each time). Batch blacklist resolution per author set, like reputations already
  are (`author_reputations_for`).
- [ ] **[M] `replace_tags` is N queries per post.** `destroy_all` + per-tag
  `find_or_initialize_by` + `save!`. Use bulk `delete`/`upsert_all` for tags.
- [ ] **[L] `ensure_configured!` is an empty method.** Either implement the intended
  guard (it is called in `perform`/`fetch_body`) or remove it to avoid confusion.

## 5. Tests

- [ ] **[M] No direct unit tests for `PostCurationQuery`.** It is the core query
  engine used by the API but only exercised indirectly via controller tests. Add
  focused tests (sorting, tag include/exclude, modes, blacklist, muted authors).
- [ ] **[M] Legacy `PostsController` query branches under-tested.** If kept, mirror
  the `PostCurationQuery` coverage; if removed (see §1), delete its test.
- [ ] **[L] Large monolithic test files.** `app/frontend/src/App.test.jsx` is 1843
  lines. Split by feature alongside the component split in §6.
- [x] **[L] Add a regression test for the `tagged_all` fix** (§2) before changing
  the scope.

## 6. Frontend (React SPA)

- [ ] **[M] `CurationInbox.jsx` is 989 lines.** Decompose into smaller components
  /hooks (data fetching, mode state, keyboard shortcuts, list rendering). It is
  the single largest source file and the main maintainability risk in the SPA.
- [ ] **[L] `App.jsx` (324 lines)** — review for extractable state/hooks once
  `CurationInbox` is split.
- [ ] **[L] Vite `hmr: false`.** HMR is disabled in `vite.config.js`; confirm this
  is intentional (it slows the dev loop) or re-enable for local development.

## 7. Configuration & Ops

- [ ] **[L] `README` setup is stale.** `git clone TODO` placeholder; setup
  instructions mention `rake db:create`/`db:seed` only — add Node/Yarn, Vite, and
  HafSQL env var setup for a from-scratch run.
- [ ] **[L] Public HafSQL credentials in `README`.** Default public read-only
  creds are documented; fine for the public endpoint but make sure no real
  secrets ever land here and that `HAFSQL_DATABASE_URL` is the documented prod
  override.
- [ ] **[L] `stackprof`/profiling gems in default group.** `stackprof` is in the
  top-level Gemfile group (loaded in production); confirm intended, or move
  dev/profiling-only gems into the `:development` group.
- [ ] **[L] Pin Ruby/Node consistency.** `Gemfile` pins `ruby '3.3.11'`,
  `package.json` pins `node 24.x`. Ensure CI and Heroku buildpacks match.

## 8. Security

- [ ] **[M] LIKE-injection via search wildcards** — see §2 (`sanitize_sql_like`).
- [ ] **[L] Confirm strong params / authorization** on all `Api::V1` mutating
  actions (`mark_read`, `mark_many_read`, `mark_all_as_read`) scope strictly to
  `current_account` (they appear to, but add tests asserting cross-account
  isolation).
- [ ] **[L] `condenser_rpc` error handling** in `chain_stats` swallows all
  `StandardError`; ensure failures are logged with enough context and not masking
  systemic node outages.

---

## Next Pass — Proposed Plan

A suggested ordering that front-loads cheap, high-impact wins and de-risks later
refactors. Each phase should land with tests green.

### Pass 2A — Quick wins (low effort, high value)
1. Fix `Post.tagged_all` bug + regression test (§2).
2. Eliminate the two per-post N+1s in `post_json` (community + muted authors) (§3).
3. Memoize `muted_authors` / remove redundant `account.reload` (§3).
4. `sanitize_sql_like` for body search (§2/§8).
5. Cache `TagCount.count` per request (§3).

### Pass 2B — Query engine consolidation
1. Add `PostCurationQuery` unit tests (§5) to lock in behavior.
2. Collapse `PostsController#index` onto `PostCurationQuery` (or delete legacy
   controller/views if the SPA is canonical) (§1).
3. Extract the shared `read_params` parser (§1).
4. Optimize `build_mode_counts` into fewer queries (§3).

### Pass 2C — Indexing & data layer
1. Batch blacklist lookups and tag upserts in `HafsqlPostIndexer` (§4).
2. Chunk the indexer transaction (§4).
3. Add/justify DB indexes for body/app search; decide on `pg_trgm` (§3).
4. Resolve counter-cache correctness (§2).

### Pass 2D — Frontend & stack cleanup
1. Decompose `CurationInbox.jsx` and split `App.test.jsx` (§6/§5).
2. Decide the canonical frontend; remove the legacy Stimulus/jQuery/Haml stack
   and its build pipeline + unused dependencies (§1).
3. Refresh `README` and Gemfile group hygiene (§7).

### Pass 3 — Hardening
1. Cross-account authorization tests for all mutating API endpoints (§8).
2. Cache/refresh follow & blacklist lists out-of-band (§3).
3. Re-profile hot endpoints (`stackprof`/`rack-mini-profiler`) to confirm gains.
