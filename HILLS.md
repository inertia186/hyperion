# Hill-climbing tasks

Defined 2026-10-24 from the current implementation and [project vision](VISION.md).
These are proposed tasks. The baseline work below covers inbox queries,
indexing, and Rails test coverage; preview timing, discovery relevance, and
frontend/system-test coverage remain unmeasured. The first performance targets
remain proposed until adopted.

Hill #1 now has measured improvements. Tag filtering and keyword search exceed
their proposed 30% reductions; the default-inbox target remains open. Both
indexing completeness bugs found during the baseline are fixed.

Hill #2's throughput follow-up rejected three tag-lookup variants. They reduced
SQL calls but did not improve every workload's median time. The pre-pass
indexer is restored exactly; the 2× throughput target remains open. The
[experiment](#hill-2-throughput-follow-up--2026-10-25) retains the measurements
and an additional tag-behavior regression test.

Start with inbox queries, then indexing. Discovery quality needs an agreed
definition of relevance before optimization begins.

Additional candidates #6–#10 were defined on 2026-10-25 from the current code
at base commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus the retained
working-tree changes. Their performance and fault-detection baselines are
pending. Among these additions, start with CI turnaround, then bulk read
marking: both have concrete repeated work and objective comparisons.

Hill #6 now has a locally verified asset-hook improvement: the measured
build-and-test segment's median fell **4.2%** with unchanged coverage and
checks. Complete hosted CI timing, cold/warm dependency-cache comparisons,
and its proposed 25% target remain open. See the experiment below.

Hill #7's first target is met on the fixed local workload: all bulk callers
use over 99% fewer SQL calls at 1,000 posts, and both API paths improve p95
latency by over 91%. The separate single-post guard found no material
regression. See the bulk-read experiment below.

Hill #8's target is met locally: 10,000-entry cache-hit p95 fell **99.97%**,
and p95 grows **1.10×** from 100 to 10,000 entries. The fixed cleanup deadline
and space limits held. Periodic sweeps still cause latency spikes; see the
image-cache experiment below.

Hill #9's byte target is met: initial production JavaScript fell **37.0%**.
Cold-start p95 improves **17.8% on desktop** and **25.1% on mobile**; the
proposed 20% desktop latency target remains open. First-action p95 values
stay within 1 ms of their controls. See the startup experiment below.

Hill #10 halves undetected faults on its frozen eight-fault panel: **4 → 2**.
The Rails suite stays at **363 tests**, preserves every covered line and branch,
and stays within its 10% runtime guard. The original 349-test cap remains unmet.
See the fault-detection experiment below.

Borrowed candidates **#11–#14** now have controlled baselines: duplicate revision
fetches, preview cancellation, malformed-response rejection, and shared content
fetching. Their baseline pass made no production changes. See the
[borrowed-hill baseline](#borrowed-hills-11-14-baseline--2026-10-25).

Hill #11 now meets its local target: each request fetches history once per
identity. Ordinary p95 falls **44.0%** and persisted cross-post p95 **18.5%**,
with identical response fingerprints and preserved next-request freshness.
See the [revision-reuse experiment](#hill-11-experiment--2026-10-25).

Hill #12 meets its client-side target: obsolete preview completions fall
**220 → 0**, with unchanged issued requests and modeled ready-state latency.
Native browser fixtures confirm transport cancellation. Backend cancellation
is not established; see the [tradeoff](#hill-12-experiment--2026-10-26).

Hill #13 meets its fixed-panel target: controlled malformed-result rejection
rises **1/22 → 22/22**, preserving **13/13 valid** and **2/2 error** controls.
All large-valid processing cases stay within the 20 ms added-p95 guard.
See the [response-contract experiment](#hill-13-experiment--2026-10-26).

Hill #14 meets its sequential local target: cold stats/payout pairs share one
content fetch instead of two, with **19.8–21.0% lower p95**. Forced refresh
updates both views. Concurrent cold misses still fetch twice; see the
[content-sharing experiment](#hill-14-experiment--2026-10-26).

## Shared evaluation rules

1. Fix the evaluation cases and correctness requirements before changing code.
2. Measure the baseline on a recorded dataset and environment. Control external
   services and distinguish cold-cache from warm-cache runs where relevant.
3. Change one thing per iteration and compare repeated runs against the baseline
   and the best accepted result.
4. Keep a change only when its gain exceeds measurement noise, correctness checks
   pass, and supporting measures stay within agreed limits.
5. Stop at the agreed target or after three consecutive unsuccessful experiments.
   Record the result and unresolved limits before choosing another approach.

## 1. Make inbox queries cheaper and faster

**Starting point:** [PostCurationQuery](app/services/post_curation_query.rb)
computes six mode counts, additional signal counts, and repeatedly reloads
account data.

**Evaluation:** Use a fixed dataset and request matrix covering modes, filters,
sorts, pagination, and account preferences. Measure the complete list response,
including counts and serialization.

**Primary metric:** Minimize p95 response time.

**Supporting measures:** SQL calls, database time, and allocations per request.

**Correctness requirements:** Returned posts, counts, ordering, pagination, and
account-specific exclusions must remain correct. Cover combinations of read
state, mutes, ignored tags, blacklists, and reputation filters. Improvements must
not depend on omitting response data or weakening filter semantics.

**Proposed first target:** Reduce p95 response time by 30% from the measured
baseline without material regressions in individual request cases.

## 2. Increase indexing throughput while preserving recovery

**Starting point:** [HafsqlPostIndexer](app/services/hafsql_post_indexer.rb)
processes batches of 1,000 with per-post and per-tag database operations inside
a transaction.

**Evaluation:** Replay a fixed stream spanning multiple batches. Include new
posts, edits, deletions, duplicate timestamps, repeated delivery, sweeps, and
interrupted runs followed by restart. Control upstream responses so network
variability does not obscure changes in indexing work.

**Primary metric:** Maximize distinct posts correctly synchronized per second.
Repeatedly processing the same rows does not count as additional throughput.

**Supporting measures:** Memory use, transaction duration, SQL calls, and lag
under a fixed arrival rate. Set acceptable memory and transaction limits before
optimization.

**Correctness requirements:** Complete eventual ingestion, correct post and tag
state, preserved blacklist and reputation behavior, and safe restart behavior.
Cursor advancement must not skip uncommitted work or strand rows at batch
boundaries.

**Proposed first target:** Double throughput within the agreed memory and
transaction limits.

**Current status:** The [throughput follow-up](#hill-2-throughput-follow-up--2026-10-25)
sets local evaluation limits at 256 MiB peak process RSS and 10 seconds per
measured page transaction. Three tag-lookup variants passed correctness and
resource checks but failed the timing acceptance check. No performance change
from that pass is retained.

## 3. Make moving between previews faster

**Starting point:** [usePostPreview](app/frontend/src/usePostPreview.js) fetches
detail whenever selection changes.
[PreviewPane](app/frontend/src/components/PreviewPane.jsx) also renders Markdown
in the browser.

**Evaluation:** Replay a fixed navigation sequence on desktop and mobile layouts.
Include long posts, cross-posts, revisits, rapid selection changes, revisions,
and failed requests. Use controlled network and media responses. Measure both
first visits and revisits.

**Primary metric:** Minimize p95 time from selection to readable content for the
selected post. A loading placeholder or the previous post's content does not
count as completion.

**Supporting measures:** Request count, transferred bytes, memory use, and
rendering time. Set limits on additional requests and memory before optimization.

**Correctness requirements:** Preserve revision freshness, sanitization, heading
navigation, and correct post identity. Late responses must not replace the
currently selected post. Failures must remain visible and recoverable.

**Proposed first target:** Reduce p95 time to readable content by 30% from the
measured baseline, within the agreed resource limits.

## 4. Improve the usefulness of discovery results

**Starting point:** [VISION.md](VISION.md) leaves relevance undefined beyond the
existing payout, reputation, and recency signals. Those signals alone do not
establish content quality or curator interest.

**Prerequisite:** Agree what “worth inspecting” means for a curator's stated
interests, including how to balance established and less-visible authors. This
is a product decision required before autonomous optimization.

**Evaluation:** Label a representative sample against those interests. Reserve
unseen authors and dates for evaluation, and keep the held-out labels out of
the optimization loop. Compare against the existing ranking on the same
candidate sets.

**Primary metric:** Maximize the number of useful candidates among the first
20 results, using the agreed labels.

**Correctness requirements:** Preserve explicit filters and account preferences.
Ranking changes must not redefine relevance to fit existing payout or reputation
signals. Keep the reasons for ranking understandable to the curator.

**First target:** Choose a minimum useful improvement after labeling the sample
and measuring the existing ranking. Confirm that gains hold on unseen authors
and dates before accepting them.

## 5. Measure coverage and remove redundant tests

**Starting point (2026-10-24):** CI runs Rails tests, browser system tests, and
frontend tests separately. None collected coverage when this hill was defined.
The then-latest
[Rails run](benchmarks/baselines/2026-10-24-keyword-tests.log), on 2026-10-24 at
base commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus the retained working-tree
changes, passed **349 tests and 2,528 assertions** in **8.446 seconds** of test
execution. This excludes boot and asset-building time. System/frontend counts,
their timings, and line/branch coverage were not yet baselined.

**Current status:** The [Rails coverage baseline](#hill-5-baseline--2026-10-25)
is established, and CI is configured to collect it. No tests have been removed.

**First step:** Add opt-in line and branch coverage before application code
loads, including application files that no test executes. Start with the Rails
suite; measure browser-system and frontend suites separately before reducing
either. Archive raw coverage, source hashes, test counts, assertions, runtime,
seed, worker count, and collection settings. Make the same collection available
in CI, with reports saved as artifacts.

**Evaluation:** Hold production source, coverage scope, exclusions, fixtures,
and environment fixed during each comparison. Use coverage overlap to find
candidates, then remove one redundant test or small group at a time. Compare
the exact sets of covered lines and branch outcomes, per file, against the
original baseline. An unchanged percentage can hide lost coverage elsewhere.
Repeat successful candidates with fixed alternate test orders and measure
runtime without instrumentation as well as with it.

**Primary metric:** Minimize executed test cases while preserving every
previously covered line and branch outcome in the affected suite.

**Supporting measures:** Uninstrumented suite runtime, test-code size,
assertions, and coverage collection overhead. Report suites separately so
moving work between runners cannot appear as a reduction.

**Correctness requirements:** Executing code does not prove its behavior was
asserted. For each removed test, identify retained checks for its expectations,
inputs, edge cases, and regression scenarios. Where overlap is ambiguous, keep
the test. For affected behavior, use a small fixed set of deliberate faults to
verify that the retained tests still fail; preserve the baseline's detected
faults. Do not weaken assertions, add skips, narrow coverage scope, or count
merging independent scenarios into one large test as an improvement. All
existing suites must still pass.

**Proposed first target:** Establish reproducible coverage reports, then reduce
the Rails suite's executed test count by **10%** with no lost covered lines,
branch outcomes, or checked behaviors, and no material runtime regression.
If the coverage baseline still contains 349 tests, that means **314 or fewer**.
Keep smaller proven reductions if further removals would discard distinct
checks; the target does not justify weaker tests.

## 6. Shorten CI turnaround with the same checks

**Starting point:** [CI](.github/workflows/tests.yml) explicitly builds legacy
JavaScript, CSS, and Vite assets before running Rails tests. The
[recorded Rails command](benchmarks/baselines/2026-10-25-rails-plain-1.log) also
runs the JavaScript and CSS build hooks. Dependency installation, asset
preparation, browser installation, and test execution need separate timings.

**Evaluation:** Repeat the complete workflow at a fixed commit on the same
runner class. Record per-step time, workflow elapsed time excluding queue wait,
and total runner minutes. Compare cold and warm dependency caches separately;
include both cache states in the fixed workload.

**Primary metric:** Minimize median time until all required checks finish.

**Correctness requirements:** Keep all Rails, browser-system, and frontend test
cases, assertions, coverage collection, and failure artifacts. Assets must be
built from the current source and lockfiles. Preserve failure propagation and
cache invalidation; omitting work or increasing runner capacity does not count
as an optimization in this experiment.

**Proposed first target:** Reduce complete-workflow median duration by **25%**
without increasing total runner minutes or materially regressing either cache
state. Baseline pending; the 6.960-second local Rails test median measures only
test execution and is not a CI baseline.

## 7. Make bulk read marking scale

**Starting point:** The [posts API](app/controllers/api/v1/posts_controller.rb),
[agent service](app/services/hyperion_agent.rb), and
[legacy controller](app/controllers/posts_controller.rb) loop over posts and
call [Account#mark_post_as_read!](app/models/account.rb), which performs
`find_or_create_by` for each post.

**Evaluation:** Use a fixed database with 1, 100, 1,000, and 10,000 matches.
Exercise explicit IDs and all-matching queries through every caller, including
already-read posts, duplicate IDs, invalid IDs, account isolation, and retries.
Measure SQL calls, elapsed time, allocations, and transaction duration through
the actual request/service path. Include concurrent attempts on the same set.

**Primary metric:** Minimize SQL calls for marking 1,000 matching posts read.

**Correctness requirements:** Preserve query filters, cross-page selection,
validation, response counts, and existing account state. Replays and concurrent
requests must not create duplicate read records. Define and verify interrupted
batch/retry behavior before accepting a faster implementation; bypassing model
checks without equivalent guarantees is not an improvement.

**Proposed first target:** Reduce SQL calls by **80%** and p95 duration by
**50%** for the 1,000-post case, with no material regression for a single post.
Measured and improved in the hill #7 experiment below.

## 8. Keep cached image requests fast as the cache grows

**Starting point:** [ImageProxy#call](app/services/image_proxy.rb) runs
`cleanup_expired!` before checking the requested cache entry. Cleanup scans
every metadata JSON file in the cache directory on each request.

**Evaluation:** Seed isolated cache directories with 100, 1,000, and 10,000
entries. Hold the requested image, clock, filesystem cache state, and DNS/network
fixtures fixed. Measure warm hits, cold misses, expired entries, corrupt
metadata, and concurrent requests. Record metadata files inspected per hit,
p95 latency, upstream requests, disk occupancy, and cleanup completion time.

**Primary metric:** Minimize p95 cache-hit latency with 10,000 cached images.

**Correctness requirements:** Preserve image bytes, expiry, source and redirect
validation, content types, and size limits. Expired content must not be served.
Fix a disk-reclamation deadline and occupancy limit before the baseline;
deferring cleanup indefinitely or allowing unbounded growth cannot improve the
score. Cold misses and concurrent writes must remain correct.

**First target:** Reduce large-cache hit p95 by **80%**, with hit latency
growing no more than **2×** from 100 to 10,000 entries. Met by the local
experiment below within its fixed cleanup and space limits. Do not benchmark
against the user's live cache.

## 9. Reduce the cost of opening the inbox

**Starting point:** [App](app/frontend/src/App.jsx) imports the wallet and
settings/timeline UI eagerly. The preview's import chain includes
[Markdown rendering](app/frontend/src/renderPostBody.js) and
[revision UI](app/frontend/src/components/PreviewPane.jsx). This identifies
places to measure; it does not establish which dependency dominates the build.

**Evaluation:** Build production assets and measure the full initial dependency
graph, compressed transfer bytes, parse/evaluation time, and navigation-to-usable
inbox latency. Fix desktop/mobile CPU and network profiles, session state,
responses, and cache/service-worker state. Measure first load and revisit
separately, plus the first preview, settings, timeline, revision, and wallet
actions after startup.

**Primary metric:** Minimize JavaScript bytes transferred before the inbox is
usable, counting every requested chunk and preload.

**Correctness requirements:** Preserve login, rendering safeguards, keyboard
controls, themes, wallet approval, and all current workflows. A shell or loading
placeholder is not a usable inbox. Deferred work must not cause a material
latency regression on the first action that needs it. Keep hill #3's preview
measurements as a guard.

**Proposed first target:** Reduce initial compressed JavaScript by **25%** and
cold navigation-to-usable-inbox p95 by **20%**. The experiment below meets the
byte target and mobile latency target; the desktop latency target remains
open. Development bundle sizes are not production transfer measurements.

## 10. Make existing tests detect more faults

**Starting point:** The [Rails baseline](#hill-5-baseline--2026-10-25) leaves
**437 of 1,165 branch outcomes unexecuted**. For example, the archived report
has 41 missed outcomes in `HafbePostRevisions` and 34 in `PostPayoutRefresh`.
These are candidate areas for stronger checks, not evidence of existing bugs.
This complements hill #5 by measuring fault detection directly.

**Evaluation:** Before optimizing tests, freeze a small panel of deliberate
faults in revision reconstruction, payout refresh, and read-state behavior.
Examples include accepting an unreconstructable patch, permanently suppressing
a payout after a transient timeout, or marking the wrong account's post read.
Validate that each altered version parses and changes required behavior;
exclude equivalent changes and invalid fixtures before recording the baseline.
Run each fault separately with deterministic inputs and a fixed timeout.

**Primary metric:** Minimize faults that the suite fails to detect. A timeout
or unrelated infrastructure failure is not a successful detection.

**Correctness requirements:** Keep production code, the fault panel, and the
evaluation rules fixed. Preserve all previously detected faults, covered lines,
and branch outcomes. Improve assertions and inputs without merging independent
scenarios merely to hide test-count growth. The ordinary suite must still pass.

**Proposed first target:** Halve the initially undetected faults while keeping
the Rails suite at **349 tests or fewer** and uninstrumented median runtime
within **10%** of a fresh control. Fault-detection baseline pending; if the
panel is already fully detected, record that result rather than claiming a
gain from replacing it after optimization starts.

**Current status:** The [fault-detection experiment](#hill-10-experiment--2026-10-25)
meets the halving and runtime targets without increasing test count. Earlier
hills had already increased the suite to 363 tests; its original 349-test cap
remains open. No unrelated tests were removed to satisfy that cap.

## 11. Fetch revision history once per identity per request

**Source:** Hivetop's [duplicate block-fetch hill](../hivetop/HILLS.md#4-measure-block-sizes-with-fewer-duplicate-fetches).
Reuse an already fetched response with explicit identity and lifetime bounds.

**Starting point:** The revisions action refreshes the displayed post through
`revisions_for`, then `HafbePostRevisions#call` fetches the history again.

**Evaluation:** Freeze ordinary full-body, patch, empty-history/local-fallback,
persisted cross-post, upstream-error, and between-request edit cases. Measure
HAFBE calls by identity, endpoint wall time, allocations, and response hashes.
Use one warmup and 20 measured requests per timed case, with a fixed 10 ms
upstream double. Keep request-local reuse separate from persistent caching.

**Target:** At most one HAFBE fetch per distinct identity per request; ordinary
and cross-post p95 must improve without regressing other cases by over 10%.
Keep freshness between requests, revision ordering/patch reconstruction,
local fallback, sanitization, post identity, and visible upstream failures.
Before retaining a candidate, bound additional retained data to one copy of
each fetched history for the current request and measure its allocations/RSS.

**Current status:** The [revision-reuse experiment](#hill-11-experiment--2026-10-25)
meets the target on the fixed local workload. A request-scoped service shares
raw responses and failures; parsed histories remain independent. Cold body
loading and next-request error recovery have additional regression coverage.

## 12. Cancel superseded preview requests

**Source:** Hivetop's [cancellation and deadline propagation](../hivetop/src/rpc.ts).

**Starting point:** `usePostPreview` ignores stale completions but does not
cancel the associated fetch. Clearing selection and unmounting also leave
the fetch running.

**Evaluation:** A cancellation-aware fetch double exercises the actual hook
and API wrapper in Vitest/jsdom. Freeze a 300 ms response delay, ten selections
25 ms apart, clear-selection, unmount, and current-error/recovery traces.
Run 20 repetitions per case. Record issued/aborted/obsolete-completed fetches,
peak in-flight count, and selected-post ready-state latency.

**Target:** At least 90% fewer completed obsolete fetches, at most two in
flight during the rapid trace, no increased issued calls, and selected-post
p95 no more than 5% higher. Preserve latest-post identity, clear state, visible
current failures, recovery, and scroll behavior. Browser transport, real
rendering, and whether an abort stops server work require separate validation;
this hook baseline does not measure those properties.

**Current status:** The [cancellation experiment](#hill-12-experiment--2026-10-26)
meets the hook target and verifies native disconnects/readable current content
in isolated browser fixtures. Server work can continue after abort; simulated
backend concurrency increases when browser connection slots are freed. No
production backend savings are claimed.

## 13. Reject malformed upstream data at the service boundary

**Source:** Hivetop's [proposed response-validation hill](../hivetop/HILLS.md#6-reject-malformed-rpc-responses-before-they-reach-callers),
which is not an accepted implementation or measured win there.

**Evaluation:** Freeze [37 cases](benchmarks/sibling_response_fixtures.json):
22 malformed results, 13 valid controls, and two ordinary upstream errors.
Measure HAFBE's HTTP JSON-fetch boundary and `PostChainPayload`'s decoded
condenser-result boundary. The latter starts after hive-ruby handles the RPC
envelope; it does not score wire-envelope validation. Exercise wrong outer
types, nested consumed-field types, invalid JSON, legitimate null/empty
results, optional/extra fields, and normal upstream errors.

**Target:** Controlled rejection of 22/22 malformed cases before values reach
callers, accepting 13/13 valid controls and preserving both ordinary error
controls. Rejection must carry service/method context. Silent defaults and
unrelated later exceptions do not count. Validate only the required contract;
keep valid missing-content responses and future extra fields. Preserve the
existing digest vote checks rather than counting them as new work.

**Current status:** The [response-contract experiment](#hill-13-experiment--2026-10-26)
meets the frozen matrix and processing targets. Public endpoint tests also
preserve stored payouts, avoid caching malformed results, and recover on a
later valid request. This is scoped shape/type checking, not exhaustive
protocol validation or frontend API validation under hill #15.

**Cost guard:** Measure 20 boundary calls for 5,000-entry valid history/vote/
reply responses and a decoded content result with a 1 MiB extra body field.
Candidate p95 must stay within the control p95 plus 20 ms on each fixed control.
Record allocations and total process RSS; preserve timeouts/failover and add
no upstream requests or runtime dependencies.

## 14. Share content fetched for chain stats and payout

**Source:** Hivetop's [identity-bounded payload reuse](../hivetop/HILLS.md#4-measure-block-sizes-with-fewer-duplicate-fetches).

**Starting point:** Chain stats and payout independently fetch `get_content`
under separate two-minute cache keys.

**Evaluation:** One warmup and 20 measured samples for stats→payout,
payout→stats, warm revisit, 121-second expiry, forced stats refresh, and a
second post identity, and a second account sharing the cache. Use an isolated
`MemoryStore`, controlled clocks, and
5 ms per RPC double. Record complete RPC sequences, content-call counts,
latency, allocations, vote state, and payout values. The application's test
environment normally has a null cache; this explicit store exercises TTL reuse.

**Target:** One `get_content` call per identity for each cold pair, zero on a
warm revisit, and one fresh shared content call after expiry/forced refresh.
No case may add RPC calls or regress p95 by over 10%. Keep identity/account
isolation, the 120-second TTL, explicit refresh, failure recovery, and payout
persistence. Never cache computed account vote state as identity-only content.
Before implementation, compare concurrent misses on the deployed cache backend;
the initial sequential local baseline does not establish distributed behavior.

**Current status:** Sequential targets pass on the fixed workload. An isolated
FileStore probe covers the backend inherited by checked-in production defaults;
the actual deployment configuration and distributed behavior remain unverified.
Concurrent cold misses still make two content calls. See the
[experiment](#hill-14-experiment--2026-10-26).

## 15. Validate frontend API responses before React consumes them

**Defined:** 2026-10-26. This complements hill #13's upstream service boundaries
by checking the Rails-to-browser boundary.

**Starting point:** [api.js](app/frontend/src/api.js) returns parsed JSON without
checking endpoint-specific result shapes. JSON decoding failures become `{}`,
including on successful HTTP responses.

**Score:** Percentage of a frozen malformed-response matrix rejected at the
frontend API boundary before values reach React. Report outcomes by endpoint
alongside valid-response acceptance. Annotation counts and a TypeScript
migration earn no score.

**Evaluation:** Before editing production code, freeze fixtures for the response
fields each caller consumes. Include invalid JSON, wrong outer/nested types,
missing required fields, valid null/empty values, optional/extra fields, and
ordinary HTTP errors. Exercise the real API wrapper with a fetch double, then
representative hooks to verify visible failure and recovery. Record source and
fixture hashes, request counts, valid large-response processing time, and the
date/commit of the unchanged baseline.

**Target:** Reject 100% of malformed fixtures with endpoint-specific contract
errors while preserving 100% of valid/error controls. Preserve HTTP error status
and payload information, credentials, CSRF handling, cancellation, and supported
empty responses. Validate consumed contracts without adding requests or silently
substituting defaults. Fix a processing-cost ceiling before implementation;
keep annotation or language changes outside this hill's scope.

**Baseline:** Pending. No frontend implementation changes made in this pass.

## Baseline results — 2026-10-24

Measured against application commit `ff12a97379f6eb475ffea44f2827325aa6f982a1`
on a Mac14,3 with 8 logical CPUs and 8 GiB RAM, macOS 27.0.1, Ruby 3.3.11,
Rails 8.1.4, and PostgreSQL 16.15. The run began at `2026-10-25T02:57:48Z`
(October 24 in America/Los_Angeles) and took 216.49 seconds.

The [compressed raw report](benchmarks/baselines/2026-10-24.json.gz) contains
every sample, per-round summaries, response fingerprints, correctness outcomes,
environment details, and the harness SHA-256. The
[run log](benchmarks/baselines/2026-10-24.log) includes process resource usage.

### Inbox

The dataset contains **10,000 posts and 33,039 tags**. Each row below summarizes
60 measured requests. SQL counts and allocations are medians; latency columns
are milliseconds. Percentiles use nearest-rank selection, including p50.

| Case | p50 ms | p95 ms | SQL calls | SQL time p50 ms | Allocations p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default unread | 65.9 | 95.9 | 59 | 47.1 | 26,888 |
| Read | 55.3 | 72.8 | 58 | 39.0 | 23,499 |
| Ignored | 60.5 | 84.9 | 58 | 42.7 | 26,155 |
| Deleted | 35.5 | 40.2 | 58 | 20.2 | 23,701 |
| Blacklisted | 49.7 | 54.7 | 58 | 33.9 | 24,052 |
| Keyword search | 240.8 | 260.7 | 58 | 207.5 | 24,300 |
| Tag filter | 319.6 | 351.3 | 60 | 281.5 | 28,677 |
| Combined tag/app filters | 185.8 | 198.7 | 60 | 148.5 | 31,627 |
| Author filter | 21.6 | 25.3 | 39 | 7.9 | 19,362 |
| Most prolific sort | 79.0 | 117.0 | 59 | 56.1 | 26,913 |
| Most tags sort | 73.3 | 103.8 | 59 | 50.7 | 27,749 |
| Highest payout sort | 70.4 | 95.7 | 59 | 49.6 | 26,916 |
| Third page | 68.1 | 96.0 | 59 | 47.1 | 26,916 |
| Mutes enabled | 73.2 | 101.4 | 75 | 49.8 | 32,632 |
| Favorites only | 82.6 | 109.0 | 60 | 61.1 | 29,081 |

The default request executes **11 post-count queries and 30 tag-existence
queries** among its 59 database calls. These are measured candidates for reducing
database work. Tag-filter and keyword requests spend most of their time in SQL.

Response fingerprints stayed stable across all measured repetitions. Timing
varied between rounds: default-unread p95 was 98.3 ms and 73.0 ms; tag-filter
p95 was 321.5 ms and 353.7 ms. The author case had p95 of 42.8 ms and 24.4 ms.
Use repeated comparable runs to assess gains; small timing changes are not yet
convincing evidence of improvement.

The proposed 30% reduction translates to approximately **67.1 ms p95** for the
default inbox, **245.9 ms** for the tag case, and **182.5 ms** for keyword search
on this workload. Preserve results and check every case for regressions.

### Indexing

Ten measured trials per scenario followed one warmup. Transaction time closely
matched total time: median 2.640 seconds for inserts, 5.827 seconds for edits,
and 0.361 seconds for replay. With only ten samples, nearest-rank p95 is the
observed maximum, not a reliable production tail estimate.

| Scenario | Source rows | p50 seconds | Observed max seconds | SQL calls | Useful posts/second p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Insert new posts | 1,000 | 2.641 | 4.470 | 16,005 | 375.3 |
| Edit all posts, delete 100, replace tags | 1,000 | 5.828 | 7.379 | 12,005 | 169.2 |
| Replay unchanged overlap | 301 | 0.362 | 0.854 | 1,509 | 0 |

Median allocations were 2,672,208 for inserts, 2,025,221 for edits, and 485,559
for replay. Whole-process maximum RSS was approximately **142.5 MiB**, including
both workloads, fixture setup, and retained measurements. This is not a
per-transaction memory ceiling.

The proposed doubling target is approximately **750.6 newly synchronized
posts/second** and **338.3 edited posts/second** on these respective cases.
Completeness and recovery must pass before a faster result can be accepted.

### Correctness findings

The initial benchmark passed 96 of 98 checks and exited with status 2 after
saving the report. Both failures were reproduced before changing application
code and are resolved by the pagination fix described below.

- [x] **Equal timestamps can prevent forward progress.** With 1,200 source rows
  sharing an update timestamp, three indexer calls produced distinct-post counts
  of **1,000 → 1,000 → 1,000**. The original source query ordered only by update
  time, limited each fetch to 1,000, and reopened the five-minute overlap from
  the same cursor.
  The remaining 200 rows were never ingested in this fixed-source reproduction.
- [x] **Sweeps do not cover rows beyond the first batch.** After ingesting 2,500
  rows, the harness removed local post 1,200, outside the incremental overlap.
  Two forced sweeps both failed to restore it. Each original sweep fetched only
  the first 1,000 source rows and marked the sweep complete.

In that initial run, the ordinary multi-batch stream reached all 2,500 rows,
with counts of 1,000 → 1,699 → 2,398 → 2,500 → 2,500. An exception injected after row 501
rolled back posts and tags without advancing the cursor; restarting ingested all
1,000 rows. All batch checks for counts, tag replacement and counters, blacklist
state, reputations, and idempotent replay passed.

**Next step:** hill #1 can proceed against the inbox matrix above. Hill #2 can
now pursue throughput improvements while preserving the recovery checks.

### Indexer fix verification — 2026-10-24

The indexer now visits every page in `(updated_at, id)` order, bounded by the
latest source row at the start of the pass. A due sweep covers the whole active
seven-day window. Each page has its own transaction, and the saved checkpoint
advances only after the complete pass succeeds. If a later page fails, completed
pages remain committed and are safely replayed on retry. No schema change is
required.

The [full Rails suite](benchmarks/baselines/2026-10-24-indexer-tests.log) passed:
**339 tests, 2,428 assertions, zero failures, errors, or skips**. Six new
regression tests execute the production queries
against PostgreSQL, covering tied timestamps, overlap across pages, full sweeps,
later-page rollback and retry, arrivals beyond the initial boundary, and empty
sweeps. The tied-timestamp case also covers IDs larger than 32 bits.

The unchanged workloads and checks were rerun at `2026-10-25T03:09:38Z`
(October 24 locally), against the same base commit plus this indexer patch.
The [verification report](benchmarks/baselines/2026-10-24-indexer-fixed.json.gz)
records the harness and indexer SHA-256 hashes; the harness's only change was
adding the indexer hash to its metadata. All **98 of 98 checks passed**:

- Tied timestamps: **1,200 → 1,200 → 1,200** distinct posts.
- Ordinary stream: all **2,500** posts on the first call and each of four replays.
- Both forced sweeps restored the missing post beyond the first batch.
- Rollback, retry, tags, counters, reputations, blacklists, and replay checks passed.
- All 900 measured inbox requests remained stable, and all 15 response
  fingerprints matched the original baseline exactly.

The [verification log](benchmarks/baselines/2026-10-24-indexer-fixed.log) records
236.27 seconds elapsed and approximately 139.3 MiB maximum RSS. The ten indexing
trials per scenario gave these results:

| Scenario | p50 seconds | Observed max seconds | SQL calls | Useful posts/second p50 |
| --- | ---: | ---: | ---: | ---: |
| Insert new posts | 2.830 | 7.086 | 16,008 | 309.4 |
| Edit/delete/replace tags | 5.811 | 6.433 | 12,008 | 171.6 |
| Replay unchanged overlap | 0.353 | 0.570 | 1,511 | 0 |

Insert median duration rose 7.1% from the original run; edits and replay were
similar. These measurements establish the repaired behavior, not achievement
of a throughput target. Full sweeps now do more work per call because they visit
every page. Live HafSQL latency, source query plans, and sustained production
load remain untested.

## Hill #1 experiments — 2026-10-24

The experiments use the same dataset, request matrix, frozen time, and base
commit as the baseline, with the verified indexer fix retained. Each run makes
900 measured requests: 60 per case across two interleaved rounds. The harness
now supports `HILLS_WORKLOAD=inbox` to omit the separate indexing workload and
records hashes of the relevant application files. Inbox workloads and response
checks are unchanged.

A [fresh control](benchmarks/baselines/2026-10-24-inbox-control.json.gz)
reproduced the default request's 59 SQL calls and 94.6 ms p95. Its response
fingerprints match the original baseline. Changes were measured separately:

1. [Preload tags](benchmarks/baselines/2026-10-24-inbox-tags.json.gz) for the
   response and cross-post detection together. This removed all 30 per-post
   tag-existence queries and reduced default-request allocations from 26,891
   to 22,095. On its own, it did not improve p95 beyond measurement noise.
2. [Group prolific-author counts](benchmarks/baselines/2026-10-24-inbox-grouped.json.gz)
   once per query instead of recounting for every candidate post. The
   [query plans](benchmarks/baselines/2026-10-24-inbox-query-plans.json.gz) showed
   3,484 executions of that subquery in the tag-filter case. This change brought
   default p95 to 67.0 ms and tag-filter p95 to 75.9 ms, with identical responses.
3. [Group tag-utilization counts](benchmarks/baselines/2026-10-24-inbox-tag-count.json.gz)
   was **rejected and reverted**. It preserved responses but raised combined-filter
   p95 from 107.9 to 566.2 ms and regressed the other cases. The original indexed
   per-post tag count remains in place.
4. Reuse the already-computed selected mode or signal count for pagination,
   removing one repeated post-count query. The verification below measures this
   together with retained changes 1 and 2.

The [full Rails suite](benchmarks/baselines/2026-10-24-inbox-tests.log) passed:
**344 tests, 2,474 assertions, zero failures, errors, or skips**. New checks cover
cross-post markers in metadata and stored tags, tag order, empty tag lists,
author history outside the visible scope, tag-count thresholds with stale
counters, and pagination totals for all six modes and all signals.

### Retained changes: repeated verification

[Run 1](benchmarks/baselines/2026-10-24-inbox-final-1.json.gz) began at
`2026-10-25T03:40:15Z`; [run 2](benchmarks/baselines/2026-10-24-inbox-final-2.json.gz)
at `2026-10-25T03:41:42Z` (both October 24 locally). All **1,800 measured
responses** preserved the original fingerprints, and every correctness check
passed. Both reports' application and harness hashes match the retained code.

The table reports p95 milliseconds and median SQL calls. The control and each
verification run have 60 measurements per case. Both verification runs are
shown so the slower result is visible.

| Case | Control p95 ms | Run 1 p95 ms | Run 2 p95 ms | SQL calls before → after |
| --- | ---: | ---: | ---: | ---: |
| Default unread | 94.6 | 69.4 | 80.4 | 59 → 28 |
| Read | 64.2 | 57.5 | 64.8 | 58 → 27 |
| Ignored | 83.4 | 58.7 | 65.8 | 58 → 27 |
| Deleted | 41.7 | 35.9 | 36.6 | 58 → 27 |
| Blacklisted | 54.6 | 56.3 | 57.7 | 58 → 27 |
| Keyword search | 256.1 | 236.1 | 241.2 | 58 → 27 |
| Tag filter | 323.0 | 79.1 | 83.2 | 60 → 29 |
| Combined tag/app filters | 194.8 | 107.8 | 121.8 | 60 → 29 |
| Author filter | 26.3 | 23.2 | 22.8 | 39 → 28 |
| Most prolific sort | 116.1 | 88.1 | 95.5 | 59 → 28 |
| Most tags sort | 105.2 | 78.4 | 84.3 | 59 → 28 |
| Highest payout sort | 93.6 | 69.6 | 74.6 | 59 → 28 |
| Third page | 94.9 | 65.1 | 75.8 | 59 → 28 |
| Mutes enabled | 103.1 | 74.2 | 78.2 | 75 → 44 |
| Favorites only | 108.1 | 87.6 | 81.8 | 60 → 29 |

Default-request allocations fell **18.4%**, from 26,891 to 21,945 in both runs.
Its post-count queries fell from 11 to 10, and tag-existence queries from 30 to
zero. Run logs with process resource usage accompany the reports:
[run 1 log](benchmarks/baselines/2026-10-24-inbox-final-1.log) and
[run 2 log](benchmarks/baselines/2026-10-24-inbox-final-2.log).

Using the slower verification run, p95 improved **15.0%** for default unread,
**74.2%** for tag filtering, and **5.8%** for keyword search against the fresh
control. Read latency was essentially unchanged; blacklisted p95 rose by about
3.1 ms (5.7%), so that case needs attention in subsequent comparisons. These
are local synthetic measurements, not production latency claims.

**First-pass status:** retain these changes as progress on hill #1. The 30% target is not
yet consistently met for default unread, and keyword search remains the slowest
case. Next investigate its repeated title/body scans and remaining count work,
while preserving the request matrix and watching the blacklisted case. Production
load and concurrent requests remain unmeasured.

### Keyword follow-up — 2026-10-24

The [fresh keyword control](benchmarks/baselines/2026-10-24-keyword-control.json.gz)
retains all accepted changes from the first pass. Keyword p95 was 234.7 ms,
with 27 SQL calls. Twelve statements repeated the title/body search: ten count
variants, the page query, and the related-author query.

The first experiment shared matching IDs across the ten counts in one SQL
statement. It cut keyword p95 to 114.0 ms with identical responses in the
[request matrix](benchmarks/baselines/2026-10-24-keyword-ids.json.gz). However,
a [supplemental probe](benchmarks/baselines/2026-10-24-keyword-ids-probe.json.gz)
found a regression for broad searches: query-service median time for `Post`
rose from 64.5 to 101.7 ms and for `p` from 62.8 to 100.1 ms. This version was
revised rather than accepted.

The revision shares the matching rows' list columns, excluding bodies, through
a materialized PostgreSQL CTE. The count variants read those rows directly;
author-history and poisoned-author subqueries still use the complete posts
table. Page loading, related-author lookup, and bulk marking retain their
ordinary relations. The request now has three statements containing the search
predicate, with 18 SQL calls overall in the keyword case.

The [full Rails suite](benchmarks/baselines/2026-10-24-keyword-tests.log) passed:
**349 tests, 2,528 assertions, zero failures, errors, or skips**. Added checks
cover literal `%`, `_`, and quote characters; multiple terms; mention-only
input; author history and poisoned posts outside the search matches; all modes
and signals with and without a search; and marking all matches beyond page one.

[Run 1](benchmarks/baselines/2026-10-24-keyword-rows-1.json.gz) began at
`2026-10-25T04:04:11Z`; [run 2](benchmarks/baselines/2026-10-24-keyword-rows-2.json.gz)
at `2026-10-25T04:06:53Z` (both October 24 locally). All **1,800 measured
responses** preserved the original baseline fingerprints, and every correctness
check passed. Application and harness hashes match the retained code. Each case
has 60 measurements per run; p95 values were verified against the raw samples.

| Case | Fresh control p95 ms | Run 1 p95 ms | Run 2 p95 ms |
| --- | ---: | ---: | ---: |
| Default unread | 76.2 | 70.0 | 66.8 |
| Read | 61.9 | 55.8 | 61.7 |
| Ignored | 66.3 | 57.9 | 67.2 |
| Deleted | 37.0 | 34.8 | 38.3 |
| Blacklisted | 57.2 | 58.5 | 59.5 |
| Keyword search | 234.7 | 103.9 | 105.7 |
| Tag filter | 83.1 | 77.7 | 84.9 |
| Combined tag/app filters | 118.9 | 109.0 | 112.5 |
| Author filter | 22.8 | 22.4 | 22.8 |
| Most prolific sort | 99.2 | 89.4 | 98.5 |
| Most tags sort | 84.8 | 76.1 | 84.7 |
| Highest payout sort | 73.8 | 69.6 | 69.2 |
| Third page | 74.3 | 64.2 | 68.7 |
| Mutes enabled | 82.4 | 76.2 | 74.1 |
| Favorites only | 81.1 | 79.5 | 82.6 |

The slower run reduced keyword p95 **55.0%** against the fresh control, meeting
the original proposed threshold of approximately **182.5 ms**. Keyword median
database time fell from 186.9 ms to 72.9 / 74.0 ms; median allocations fell from
19,410 to 19,018 / 19,019. SQL calls fell from 27 to 18 for keyword search and
were unchanged in the other cases. Blacklisted p95 was 2.3 ms (3.9%) higher in
the slower run; retain it as a case to watch, rather than claiming every case
improved. Non-keyword default allocations rose slightly, from 21,945 to 22,011.

The [query plan](benchmarks/baselines/2026-10-24-keyword-rows-query-plans.json.gz)
confirms that the count statement evaluates the 769-row `keyword_posts` CTE once.
Process resource measurements accompany the reports in the
[run 1 log](benchmarks/baselines/2026-10-24-keyword-rows-1.log) and
[run 2 log](benchmarks/baselines/2026-10-24-keyword-rows-2.log).

A [supplemental probe](benchmarks/baselines/2026-10-24-keyword-rows-probe.json.gz)
compares the previous and retained query service in alternating order, with one
warmup and ten measured calls per version. It checks posts, counts, related
authors, and suggestions on every call. All results matched:

| Search | Matches | Previous median ms | Retained median ms |
| --- | ---: | ---: | ---: |
| `needle` | 769 | 214.9 | 89.9 |
| `needle curation` | 769 | 431.9 | 309.4 |
| `Post` | 10,000 | 49.3 | 51.9 |
| `p` | 10,000 | 59.8 | 56.0 |
| `zzzxxyy` | 0 | 218.2 | 95.1 |

These are query-service timings, excluding the API response and serialization;
they are not comparable to the request p95 target. The broad `Post` search's
median rose 2.6 ms, with overlapping observed ranges (45.5–66.5 ms before,
45.2–59.3 ms after). The large broad-search regression from the ID experiment
is absent in this probe. Its [script](benchmarks/keyword_probe.rb) verifies the
previous source hash against the control before comparing versions.

**Current status:** retain the shared keyword-count scan. Tag and keyword
targets are met on the fixed local workload. Default unread still needs a
consistent p95 below approximately 67.1 ms; its slower result here was 70.0 ms.
Production-scale data and concurrent requests remain untested.

## Hill #5 baseline — 2026-10-25

The unchanged Rails suite passed **349 tests and 2,528 assertions**, with zero
failures, errors, or skips in each of six full runs. Three runs collected
coverage and three ran without instrumentation. Seeds were `6604` twice and
`20261025` once per version; the second pair reversed execution order. All
three coverage runs produced **identical sets of covered lines and branch
outcomes**, including the different test order.

| Measure | Covered | Total | Coverage |
| --- | ---: | ---: | ---: |
| Executable lines | 3,098 | 3,675 | 84.30% |
| Branch outcomes | 728 | 1,165 | 62.49% |

The scope is all **71 Ruby files matching `{app,lib}/**/*.rb`**. Collection starts
before application loading; coverage runs eagerly load application classes so
uncalled methods and their branches remain in the denominator. A completeness
check rejects a report if a scoped file was missed or the reported file set
differs. Execution during application boot counts as coverage, so these totals
do not imply that every covered line has a behavior assertion.

This baseline excludes browser-system tests, frontend tests, templates,
configuration, and Rake tasks. It measures application Ruby coverage from
`rails test`; it is not whole-product coverage. Production code and existing
test cases were unchanged during measurement.

Both versions used one worker, Ruby 3.3.11, Node 26.12.0, PostgreSQL 16.15,
the dedicated `hyperion_hills_test` database, and existing dependencies with
`SKIP_YARN_INSTALL=1`. These are local warm runs on the same host as the earlier
baselines, at base commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus the
retained working-tree changes and coverage setup.

| Measure | Without coverage | With coverage |
| --- | ---: | ---: |
| Test execution median | 6.960 s | 8.898 s |
| Test execution range | 6.588–8.193 s | 7.472–9.173 s |
| Whole command median | 9.261 s | 11.845 s |
| Maximum RSS median | 326.3 MiB | 380.9 MiB |

Coverage added approximately **27.9%** to the median test and command durations.
The command measurement includes startup, asset preparation, and coverage
report generation; the test timer excludes those. With three runs per version,
these figures describe observed overhead, not a reliable p95 estimate. Future
test reductions should retain the uninstrumented comparison.

The [measurement manifest](benchmarks/baselines/2026-10-25-rails-baseline.json.gz)
records every run, commands, source/config/test hashes, working-tree state,
environment, and the hash of the
[frozen measurement driver](benchmarks/baselines/2026-10-25-rails-baseline.py).
Raw reports preserve per-line and per-branch hit counts with relative file
paths and source hashes:

- [Coverage run 1](benchmarks/baselines/2026-10-25-rails-coverage-1.json.gz),
  [log](benchmarks/baselines/2026-10-25-rails-coverage-1.log),
  [uninstrumented log](benchmarks/baselines/2026-10-25-rails-plain-1.log).
- [Coverage run 2](benchmarks/baselines/2026-10-25-rails-coverage-2.json.gz),
  [log](benchmarks/baselines/2026-10-25-rails-coverage-2.log),
  [uninstrumented log](benchmarks/baselines/2026-10-25-rails-plain-2.log).
- [Coverage run 3](benchmarks/baselines/2026-10-25-rails-coverage-3.json.gz),
  [log](benchmarks/baselines/2026-10-25-rails-coverage-3.log),
  [uninstrumented log](benchmarks/baselines/2026-10-25-rails-plain-3.log).

### Collecting Rails coverage

[test/coverage.rb](test/coverage.rb) configures SimpleCov 0.22.0, using its
[documented early startup and branch collection](https://github.com/simplecov-ruby/simplecov/blob/v0.22.0/README.md).
The opt-in flag is `COVERAGE=1`. It requires `RAILS_ENV=test` and one worker;
ordinary test runs keep their existing parallel setup. Reports never merge
cached results from other runs or suites.

```sh
source ~/.nvm/nvm.sh
nvm use 26
export RAILS_ENV=test
export DATABASE_URL='postgresql:///hyperion_hills_test?gssencmode=disable'
export RBENV_VERSION=3.3.11
export PARALLEL_WORKERS=1
export SKIP_YARN_INSTALL=1
# Reset only this dedicated scratch database, especially after an inbox benchmark.
rbenv exec bundle exec rails db:schema:load
COVERAGE=1 rbenv exec bundle exec rails test --seed 6604
```

Read `coverage/rails/index.html` for the browsable report and
`coverage/rails/coverage.json` for exact hit counts, seed, source hashes, and
settings. Each coverage run replaces these generated reports; archive them
before another measurement. Repeat with `COVERAGE=0` for timing without
instrumentation and with `--seed 20261025` for the alternate order.

[CI](.github/workflows/tests.yml) enables coverage only for the Rails test step
and uploads `coverage/rails/` as the `rails-coverage` artifact, including after a
test failure. Its YAML and settings were checked locally; the hosted workflow
has not been run for this change. No percentage threshold or test reduction
has been introduced. The next experiment can remove a demonstrably redundant
test while comparing against these exact covered sets and preserving its
distinct assertions and regression checks.

## Baseline procedure

[benchmarks/hills.rb](benchmarks/hills.rb) runs against the dedicated local
`hyperion_hills_test` database. It refuses other database names or Rails
environments and replaces the scratch data on each run. The harness does not
modify application code.

```sh
export RAILS_ENV=test
export DATABASE_URL='postgresql:///hyperion_hills_test?gssencmode=disable'
export RBENV_VERSION=3.3.11
rbenv exec bundle exec rails db:create db:schema:load
rbenv exec bundle exec rails runner --skip-executor benchmarks/hills.rb
```

The default output is `tmp/hills-baseline.json`. `HILLS_OUTPUT` changes the
destination. `HILLS_SAMPLES`, `HILLS_ROUNDS`, and `HILLS_INDEX_SAMPLES` control
sample counts; record overrides when comparing results. Exit status 2 means
measurements were saved but a correctness check failed. Fix the cause before
accepting a performance improvement; do not relax the check to improve the score.

To repeat only the inbox workload with the same 900-request matrix:

```sh
HILLS_WORKLOAD=inbox HILLS_OUTPUT=tmp/hills-inbox.json \
  rbenv exec bundle exec rails runner --skip-executor benchmarks/hills.rb
```

Immediately after that inbox run has seeded the scratch database, repeat the
supplemental keyword probe with the same environment:

```sh
rbenv exec bundle exec rails runner --skip-executor benchmarks/keyword_probe.rb
```

It writes `tmp/hills-keyword-probe.json`. The comparison intentionally requires
the archived control's other inbox source hashes to remain unchanged.

### Workloads and measurement limits

- Inbox: 10,000 synthetic posts, 500 authors, varied ages, tags, read state,
  blacklists, reputations, and payouts. Fifteen request cases cover all six
  modes, tag/author/app filters, three additional sorts, pagination, mutes, and
  favorites. Each case gets three initial requests followed by two interleaved
  rounds of 30 measured requests, for 900 measured requests in total.
- Requests go through the Rails Rack application, bearer authentication,
  middleware, query service, and JSON serialization. They exclude browser work,
  HTTP transport, and live upstream latency. Session preferences are set through
  the real API; the mute refresh is stubbed to preserve the fixed muted list.
- The Rails test environment uses its null cache store. The process and database
  are warm for measured requests. Initial request timings are saved separately;
  they are not a cold-disk baseline. Garbage collection remains enabled.
- Indexing: one warmup followed by ten measured trials of 1,000 new posts, an
  overlapping replay, and 1,000 edits including 100 deletions and tag replacement.
  The production source SQL runs against a real local PostgreSQL source table.
  Reputation and blacklist caches are prefilled; live Hive calls use the existing
  test fake. Source data, cache priming, and verification are outside timings.
- Indexing transactions commit normally. Source and destination share a local
  database connection, so these figures exclude remote HafSQL transport and
  contention. The replay selects 301 overlapping rows and contributes zero newly
  synchronized posts. Recovery checks separately exercise multiple batches,
  sweeps, equal timestamps, and rollback after an injected exception.
- SQL counts exclude schema queries, transaction-control statements, and query
  cache hits; cache hits are reported separately. SQL time is adapter notification
  time. Allocation counts cover Ruby objects. Transaction timing comes from Rails
  transaction notifications. RSS snapshots are process observations, not per-task
  peak-memory limits.
- Response fingerprints check that identical requests remain stable. Existing
  tests supply additional correctness evidence; neither replaces a complete
  independent oracle for every generated filter combination. Production-scale
  data, concurrent users, sustained arrival-rate lag, and real outages remain
  unmeasured.

### Existing test baseline

Before the fix, the focused Rails suite passed on 2026-10-24:
**98 tests, 687 assertions, zero failures, errors, or skips**.
It covers the posts API, curation parameters,
sorts and associations, keyword search, HafSQL indexing, posts, and tag counters.
Run it with the same test database environment shown above:

```sh
PARALLEL_WORKERS=1 rbenv exec bundle exec rails test \
  test/controllers/api/v1/posts_controller_test.rb \
  test/services/post_curation_params_test.rb \
  test/services/post_curation_sort_test.rb \
  test/services/post_curation_associations_test.rb \
  test/services/post_keyword_search_test.rb \
  test/services/hafsql_post_indexer_test.rb \
  test/models/post_test.rb test/models/tag_count_test.rb
```

The benchmark's larger recovery scenarios provide additional checks beyond
this suite. Passing the existing suite does not imply those scenarios pass.

Before running Rails tests after a benchmark, reload the dedicated scratch
schema: the benchmark leaves authentication and indexer rows that the test
fixtures do not clear. The verified
run used the installed Node 26.12.0 runtime and existing JavaScript dependencies;
`SKIP_YARN_INSTALL=1` skips the asset hooks' dependency reinstall.

```sh
# With RAILS_ENV, DATABASE_URL, and RBENV_VERSION set as above:
source ~/.nvm/nvm.sh
nvm use 26
rbenv exec bundle exec rails db:schema:load
PARALLEL_WORKERS=1 SKIP_YARN_INSTALL=1 rbenv exec bundle exec rails test
```

## Hill #6 experiment — 2026-10-25

**Retained change:** The Rails and system-test steps set `SKIP_JS_BUILD=1`
and `SKIP_CSS_BUILD=1`. Both use the JavaScript, CSS, and Vite bundles built
explicitly earlier in the same job. The flags affect the bundling gems'
automatic test prerequisites; the explicit builds still run and fail the job
on error. The installed jsbundling-rails 1.3.1 and cssbundling-rails 1.4.3
implement these flags in their `lib/tasks/*/build.rake` files. Coverage flags,
test commands, dependency installation, and artifact uploads are preserved.

**Local screening workload:** Three paired trials at base commit
`ff12a97379f6eb475ffea44f2827325aa6f982a1` plus the retained working-tree
changes. Each trial runs explicit JavaScript, CSS, and Vite builds, the full
Rails suite with coverage, and all browser-system tests. Dependencies are
already installed; both versions use `SKIP_YARN_INSTALL=1`. Thus these timings
exclude CI dependency installation and the baseline's repeated `npm install`
calls. Seeds are `6604`, `20261025`, and `6604`; pair two reverses the order.
Ruby 3.3.11, Node 26.12.0, one worker, the existing local PostgreSQL 16 server,
and the dedicated `hyperion_hills_test` database are held fixed.

The baseline runs both automatic build hooks in each test command; the
candidate sets the same two skip flags used in the workflow. Every trial
builds assets explicitly from current source before testing. The measured
JavaScript/CSS build count falls from **six to two** per trial; Vite continues
to build once. All source/test/config hashes remain unchanged during the
experiment, and every trial verifies that test hooks leave the explicitly
built asset bytes unchanged.

Local elapsed seconds, including explicit builds and both suites:

- Pair 1: **26.183 → 24.053** (2.130 seconds saved).
- Pair 2, candidate first: **25.120 → 24.071** (1.049 seconds saved).
- Pair 3: **23.589 → 22.034** (1.555 seconds saved).

The separate medians are **25.120 → 24.053 seconds**, a **4.2%** reduction.
All three paired comparisons improve, but individual stage timings vary; this
small local sample does not establish a hosted CI latency improvement or p95.

Every trial passes **349 Rails tests / 2,528 assertions** and **7 browser
tests / 185 assertions**, with no failures, errors, or skips. All six coverage
reports have the exact same covered line and branch-outcome sets: **3,098 of
3,675 lines** and **728 of 1,165 branch outcomes** across 71 files. A separate
frontend validation passes **325 tests across 40 files**; its runtime is not
included in the paired measurements.

**Artifacts:** The [measurement driver](benchmarks/ci_asset_hooks.py) asserts
test counts, complete covered sets, source hashes, and asset hashes. The
[raw manifest](benchmarks/baselines/2026-10-25-ci-asset-hooks-clean.json.gz)
records commands, stage timings, environment, working-tree state, and driver
hash. Its `runs` entries link all six raw coverage reports and per-stage logs.
The [frontend log](benchmarks/baselines/2026-10-25-ci-frontend.log) records the
separate check. Reports refuse to overwrite prior experiment files.

**Local environment correction:** An initial unchanged control passed Rails
but failed six browser sign-ins because `public/assets` contained a stale May
Sprockets manifest. The diagnostic logs are named
`2026-10-25-ci-asset-hooks-stale-assets-pilot-*`; they are excluded from timing
comparisons. Temporarily moving that generated directory to
`tmp/hills-saved-public-assets` made the unchanged browser suite pass. It stayed
aside for all six measured trials and was restored afterwards. The driver
requires `public/assets` to be absent and creates a temporary browser shim to
use the installed `/Applications/Chromium.app` because the Playwright-managed
browser is absent. The shim is identical for both versions and is removed
after measurement. Reproduction must repeat these setup/restore steps and
reload only the scratch database before running the driver.

**Hosted reference and remaining target:** GitHub run `39060290957` at the
base commit passed on 2026-10-17. Its jobs took 107 seconds for Rails and 54
seconds for frontend; the archived
[step metadata](benchmarks/baselines/2026-10-25-ci-hosted-reference.json.gz)
is a reference, not this working tree's baseline. It predates coverage setup,
and cache state was not classified. The log confirms repeated dependency
installs in both test steps. This pass does not claim the proposed **25%**
complete-workflow target: repeated hosted runs with controlled cold/warm
dependency caches, required-check elapsed time, total runner minutes, and
CI's Playwright-managed Chromium remain to be measured. No hosted workflow
was dispatched and no changes were committed or pushed during this pass.

## Hill #7 experiment — 2026-10-25

**Retained change:** `Account#mark_posts_as_read!` writes batches of at most
1,000 existing post IDs with `insert_all`, using the existing unique
`(account_id, post_id)` index to skip duplicates. The posts API, agent service,
and legacy bulk action share it. Single-post actions keep their existing
implementation. Caller-specific scopes and response formats are unchanged;
in particular, the agent still counts attempted normalized IDs, including
missing numeric IDs, rather than reporting only new inserts.

The post relation supplies the existence check previously performed by
`ReadPost` validation, the association supplies the current account, and the
unique index supplies the uniqueness guarantee. `ReadPost` has no additional
callbacks or validations. Inserts are ordered by post ID. Existing read rows
and timestamps remain untouched, and each insert statement is atomic. An
interruption retains completed batches; retrying skips their existing rows
and finishes the remainder. The operation is not an all-batches transaction.

**Fixed evaluation:** The [driver](benchmarks/bulk_read.rb) runs only against
`hyperion_hills_test` in the test environment and replaces its scratch data.
It creates 10,000 posts, a curator, another account, and fixed tags. For each
caller it exercises explicit IDs and its all-matching/tag path at 1, 100,
1,000, and 10,000 candidate posts. Explicit requests include duplicate IDs, a
nonnumeric ID, and a missing numeric ID. Every tenth post is already read,
and another account has an independent read row. The unread matching scopes
exclude those existing rows: the 1,000-candidate matching cases write 900
eligible posts, and the 10,000-candidate cases write 9,000. The explicit-ID
cases target the full candidate set. Every request is replayed
and checks exact stored IDs, account isolation, and existing timestamps.
Matching requests specify a one-item page so the check detects pagination
leaking into bulk selection.

Each case has one unmeasured warmup. API cases with 1 and 1,000 posts have
20 measured samples each; other cases have three, for **140 samples per
version**, plus replays. Requests pass through Rack, bearer authentication,
the actual controllers, and serialization/redirects. Hive responses use the
existing fake, PostgreSQL is real, and external HTTP transport/browser time
is excluded. Ruby 3.3.11, Node 26.12.0, the existing PostgreSQL 16 server, and
the workload clock (`2026-10-25T12:00:00Z`) are fixed. The raw reports'
`recorded_at` uses that simulated clock; they are not wall-clock start times.

The control is base commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus
the retained earlier hill changes. Source hashes confirm that the candidate
differs only in the account model and three bulk callers. The measurement
driver is identical in both runs. All **140 response pairs and their replay
responses are identical**, including missing-ID and already-read counts.

**1,000-post SQL calls, medians:**

- Posts API: explicit IDs **3,711 → 8**; all matching **3,626 → 28**.
- Agent: explicit IDs **3,707 → 8**; all matching **3,626 → 28**.
- Legacy: explicit IDs **3,710 → 7**; tag matching **2,706 → 8**.

All exceed the proposed 80% reduction. For the API's 20-sample cases,
nearest-rank p95 falls **1,616.38 → 68.72 ms** for explicit IDs (**95.7%**)
and **1,189.51 → 104.27 ms** for all matching (**91.2%**), exceeding the
50% target. Three samples for other callers establish deterministic SQL
reductions but do not support a reliable latency-tail estimate. API
allocations at 1,000 posts fall from a median **1,046,065 → 68,129** for
explicit IDs and **1,050,196 → 63,376** for all matching. The 10,000-post
medians across callers fall from **10.70–14.61 seconds** to **0.47–0.90
seconds**. Full samples and supporting measures are archived.

**Single-post guard:** The first three-sample agent result was noisy, so a
separate guard uses exactly one explicit ID, omitting the invalid/duplicate
extras, and one matching post. It repeats all six caller/path combinations
30 times in each of four processes: control, candidate, candidate, control.
That gives **60 samples per version per case**, or 720 measured requests
plus warmups and replays. The [control driver](benchmarks/bulk_read_single.py)
checks original source hashes before switching only the four changed files,
then restores the candidate in `finally`. Its derived Ruby workload differs
only in size, sample count, and omission of explicit-ID extras; its frozen
[driver source](benchmarks/baselines/2026-10-25-bulk-read-single-driver.rb.gz)
is archived and runs from `tmp/hills-bulk-single.rb`.

Explicit-ID p95 changes are **11.21 → 4.45 ms** (API), **4.39 → 4.18 ms**
(agent), and **4.30 → 3.63 ms** (legacy). Matching p95 changes are **82.72 →
83.55 ms** (API), **88.32 → 85.64 ms** (agent), and **5.63 → 5.17 ms**
(legacy). The API matching difference is 0.83 ms / 1.0%; no material
single-post regression was observed.

**Correctness validation:** Added tests cover duplicate/invalid IDs,
caller-specific counts and tag exclusions, account isolation, preserved
timestamps, a second-batch interruption followed by retry, and two concurrent
connections marking the same 2,005 posts. The focused suite passes **84 tests
/ 795 assertions**. The full Rails suite with coverage passes **355 tests /
2,585 assertions**, with no failures, errors, or skips. The current coverage
report has 3,104/3,672 lines and 729/1,165 branch outcomes across 71 files;
production code changed, so these are not unchanged-source coverage-set
comparisons against hill #5. No existing tests were removed or weakened.
The browser suite also passes **7 tests / 185 assertions** using fresh assets
and installed Chromium; the pre-existing generated Sprockets assets were
temporarily set aside and restored, as in hill #6. Its
[log](benchmarks/baselines/2026-10-25-bulk-read-system.log) includes the builds.

**Artifacts and reproduction:** The
[control report](benchmarks/baselines/2026-10-25-bulk-read-before.json.gz),
[candidate report](benchmarks/baselines/2026-10-25-bulk-read-after.json.gz),
[comparison](benchmarks/baselines/2026-10-25-bulk-read-summary.json), and
[single-post comparison](benchmarks/baselines/2026-10-25-bulk-read-single-summary.json)
preserve samples, counts, responses, allocations, timing, and source hashes.
The four `2026-10-25-bulk-read-single-*-{before,after}.json.gz` reports preserve
guard samples. The [Rails log](benchmarks/baselines/2026-10-25-bulk-read-tests.log)
and [coverage report](benchmarks/baselines/2026-10-25-bulk-read-coverage.json.gz)
record the full check. Use the scratch database environment documented above
and `HILLS_OUTPUT=<unused-path> rbenv exec bundle exec rails runner
benchmarks/bulk_read.rb`; reload only that scratch schema before running tests.
SQL counts exclude cached queries, schema queries, and transaction statements.
Rails transaction notification time is archived, but bulk statements use
implicit database transactions without those notifications; zero does not
mean a zero-duration PostgreSQL transaction.

These results concern local warm requests and a fixed workload. Production
contention, remote latency, concurrent post deletion, and sustained workload
limits were not measured. No changes were committed or pushed in this pass.

## Hill #8 experiment — 2026-10-25

**Retained change:** Automatic image-cache sweeps use a 60-second interval
and a checkpoint protected by a nonblocking file lock. Workers using the same
directory share the checkpoint; one request sweeps while other requests can
continue. The timestamp advances only after a completed sweep. The explicit
`images:cleanup` task still scans immediately. Requested entries still check
their own seven-day expiry on every hit, even between sweeps, and source/DNS,
redirect, type, and size checks are unchanged.

Skipping the global scan requires corrupt requested metadata to be handled
as a cache miss. That path now removes the bad pair and refetches. Cleanup
also removes the body paired with corrupt metadata, fixing the pre-existing
orphan-file leak, and tolerates files removed by another worker after listing.
A requested body disappearing during its read falls back to a fetch.

**Limits fixed before the control:** Sweeps are due on the first valid request
60 seconds after the previous completed sweep. With idle traffic there is no
background timer; the existing explicit cleanup task remains available.
In the evaluation's one-second simulated request steps, entries expiring at
second 30 must be gone when the second-60 request completes. Every sampled
occupancy must stay below **16 MiB of file contents** and **128 MiB of
allocated file blocks**. These are fixed workload guards, not a new production
cache-capacity setting. No valid image is evicted to meet them.

**Evaluation:** The [driver](benchmarks/image_cache.rb) creates isolated
temporary directories with 100, 1,000, and 10,000 entries. It never touches
`tmp/cache/images`. Bodies are 1 KiB and DNS/upstream responses are fixed.
Files are freshly seeded and warm in the filesystem cache; this is not a
cold-disk measurement. The workload clock starts at `2026-10-25T12:00:00Z`,
advances one simulated second per hit without sleeping, and includes a
distinct cold miss every ten seconds. Up to 100 unrequested entries expire
30 seconds into the workload. Occupancy and remaining expired bodies are
checked at seconds 0, 30, 59, 60, 61, 119, 120, and 179.

Each version runs two 180-hit rounds per size: **360 hits and 36 misses per
size**, or 1,080 hits and 108 misses per version. The first request and every
cleanup-triggering hit are included. Timings cover `ImageProxy#call`, including
URL validation, locking, metadata/body reads, and due sweeps. They exclude
HTTP transport, real DNS/network latency, and browser work. A scoped read
counter records JSON metadata reads; its instrumentation is identical in both
versions. A normal candidate hit reads one JSON file plus the checkpoint.

The baseline is commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus the
retained earlier hill changes. Ruby 3.3.11 and the same local macOS/APFS host
are used throughout. The production file and measurement-driver hashes are
archived; the driver is unchanged between versions.

**Measured hit p95:**

- 100 entries: **12.642 → 0.364 ms**.
- 1,000 entries: **122.561 → 0.375 ms**.
- 10,000 entries: **1,349.387 → 0.401 ms**, a **99.97%** reduction.

Candidate p95 grows **1.10×** from 100 to 10,000 entries. Both individual
rounds also meet the reduction and 2× scaling targets. At 10,000 entries,
median JSON reads fall **9,913 → 1**, median allocations **624,959 → 521**,
and cold-miss p95 **1,339.220 → 1.202 ms**. All expected upstream counts and
image bodies/types match. Expiring bodies are gone at second 60 in every
case. Peak candidate occupancy is **11,874,948 logical bytes (11.32 MiB)**
and **81,973,248 allocated file bytes (78.18 MiB)**, within both limits.
Allocated file-byte totals omit directory/inode/filesystem bookkeeping overhead.

**Remaining latency spikes:** At 10,000 entries, candidate p99 is
**1,275.681 ms** and the largest hit is **1,405.103 ms**. Full scans still
scale with cache size. The p95 gain comes from running them periodically;
this pass does not claim a constant-time sweep or a low maximum latency.

The separate [edge-case driver](benchmarks/image_cache_edges.rb) measures
expired requested entries, corrupt requested metadata, paired concurrent
hits, and paired concurrent cold misses at all three sizes, with three samples
each. Both source versions pass every body/type, upstream-count, and replay
check. At 10,000 entries, median elapsed time falls **1,427.460 → 0.990 ms**
for expired entries, **1,318.315 → 0.862 ms** for corrupt metadata,
**2,446.039 → 0.677 ms** for a concurrent-hit pair, and
**2,393.914 → 1.260 ms** for a concurrent-miss pair. These small samples
describe observed medians, not latency-tail estimates.

**Correctness:** The full Rails suite passes **363 tests / 2,630 assertions**,
with no failures, errors, or skips. Eight added tests cover checkpoint reuse
and the exact interval boundary, corrupt metadata recovery, orphan removal,
files disappearing during cleanup/read, nonblocking concurrent hits, concurrent
cold writes, and rejection of cached hosts that resolve to private addresses.
The existing requested-expiry, redirect/fetch, content-type, and size checks
remain. The previous immediate-unrequested-cleanup test now advances to the
adopted 60-second deadline before asserting removal. Coverage is 3,122/3,683
lines and 734/1,169 branch outcomes across 71 files. Frontend and browser suites
were not rerun for this service-only change; browser tests stub this endpoint.

**Artifacts:** The
[control report](benchmarks/baselines/2026-10-25-image-cache-before.json.gz),
[candidate report](benchmarks/baselines/2026-10-25-image-cache-after.json.gz),
and [comparison](benchmarks/baselines/2026-10-25-image-cache-summary.json)
preserve hit/miss samples, per-round results, read counts, allocations,
occupancy, source hashes, and limits. The
[edge control](benchmarks/baselines/2026-10-25-image-cache-edges-before.json.gz),
[edge candidate](benchmarks/baselines/2026-10-25-image-cache-edges-after.json.gz),
and [edge comparison](benchmarks/baselines/2026-10-25-image-cache-edges-summary.json)
record the supplemental cases. The
[Rails log](benchmarks/baselines/2026-10-25-image-cache-tests.log) and
[coverage report](benchmarks/baselines/2026-10-25-image-cache-coverage.json.gz)
record validation. Reproduce with `RAILS_ENV=test RBENV_VERSION=3.3.11
HILLS_OUTPUT=<unused-path> rbenv exec bundle exec rails runner
benchmarks/image_cache.rb`; the edge driver uses the same environment.

Temporary cache directories are removed by the drivers, and the candidate
source was restored and checked against the tested hash after the supplemental
control. Production workload rates, filesystem behavior on other hosts, and
idle-cache cleanup scheduling remain unmeasured. No changes were committed
or pushed in this pass.

## Hill #9 experiment — 2026-10-25

**Retained change:** Remove the unused global Hive SDK script and browser-node
meta tag from the SPA layout, plus its unused React entrypoint configuration.
React uses the server API and the separately imported Aioha wallet adapter;
neither consumes `window.hive`. The legacy layout still loads/configures the
global SDK. The production change deletes seven lines and introduces no
deferred imports, loading states, or new dependencies.

The production Vite graph itself was about 269 kB gzipped in the initial build
report, but the SPA layout loaded another blocking script outside that graph:
`https://cdn.jsdelivr.net/npm/@hiveio/hive-js/dist/hive.min.js`. The baseline
counts that script too. Its frozen decoded payload is **560,931 bytes**, with
SHA-256 `07f8f7f3ca9e8ee0693c3509aaa2e744826263a90103dda48b0d73fb446d594a`.
Source inspection found no global-Hive consumers in React, its renderer, or
the Aioha adapter. Its removal avoids adding latency to a first action that
would otherwise have to download a deferred dependency.

**Fixed browser workload:** Production assets were built with Node 26.12.0
and the existing lockfile. The [fixture exporter](benchmarks/startup_fixtures.rb)
captures actual API serializers against the dedicated scratch database, with
the existing Hive fake. Exported responses are frozen in the
[fixture file](benchmarks/baselines/2026-10-25-startup-fixtures.json). Preview
bodies contain headings, a fragment link, readable content, and a script that
must not execute. The session is authenticated through a fixed response and
uses HiveSigner for the approval-dialog check; no signing link is opened and
no transaction is sent.

The [server](benchmarks/startup_server.mjs) serves the production manifest's
complete static dependency graph and CSS in a fixed benchmark shell. The
external SDK is served locally from frozen bytes. All JavaScript, including
preloads and that extra script, uses gzip level 9. The same-origin response
scheduler applies a shared byte budget and fixed per-request latency to all
responses. This is a controlled link model, not real CDN/DNS/TLS timing.
The shell contains identical measurement instrumentation in both versions;
instrumentation in the HTML is excluded from the application-JavaScript metric.

The [browser runner](benchmarks/startup_run.mjs) uses Playwright 1.63.0 and
installed Chromium **151.0.7872.0**, with these fixed profiles:

- Desktop: **1440×900**, **1× CPU**, **750 KiB/s**, **50 ms request latency**.
- Mobile layout: **390×844**, **4× CPU slowdown**, **200 KiB/s**, **100 ms
  request latency**, touch enabled, Chromium's desktop user agent. This is
  browser emulation, not verification on a physical mobile device.

Each profile has 20 fresh-context/origin cold loads and 20 same-context
reloads, for **80 navigations per version**. Origins use unique loopback
ports; HTTP cache is preserved only within a cold/revisit pair. Service
workers are blocked in both versions, so revisit results concern HTTP cache,
not offline/PWA behavior. A usable inbox requires actual rows, enabled search,
and the fetched/rendered first post body, not the initial loading shell.
The mobile predicate also waits for the initially selected post's body even
though the preview drawer remains closed. Every recorded JavaScript resource
set and compressed-byte total matches the expected production dependency graph.

The control is commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus earlier
retained hill changes. The collectors, API fixtures, browser, compression,
profiles, and source/build hashes are recorded and checked across versions.

**Results:** Initial cold-load application JavaScript falls from **423,420 →
266,709 compressed bytes**, a **37.0%** reduction, identical in every cold
sample in both profiles. This exceeds the 25% byte target.

- Desktop cold p95: **985.8 → 810.7 ms**, **17.8%** lower. Median:
  **962.25 → 753.85 ms**. The proposed **20% p95 target remains open**.
- Mobile cold p95: **3,028.9 → 2,269.7 ms**, **25.1%** lower. Median:
  **3,011.2 → 2,248.7 ms**. This exceeds the 20% target.
- Revisit JavaScript transfer is **zero bytes in both versions**. Revisit
  p95 is **296.9 → 295.7 ms** on desktop and **677.5 → 646.5 ms** on mobile.

Chromium's median cold-load `ScriptDuration` falls **102.11 → 66.66 ms** on
desktop and **312.90 → 226.77 ms** on mobile. Reported `V8CompileDuration`
falls **0.24 → 0.19 ms** and **0.93 → 0.58 ms**, respectively. These are
per-document DevTools counters, including benchmark instrumentation; they do
not profile every background parsing task. Raw reports also retain resource
timings, script-load/post-download windows, layout/style/task counters, and
observed long tasks. Compilation is not added to script time as if the two
were necessarily disjoint.

**First-action guard:** After each revisit, the [page monitor](benchmarks/startup_browser.js)
selects another post, opens settings/timeline/revision UI, and opens the
per-vote HiveSigner approval dialog without submitting it. All checks pass
with `window.hive` absent in the candidate. First-action p95 values are:

- Desktop: preview **81.5 → 82.1 ms**, settings **17.2 → 16.8 ms**, timeline
  **101.6 → 101.2 ms**, revisions **101.0 → 101.4 ms**, wallet approval
  **101.7 → 100.8 ms**.
- Mobile: preview **147.0 → 146.6 ms**, settings **39.3 → 39.8 ms**, timeline
  **208.3 → 205.6 ms**, revisions **151.4 → 151.9 ms**, wallet approval
  **151.9 → 150.8 ms**.

No first-action p95 regresses by more than 1 ms. The monitor also verifies
heading-link navigation, nonexecution of the injected post script, the
per-vote approval URL, correct viewport, and absence of JavaScript errors.
This is a startup preview guard, not hill #3's full navigation/revision/error
timing matrix. Real extension, HiveAuth, and physical-device approval timing
remain unmeasured.

**Regression checks:** All **325 frontend tests / 40 files**, **363 Rails
tests / 2,634 assertions**, and **7 browser tests / 185 assertions** pass,
with no failures, errors, or skips. React app tests now run without the old
global-Hive mock. Shell assertions verify the SPA omits the SDK/meta tag and
the legacy interface retains both. Browser tests include the existing fixture
Keychain login, inbox preview, themes, keyboard focus, and responsive controls.
Their stale precompiled Sprockets directory was set aside during verification
and restored afterwards. No existing test scenarios were removed.

**Artifacts:** The
[control](benchmarks/baselines/2026-10-25-startup-before.json.gz),
[candidate](benchmarks/baselines/2026-10-25-startup-after.json.gz), and
[comparison](benchmarks/baselines/2026-10-25-startup-summary.json) preserve
every sample, resource list, action timing, CPU metric, profile, and hash.
The [comparison driver](benchmarks/startup_compare.py) asserts sample counts,
resource/byte completeness, zero revisit transfers, unchanged inputs, and
first-action bounds. The
[control assets](benchmarks/baselines/2026-10-25-startup-before-assets.tar.gz)
and [candidate assets](benchmarks/baselines/2026-10-25-startup-after-assets.tar.gz)
contain generated JS/CSS, manifests, and source layout/entrypoint snapshots.
The [frozen SDK](benchmarks/baselines/2026-10-25-startup-hive.min.js.gz) preserves
the exact external payload. Test evidence is in the
[frontend log](benchmarks/baselines/2026-10-25-startup-frontend.log),
[Rails log](benchmarks/baselines/2026-10-25-startup-rails.log),
[coverage report](benchmarks/baselines/2026-10-25-startup-coverage.json.gz), and
[browser log](benchmarks/baselines/2026-10-25-startup-system.log).

For reproduction, extract the asset archives under `tmp/`, decompress the SDK
to `tmp/hills-startup-hive.min.js`, and run the Node 26 benchmark server. Then
run `HILLS_VERSION=before HILLS_OUTPUT=<unused-path> node
benchmarks/startup_run.mjs`, followed by `HILLS_VERSION=after` with a distinct
output. The browser runner requires the installed Chromium executable recorded
in its source. Stop the control server through `/control/shutdown` afterwards.

The collaborative preview twice timed out taking snapshots, so retained runs
use the repository's Playwright/Chromium path. Pilots and an interrupted run
that incorrectly treated per-document CPU counters as cumulative were excluded;
the complete control and candidate were collected with the same corrected
collector. The benchmark listeners and browser processes created for this
pass were stopped. Production field timing, real CDN negotiation, and offline
service-worker updates remain unmeasured. The byte improvement is retained;
the desktop cold-p95 target is left open. No changes were committed or pushed.

## Hill #10 experiment — 2026-10-25

**Retained changes:** Strengthen two existing service tests. Revision
normalization now receives a comment from the correct author but a different
permlink, alongside its existing wrong-author input, and must exclude both.
The payout-refresh limit test now gives its selected post a 50% reward weight
and checks the resulting stored payout and numeric amount. Other tests retain
100% reward-weight inputs and assertions. No test cases were removed, merged,
or added, and no production code was changed in this pass.

**Frozen evaluation:** The [panel](benchmarks/fault_panel.json) contains eight
independent source mutations, applied one at a time. The
[behavior witnesses](benchmarks/fault_witness.rb) run separately from the scored
Rails suite. Every witness passes against unaltered production and fails with
exit 42 and an explicit expected/observed mismatch against its corresponding
mutation. Each mutated Ruby file also passes syntax validation. All faults were
validated before suite scoring or test optimization. Their source substitutions,
panel/witness/driver hashes, and mutated-file hashes are unchanged between the
complete control and candidate runs.

Each version runs the entire Rails suite with seed **6604**, **one worker**,
three times without coverage, once with coverage, and once per fault without
coverage. Asset-build hooks are skipped equally; existing built assets are
reused. Bootsnap and Spring are disabled equally so a previous mutation cannot
be served from a source cache. Each process has a fixed **120-second timeout**.
A detected fault requires assertion failures, no errors or skips, and exit 1.
Timeouts and infrastructure failures do not count. Every source file is restored
in a `finally` block and its hash checked after the panel completes.

The baseline is commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus the retained
earlier hill changes, on the same local macOS host with Ruby **3.3.11**, Rails
**8.1.4**, and the dedicated **hyperion_hills_test** PostgreSQL database. RPC and
HAFBE responses are controlled by the existing Hive fake or explicit stubs;
no live upstream is needed. The witness uses isolated rolled-back transactions.
Full-suite fixture loading supplies the same workload for every scored run.
The runtime guard is median complete command wall time, including Ruby/Rails
boot but excluding asset builds, coverage, witness validation, and fault runs.

**Fault detection, control → candidate:**

- Accept another permlink's revision history: **missed → detected**.
- Accept replacement text when a patch cannot match its base: **missed → missed**.
- Reverse chronological revision order: **detected → detected**.
- Permanently suppress a payout after a batch timeout: **detected → detected**.
- Ignore a partial reward weight: **missed → detected**.
- Ignore the maximum accepted payout: **detected → detected**.
- Remove another account's read record when marking a post unread:
  **missed → missed**.
- Overwrite the timestamp of an existing bulk-read record:
  **detected → detected**.

Undetected faults fall **4 → 2**, meeting the halving target. Detection rises
**4/8 → 6/8**, with every previously detected fault preserved. The revision
input change was first checked independently: its six service tests pass
normally and fail specifically on the frozen identity fault. The final full
panel then confirms both improvements. The two surviving mutations are
**test gaps**, not claims that current production contains those faults.
Optimization stops at the adopted halving target; the panel was not replaced
with easier faults after test changes began.

**Correctness and cost:** Both versions pass **363 tests / 2,634 assertions**
with zero failures, errors, or skips in all ordinary and coverage runs.
Uninstrumented wall times are **11.20, 11.36, 11.91 seconds** before and
**10.44, 11.90, 11.84 seconds** after. Median wall time is **11.362 → 11.837
seconds**, **4.2% higher**, within the fixed 10% guard. Three samples establish
that guard result, not a reliable estimate of a small runtime difference.

Coverage remains **3,122/3,683 lines** and **734/1,169 branch outcomes** across
**71 files**. The comparison checks individual covered lines and branch
outcomes, not just totals: **zero previously covered lines or outcomes are
lost**. Production file hashes are identical. No frontend or browser suites
were rerun for these Ruby test-input changes.

The original **349-test cap remains unmet**: earlier accepted hills had already
raised the suite to 363 tests before this control. This pass holds that count
and does not delete unrelated scenarios to satisfy the older cap. The detection
and runtime targets are met; the complete original multi-part target is not.

**Artifacts:** The
[control report](benchmarks/baselines/2026-10-25-fault-before.json.gz),
[candidate report](benchmarks/baselines/2026-10-25-fault-after.json.gz), and
[comparison](benchmarks/baselines/2026-10-25-fault-summary.json) preserve all
suite results, source/test hashes, complete line/branch coverage, witness
results, and log paths. Those individual logs are retained alongside the
reports. The [comparison driver](benchmarks/fault_compare.py) asserts unchanged
production/panel inputs, preserved detections and coverage, unchanged test
count, and the runtime guard. It records the 349-test-cap failure explicitly.
The [control tests](benchmarks/baselines/2026-10-25-fault-before-tests.tar.gz)
and [candidate tests](benchmarks/baselines/2026-10-25-fault-after-tests.tar.gz)
archive every Ruby test/support file and are verified against their report
hashes. The [shared context](benchmarks/baselines/2026-10-25-fault-context.tar.gz)
preserves unchanged production Ruby files, fixture YAML, database/test
configuration, dependency locks, and the Rails launcher.

Reproduce on a prepared scratch database with `HILLS_VERSION=before
HILLS_OUTPUT=<unused-json-path> python3 benchmarks/fault_detection.py`, using
the control test snapshot; repeat with the candidate snapshot and a different
output path. The [runner](benchmarks/fault_detection.py) fixes the database,
Ruby version, seed, cache settings, and asset-hook flags. Compare the two
reports with `python3 benchmarks/fault_compare.py <before-json-or-json.gz>
<after-json-or-json.gz> <unused-summary-path>`. Extract source/test archives
only into an isolated checkout when reproducing earlier versions.

**Excluded setup attempts:** The first sandboxed process could not connect to
the local PostgreSQL socket; the measured runs use the authorized local test
runtime. An initial witness used a different RPC asset shape and was corrected
before scoring. Validation also caught Bootsnap reusing a same-size mutation
within one filesystem timestamp interval; both complete runs disable it.
One proposed ninth mutation selected another account for a single-post read;
the controller fixture has no other account, so it raised a nil-receiver error
instead of exercising account isolation. It was excluded without replacement
before the complete baseline or any test changes. Partial/setup reports are
kept only under ignored `tmp/` and contribute no measurements here.

All mutations are restored, test snapshots match the recorded hashes, and no
background processes were left running by this pass. No commits or pushes
were made. Faults outside this small panel and other test-suite seeds remain
unmeasured; the two recorded surviving faults and the old test-count cap remain
open.

## Hill #2 throughput follow-up — 2026-10-25

**Result:** No production performance change is retained. Three tag-lookup
variants reduced SQL calls but failed the acceptance check requiring lower
median duration in each fixed workload. The exact pre-pass indexer hash is
restored, including the earlier pagination/recovery fixes. The 2× throughput
target remains open. The retained changes are an indexing-only benchmark mode,
a comparison driver that records rejected results, and one behavior test.

**Fixed evaluation:** The existing [driver](benchmarks/hills.rb) now accepts
`HILLS_WORKLOAD=indexing`, skipping the unrelated inbox matrix while preserving
all indexing and recovery checks. This mode was added before the fresh control;
the driver hash is identical across all six runs. Each run uses one warmup
and ten measured trials of 1,000 inserts, 301-row unchanged overlap replay,
and 1,000 edits including 100 deletions and tag replacement. Recovery still
covers multiple pages, tied timestamps, repeated sweeps restoring a missing
post, interrupted-page rollback, and restart. Every run passes **95/95 checks**.
Replayed rows contribute zero newly synchronized posts.

Before measuring the control, resource limits were fixed at **256 MiB peak
Ruby process RSS** and **10 seconds per measured page transaction**. The
comparison additionally requires each case's median duration to improve and
its observed maximum to stay within 10% of control. These timing checks were
written before the first candidate report was inspected and remain unchanged
for rejected runs. The ten-sample nearest-rank p95 is the observed maximum,
not a reliable production latency-tail estimate. Transaction notifications
aggregate the page and checkpoint transactions within each measured call;
keeping that total under ten seconds also bounds its individual transactions.
Recovery transactions are checked for correctness, not timed by this guard.

The environment is the same local macOS host, Ruby **3.3.11**, Rails **8.1.4**,
and PostgreSQL **16.15**, at commit
`ff12a97379f6eb475ffea44f2827325aa6f982a1` plus earlier retained working-tree
changes. Workload time stays frozen at `2026-10-24T12:00:00Z`. The production
source SQL executes against a real local table on the same connection as
the destination. Reputation and blacklist inputs are fixed; Hive calls use
the existing fake. Garbage collection stays enabled. Source seeding, cache
priming, and correctness verification are outside measured durations.
This is a warm local workload, excluding remote HafSQL transport, concurrent
indexers, and sustained production arrival rates. PostgreSQL server memory
is not included in Ruby process RSS.

**Fresh control:** Median durations are **2,779.6 ms insert**, **5,248.6 ms
edit/delete**, and **329.2 ms replay**. Corresponding median useful throughput
is **354.0 new posts/s** and **180.7 edited posts/s**. SQL counts are **16,008**,
**12,008**, and **1,511** respectively. Peak process RSS is **133.91 MiB**;
the largest measured transaction total is **7.014 seconds**.

**Rejected experiments:**

1. Load each post's tags once, index them by name, destroy removed records,
   and reuse retained records while keeping validation and callbacks. This
   replaces per-tag lookup queries. Inserts fall to **2,250.0 ms**, replay to
   **202.5 ms**, but edits rise to **5,328.5 ms** (**1.5%**). SQL counts fall
   to **13,008 / 10,008 / 608**. A complete repeated control/candidate pair
   confirms the mixed result: inserts **2,741.4 → 2,198.6 ms**, replay
   **327.2 → 210.8 ms**, and edits **5,120.4 → 5,330.9 ms** (**4.1%** higher).
   This is insufficient evidence of an all-case gain; it does not establish
   that a 1.5% difference alone is statistically significant.
2. Read the tags through the association's query scope to leave its collection
   cache unloaded. Inserts are **2,306.0 ms**, replay **209.9 ms**, and edits
   **5,307.9 ms**. The edit median still exceeds both control medians. The
   suggested association-cache explanation was not established by this test.
3. Also use the relation constructor for missing tags, matching the original
   `find_or_initialize_by` path. Inserts are **6,067.7 ms**, edits **5,745.4 ms**,
   and replay **285.1 ms**. Both useful-throughput cases regress. Further source
   inspection shows that Rails ultimately delegates this constructor to the
   association builder too; a different construction path did not establish
   a fix. Host/runtime variability was not isolated as an explanation for
   this run's larger insert times.

All variants retain the same normalization, tag limit, validations, individual
record saves/destroys, counter callbacks, community-job callbacks, and page
transactions. All resource checks pass. Lower SQL/allocation counts alone
are not accepted as proof of higher throughput. After **three consecutive
unsuccessful variants**, optimization stops and the original indexer is
restored rather than loosening the timing check. Both controls and every
candidate remain archived. Throughput and duration medians are calculated
independently by the original nearest-rank collector and need not be exact
reciprocals with ten samples.

**Retained regression check:** The new indexer test exercises tag replacement
through `perform`, preserving retained tag IDs and cached body text, changing
the category flag, normalizing duplicates/case, rejecting blank/oversized
tags, removing an obsolete tag, updating tag counters, and enqueuing the
community refresh. It passes against the original indexer and all variants.
The restored final tree passes **364 Rails tests / 2,649 assertions**, with
zero failures, errors, or skips. Coverage stays at **3,122/3,683 lines** and
**734/1,169 branch outcomes** across **71 files**. Frontend and browser suites
were not rerun for this final Ruby test/benchmark-only change.

**Artifacts:** The [decision record](benchmarks/baselines/2026-10-25-index-tags-result.json)
lists all reports and comparisons. The
[fresh control](benchmarks/baselines/2026-10-25-index-tags-before.json.gz),
[first candidate](benchmarks/baselines/2026-10-25-index-tags-after.json.gz),
[repeat control](benchmarks/baselines/2026-10-25-index-tags-repeat-before.json.gz),
[repeat candidate](benchmarks/baselines/2026-10-25-index-tags-repeat-after.json.gz),
[scope candidate](benchmarks/baselines/2026-10-25-index-tags-scope-after.json.gz), and
[constructor candidate](benchmarks/baselines/2026-10-25-index-tags-relation-after.json.gz)
preserve every sample, SQL-name count, allocation count, transaction total,
resource snapshot, source/driver hash, and correctness result. Matching `.log`
files contain process resource measurements; matching `.rb.gz` files preserve
each tested indexer version, verified against the report hash. The
[comparison driver](benchmarks/index_tags_compare.py) reproduces the rejection
decisions, saving summaries before exiting nonzero for failed timing guards.
The [Rails log](benchmarks/baselines/2026-10-25-index-tags-rails.log),
[coverage](benchmarks/baselines/2026-10-25-index-tags-coverage.json.gz), and
[test snapshot](benchmarks/baselines/2026-10-25-index-tags-test.rb.gz) record final
validation. Other production Ruby files match the earlier retained
[shared context](benchmarks/baselines/2026-10-25-fault-context.tar.gz).

Reproduce with the scratch-database environment from the baseline procedure,
then `HILLS_WORKLOAD=indexing HILLS_OUTPUT=<unused-path> /usr/bin/time -l
rbenv exec bundle exec rails runner --skip-executor benchmarks/hills.rb`.
Use the matching archived source only in an isolated checkout when repeating
rejected variants. Compare reports with `python3 benchmarks/index_tags_compare.py
<before-json-or-json.gz> <after-json-or-json.gz> <summary-path>`; source snapshots
and process logs must sit beside them with the matching filename prefix.

Before running the fixture-based Rails suite after this benchmark, reload the
**scratch** schema with `rails db:schema:load`. The benchmark leaves an indexer
checkpoint, and that table has no fixture to clear it; the first final-suite
attempt hit a duplicate checkpoint name. The clean-schema rerun above passes.
No background benchmark processes remain, and no changes were committed or
pushed. Broader batch-write approaches and production-load behavior remain
unmeasured.

## Borrowed hills 11-14 baseline — 2026-10-25

**Status:** Four candidates are added above with targets and fixed cases.
This pass establishes baselines only. Production Ruby and the measured
frontend hook/API files are unchanged, verified by source hashes. Hivetop's
payload reuse/cancellation patterns supply implementation ideas; its response
validation hill is a proposal, not an accepted implementation. Its local commit
is recorded in the Rails report.

**Environment:** Base commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus earlier
retained changes; Ruby **3.3.11**, Rails **8.1.4**, PostgreSQL **16.15**, Node
**26.12.0**, and Vitest **5.0.3** on this macOS host. The final Rails run was
recorded at `2026-10-26T02:48:21Z` (October 25 locally). Fixture time is frozen
at `2026-10-25T12:00:00Z`. A dedicated `hyperion_hills_test` transaction creates
guarded fixed account/post IDs and rolls back the data. A collision fails
rather than replacing rows. All upstream behavior uses explicit doubles or
the existing Hive fake. No real network latency is represented.

### #11: revision fetches

The [Rails runner](benchmarks/sibling_baseline.rb) exercises the actual bearer-
authenticated revisions endpoint, including refresh, persistence, reconstruction,
and sanitized rendering. Each case has one warmup and **20 measured requests**.
Each HAFBE double sleeps **10 ms**; endpoint wall time includes that delay and
local Rails/database/rendering work. All response fingerprints are stable.

- Full body: **2 HAFBE calls**, **45.54 ms p95**.
- Patch reconstruction: **2 calls**, **46.19 ms p95**.
- Empty history with a local body: **2 calls**, **46.27 ms p95**.
- Persisted cross-post: **3 calls** across two identities, **72.34 ms p95**.
- Upstream HTTP 503: **2 calls**, **43.32 ms p95**, returning HTTP **502**.

Rendered identity, expected reconstructed/local body, and absence of script
elements pass. Separate requests see **“Fresh first” → “Fresh second”** when
history changes. The one-fetch-per-identity target remains open. Cold body
loading through Hive/HafSQL is outside these cases; extend the matrix before
altering that fallback path.

### #12: superseded preview requests

The [hook runner](benchmarks/sibling_preview.jsx) uses the actual hook and API
wrapper with a cancellation-aware fetch double. A separate
[config](benchmarks/sibling_preview.config.mjs) keeps measurement traces outside
normal test discovery. Four scenarios run **20 times each**, for **80 traces**.
Every response takes **300 simulated ms**.

- Ten selections 25 ms apart: **10 fetches**, **10 peak in flight**, **9 obsolete
  successful completions**, **0 aborts**, **300 ms** selected-post ready p95.
- Clear selection after 50 ms: **1 obsolete completion**, **0 aborts**; final
  state stays empty/idle.
- Unmount after 50 ms: **1 obsolete completion**, **0 aborts**.
- Current failure then another selection: error remains visible, recovery
  succeeds, and selected-post ready-state latency is **300 ms**.

Across the traces: **280 issued fetches**, **220 obsolete successful completions**,
and **zero aborts**. Old content never replaces the latest selection. All timers
and requests drain. These are deterministic **jsdom hook/state** measurements,
not browser transport, readable-content rendering, physical-device timing, or
proof that a browser abort stops Rails/upstream work. Those checks remain open.

### #13: malformed upstream results

The [frozen matrix](benchmarks/sibling_response_fixtures.json) has **37 cases**:
**22 malformed**, **13 valid**, and **2 ordinary upstream errors**. A rejection
earns credit only for a context-bearing `HafbePostRevisions::FetchError` or
`Hive::UnknownError` at the measured boundary. Silent defaults, values returned
to callers, or unrelated later exceptions do not count.

- HAFBE's HTTP JSON-fetch boundary rejects **1/8 malformed cases**: invalid JSON.
  Wrong envelope/collection/entry shapes pass this fetch boundary.
- The condenser decoded-result boundary rejects **0/14 malformed cases**.
  Injection starts **after hive-ruby envelope handling**; this does not score
  that library's wire validation or claim every value reaches a user.
- Combined: **1/22 (4.5%)**, with **13/13 valid controls accepted unchanged**
  and **2/2 normal upstream errors controlled**. Existing digest-vote checks
  remain intact and are outside this new panel.

The target is 22/22, preserving every valid/error control. Twenty large-valid
boundary calls per case establish cost references: parsing **5,000 HAFBE
operations** has **4.736 ms p95**; decoded condenser results with 5,000 votes,
5,000 replies, or a 1 MiB extra body each have approximately **0.001 ms p95**.
The latter measure nearly empty checks on already decoded data, excluding
network, parsing, and downstream processing; sub-microsecond precision is not
claimed. Candidate p95 may add at most the fixed **20 ms** per control.

### #14: shared content for stats and payout

Each case has one warmup and **20 measured samples**, a **5 ms per-RPC** double,
controlled time, and a fresh explicit `MemoryStore`. These measure services and
payout persistence, not HTTP controllers or a production cache backend.
Preparatory cache-priming calls are excluded from the following counts.

- Cold stats→payout: **2 content / 4 total RPC calls**, **36.37 ms p95**.
- Cold payout→stats: **2 content / 4 total**, **32.53 ms p95**.
- Warm revisit: **0 RPC calls**, **2.07 ms p95**.
- At 121 seconds: **2 content / 4 total**, **35.99 ms p95**.
- Forced stats refresh: **1 content / 3 total**, **29.43 ms p95**. Stats sees
  **2.000 HBD** while the independent payout cache returns **1.000 HBD**;
  aligning their freshness is part of the proposed shared-content hill.
- Two identities: **4 content / 8 total**, **72.31 ms p95**.
- Another account using the primed shared cache: **0 RPC calls**, **2.53 ms
  p95**. Its current vote is **nil** while the first account's is **4200**.

Ready status, current-vote values, payout persistence, and identity/account
controls pass. Cold-pair and post-expiry targets remain open. Concurrent misses,
distributed caches, failure recovery, and real RPC latency remain unmeasured;
extend controls before accepting a sharing implementation.

**Evidence:** The [Rails report](benchmarks/baselines/2026-10-25-sibling-rails.json.gz),
[preview report](benchmarks/baselines/2026-10-25-sibling-preview.json.gz), and
[summary](benchmarks/baselines/2026-10-25-sibling-summary.json) retain every sample,
request/identity trace, response fingerprint, fixture outcome, large-valid cost,
and source hash. The [summary driver](benchmarks/sibling_summary.py) checks
sample/fixture completeness, stable fingerprints/counts, valid/error controls,
and unchanged production status. The
[source archive](benchmarks/baselines/2026-10-25-sibling-sources.tar.gz) preserves
the measured Ruby/hook/API sources, harnesses, fixture matrix, dependency locks,
test configuration, and Hive fake, verified against their recorded hashes.

The [Rails log](benchmarks/baselines/2026-10-25-sibling-rails.log) records **144.34
MiB peak process RSS** across boot and all cases, not per-request memory. The
[preview log](benchmarks/baselines/2026-10-25-sibling-preview.log) records all four
measurement scenarios passing. The
[normal frontend log](benchmarks/baselines/2026-10-25-sibling-frontend.log) records
**325 tests / 40 files passing**, including existing preview scroll/stale-response
checks. No production or ordinary Ruby test files changed; the full Rails suite
was not rerun, and its preceding verified result remains 364 tests. Both new
measurement harnesses contain executable correctness assertions.

Reproduce on a prepared scratch schema with `RAILS_ENV=test
DATABASE_URL='postgresql:///hyperion_hills_test?gssencmode=disable'
RBENV_VERSION=3.3.11 HILLS_OUTPUT=<unused-json-path> /usr/bin/time -l rbenv exec
bundle exec rails runner --skip-executor benchmarks/sibling_baseline.rb`.
Under Node 26.12.0, run `HILLS_OUTPUT=<different-unused-json-path> npm run
test:frontend -- --config benchmarks/sibling_preview.config.mjs`. Summarize with
`python3 benchmarks/sibling_summary.py <rails-json-or-json.gz>
<preview-json-or-json.gz> <summary-path>`. Setup reports preceding the second-
account control and fixed IDs remain only in ignored `tmp/`; the retained report
uses the complete pinned fixture set. All created processes exited. No product
optimization, commit, or push was made.

## Hill #11 experiment — 2026-10-25

**Retained change:** The API controller uses one `HafbePostRevisions` instance
for refreshing the requested/displayed posts and rendering revision history.
That service retains one raw HTTP response or fetch failure per author/permlink.
Each caller parses the raw body again, so returned histories, metadata, and body
strings are independent; adding a local fallback or mutating a returned history
cannot pollute later calls. This avoids a second network request without adding
a second retained history payload per identity.

The controller's service instance lasts for one request. There is no Rails cache,
TTL, cross-account cache, or persistent history reuse. Other callers still create
their default service for each refresh. A failed fetch is reused inside the
request so the rendering step reports the same failure without retrying; a new
request creates a new instance and can recover. Normalization, patch application,
rendering, sanitization, body loading, and persistence logic are unchanged.

**Fixed comparison:** A fresh control was collected before production edits
using the unchanged [borrowed-hill runner](benchmarks/sibling_baseline.rb) and
its frozen fixtures. Both versions have the same base commit
`ff12a97379f6eb475ffea44f2827325aa6f982a1` plus earlier retained changes,
Ruby 3.3.11, Rails 8.1.4, PostgreSQL 16.15, pinned IDs, frozen clock, fixture
hash, and driver hash. Only the API controller and revisions service differ
among production Ruby sources. Each timed revision case has one warmup and
**20 measured requests**, with **10 ms per upstream response**. These are local
Rails endpoint timings with simulated latency, not production network timings.

**Measured results:**

- Full body: **2 → 1 fetches**, p95 **42.63 → 23.86 ms**, **44.0% lower**.
- Patch reconstruction: **2 → 1**, **47.31 → 25.89 ms**, **45.3% lower**.
- Empty history/local fallback: **2 → 1**, **49.06 → 23.10 ms**, **52.9% lower**.
- Persisted cross-post: **3 → 2**, one per identity; **61.37 → 50.00 ms**,
  **18.5% lower**.
- Upstream HTTP 503: **2 → 1**, **45.42 → 25.02 ms**, **44.9% lower**;
  the endpoint still returns HTTP **502** with the same error payload.

Across the 100 measured endpoint requests, HAFBE fetches fall **220 → 120**.
Every identity set, HTTP status, and response fingerprint matches control.
Every candidate identity is fetched exactly once within its request. All
revision cases improve p95 and stay inside the 10% regression guard. Separate
requests still see **“Fresh first” → “Fresh second”**. The runner's other
content-cache call/value traces and all 37 response-validation fixture outcomes
also match, with no claim of improving those separate hills.

**Resource bound:** Only the raw response/error is retained per fetched identity;
parsed histories are temporary and never cached. The ordinary case has one
entry and the cross-post case two, released with the request's controller/service.
Median allocations fall **3,810 → 3,745** for full bodies and **3,778 → 3,726**
for cross-posts. Whole-process peak RSS is **145.08 → 143.44 MiB**, including
boot and all borrowed-hill cases, not isolated request retention or a proof of
worst-case history size. No unbounded process-wide map is introduced.

**Correctness:** Before production changes, two new cold-body controls pass
against the original controller: load an absent body from HafSQL, and retain
the Hive fallback after a HafSQL miss. Both still pass after reuse. Additional
checks cover same-author/different-permlink and same-permlink/different-author
isolation, empty histories, mutable returned bodies and local fallback appends,
reused timeouts with recovery on a new service, and one HTTP-failure fetch with
successful recovery on the next controller request. The existing rendered
revision test now asserts a single upstream fetch while preserving its patch,
ordering, identity, and rendered-body assertions.

The full Rails suite passes **369 tests / 2,695 assertions**, with zero failures,
errors, or skips. Coverage is **3,133/3,690 lines** and **739/1,171 branch outcomes**
across **71 files**. The focused service/controller run passes **68 tests / 579
assertions**. Frontend/browser suites were not rerun for this Ruby-only change;
the endpoint fingerprint comparison preserves their response contract.

**Artifacts:** The [control](benchmarks/baselines/2026-10-25-revision-reuse-before.json.gz),
[candidate](benchmarks/baselines/2026-10-25-revision-reuse-after.json.gz), and
[comparison](benchmarks/baselines/2026-10-25-revision-reuse-summary.json) retain
all timings, requests, allocations, payload hashes, freshness results, and source
hashes. Matching before/after `.log` files contain process RSS. The
[comparison driver](benchmarks/revision_reuse_compare.py) enforces identical
inputs, unchanged payloads/status/identity sets, one fetch per identity, p95
guards, and unchanged results for the other measured hills.

The [control source snapshot](benchmarks/baselines/2026-10-25-revision-reuse-before-sources.tar.gz)
and [candidate source/test snapshot](benchmarks/baselines/2026-10-25-revision-reuse-after-sources.tar.gz)
preserve the changed production files and final regression tests. The remaining
context and frozen runner are in the earlier
[source archive](benchmarks/baselines/2026-10-25-sibling-sources.tar.gz). Evidence
also includes the [cold control log](benchmarks/baselines/2026-10-25-revision-reuse-cold-control.log),
[focused log](benchmarks/baselines/2026-10-25-revision-reuse-focused.log),
[full Rails log](benchmarks/baselines/2026-10-25-revision-reuse-rails.log), and
[coverage](benchmarks/baselines/2026-10-25-revision-reuse-coverage.json.gz).

Reproduce each version with the borrowed-hill Rails command and a distinct
`HILLS_OUTPUT`, then run `python3 benchmarks/revision_reuse_compare.py
<control-json-or-json.gz> <candidate-json-or-json.gz> <summary-path>`. Matching
process logs must be beside the reports. Extract older sources only into an
isolated checkout. The benchmark transaction rolls back its fixture data;
all created processes have exited. No commits or pushes were made. Real HafBE
latency, concurrent production traffic, and worst-case retained history size
remain unmeasured.

## Hill #12 experiment — 2026-10-26

**Retained change:** `usePostPreview` gives each effect an `AbortController` and
passes its signal through the existing API request options. Cleanup aborts on
selection change, clear, API-function change, and unmount. Both success and
failure handlers ignore results when their own signal is aborted. This also
protects against injected clients that ignore cancellation, replacing the old
request-number ref without losing stale-result protection. Current failures
remain visible; successful current responses still reset both scroll refs.
No debounce, retries, response caching, or dependency was added.

**Frozen control:** Before production edits, the unchanged
[hook runner](benchmarks/sibling_preview.jsx) collected 20 traces for each of
rapid selection, clear, unmount, and current-error/recovery. Both versions use
the same runner/config hashes, Node **26.12.0**, Vitest **5.0.3**, React, jsdom,
300 ms response delay, ten selections 25 ms apart, and four fixed scenarios.
The base commit remains `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus earlier
retained changes. The two changed frontend source hashes and exact snapshots
are recorded; no Rails code changes in this pass.

**Client score, 80 traces per version:**

- Issued fetches: **280 → 280**; start times and selected IDs match.
- Obsolete successful completions: **220 → 0**, a **100% reduction**.
- Aborted pending fetches: **0 → 220**.
- Rapid-selection peak in flight: **10 → 1**, within the ceiling of two.
- Rapid-selection and error/recovery ready-state p95: **300 → 300 simulated ms**,
  within the 5% guard. This is state readiness under a controlled clock,
  not actual rendering or network latency.
- Clear state, latest-post identity, current failure visibility, recovery,
  and fully drained timers/requests pass in all traces.

**Native transport/readability check:** An isolated
[React page](benchmarks/preview_browser.jsx) imports the real hook/API wrapper.
Its [loopback server](benchmarks/preview_browser_server.mjs) serves a native
fetch response after 300 real milliseconds. Pre-change and candidate bundles
were separately built with the installed esbuild and archived. The
[browser runner](benchmarks/preview_browser_run.mjs) uses Playwright **1.63.0**
and installed Chromium **151.0.7872.0**, with 1440×900 and 390×844 viewports.
This is desktop Chromium at two widths, not a physical mobile device or the
complete authenticated curation UI.

Each version runs rapid selection, clear, and unmount once at each width,
for **six native-browser traces**. Issued IDs/counts match. In both widths:

- Rapid selection closes **0 → 9** obsolete connections; peak open connections
  fall **6 → 2**. The control's six reflects the browser's HTTP/1 connection
  scheduling, distinct from the hook double's ten in flight.
- Clear and unmount close **0 → 1** pending connections each.
- The latest post renders the expected readable heading, clear remains idle,
  unmount empties the root, and there are no uncaught page errors.

**Backend tradeoff:** The fixture deliberately lets simulated backend work
finish after disconnection. All **24 request workloads per version** still
finish across the two widths. Rapid-trace peak simulated work rises **6 → 10**
as abort frees browser connection slots for newer requests. This demonstrates
why fewer completed client responses do not prove reduced server work and can
change backend concurrency. The change is retained for the declared client
target; it adds no server cancellation or admission control. Actual Rails/HAFBE
work cancellation, deployed proxy behavior, production backend concurrency,
upstream rate limits, bandwidth savings, and physical-device latency remain
unmeasured. No server-load or general latency improvement is claimed.

**Regression checks:** All **327 frontend tests / 40 files** pass. Existing
stale-result and scroll assertions remain and now also check signal cleanup.
Two added cases cover late completion after unmount with a non-cancellable
client and React Strict Mode's cleanup/replacement request. The four frozen
measurement scenarios also pass, and the production Vite build succeeds.
No ordinary Rails or system suite was rerun for this frontend-only change;
the preceding Rails result remains 369 passing tests. The browser fixture
supplies separate native transport/readability evidence, not full-product
browser coverage.

**Evidence:** The [hook control](benchmarks/baselines/2026-10-26-preview-cancel-before.json.gz),
[hook candidate](benchmarks/baselines/2026-10-26-preview-cancel-after.json.gz),
[native control](benchmarks/baselines/2026-10-26-preview-cancel-browser-before.json.gz),
[native candidate](benchmarks/baselines/2026-10-26-preview-cancel-browser-after.json.gz), and
[comparison](benchmarks/baselines/2026-10-26-preview-cancel-summary.json) retain
every trace, lifecycle outcome, source/bundle hash, native disconnect, and
backend-work observation. The [comparison driver](benchmarks/preview_cancel_compare.py)
enforces unchanged scenarios, issued IDs/times, obsolete-completion reduction,
in-flight/ready-state guards, native disconnects, and completed backend work.
The backend concurrency increase is included in its output.

The [control source](benchmarks/baselines/2026-10-26-preview-cancel-before-sources.tar.gz)
and [candidate source/test/harness archive](benchmarks/baselines/2026-10-26-preview-cancel-after-sources.tar.gz)
preserve reproducible versions. The
[control browser bundle](benchmarks/baselines/2026-10-26-preview-cancel-browser-before.js.gz)
and [candidate bundle](benchmarks/baselines/2026-10-26-preview-cancel-browser-after.js.gz)
match their report hashes. Matching `.log` files sit beside all reports;
the [frontend log](benchmarks/baselines/2026-10-26-preview-cancel-frontend.log)
and [build log](benchmarks/baselines/2026-10-26-preview-cancel-build.log) record
normal verification.

Reproduce hook traces under Node 26.12.0 with `HILLS_OUTPUT=<unused-json-path>
npm run test:frontend -- --config benchmarks/sibling_preview.config.mjs` on
each isolated source version. For native checks, compile `benchmarks/preview_browser.jsx`
with esbuild's production React define into `tmp/hills-preview-browser-before.js`
and `-after.js`, with matching `-sources.json` hash maps. Start the loopback
server, then use its emitted URL as `HILLS_URL` with `HILLS_VERSION=before|after`
and a distinct `HILLS_OUTPUT` for `node benchmarks/preview_browser_run.mjs`.
Stop it through POST `/control/shutdown`. The comparison command is
`python3 benchmarks/preview_cancel_compare.py <hook-before> <hook-after>
<browser-before> <browser-after> <summary-path>`; reports may be JSON or gzip.

**Excluded setup attempts:** The collaborative browser twice returned
“Preview snapshot failed: Preview automation snapshot timed out after 15000ms.”
Its owned tab was closed and native verification used the repository's
Playwright/Chromium path. Initial browser setup waits returned while fixture
work was pending; bounded server-state polling replaced that synchronization
before collecting either retained native run. One added unit-test fixture
initially recreated its callback every render and exhausted its worker; the
callback was made stable before the clean full-suite run. Partial/error logs
remain only under ignored `tmp/`; they contribute no scores. The loopback
server and all created browsers/test processes have exited. No commits or
pushes were made.

## Hill #13 experiment — 2026-10-26

**Retained change:** HAFBE history fetching now requires a recognized collection
wrapper or raw array, with object entries. Missing/wrong-shaped collections and
scalar entries raise a contextual `HafbePostRevisions::FetchError` before
normalization instead of quietly becoming an empty history. Existing wrapper
alternatives, unrelated operation objects, patch reconstruction, metadata
fallbacks, and request-scoped response reuse remain.

The published [HAFBE OpenAPI](https://api.hive.blog/hafbe-api/) describes an
operation-history object containing an `operations_result` array of operation
objects. Existing supported raw-array and alternate-wrapper forms are retained
as compatibility controls rather than restricting input to that one spelling.

`PostChainPayload` checks decoded condenser results before returning them:
votes require an array of objects with string voter names and integer signed
percentages; replies require an array of objects; content permits null/empty
objects and checks the optional consumed cashout/payout fields for string types.
Plain Ruby and hive-ruby Hashie collections are accepted. Unknown extra fields
are preserved. Invalid results raise a method-specific `Hive::UnknownError`.
No defaults, type coercions, upstream requests, retries, cache-key changes,
runtime dependencies, or frontend changes are added.

**Fixed comparison:** A fresh control was collected before production edits
with the unchanged [runner](benchmarks/sibling_baseline.rb),
[37-case matrix](benchmarks/sibling_response_fixtures.json), pinned IDs,
frozen clock, and processing fixtures. Both reports record the same driver/
fixture hashes, Ruby **3.3.11**, Rails **8.1.4**, PostgreSQL **16.15**, and base
commit `ff12a97379f6eb475ffea44f2827325aa6f982a1` plus prior retained changes.
Only the revisions and chain-payload services differ among production Ruby
sources. The benchmark uses the scratch database, rolled-back data, and fixed
upstream doubles. Real-node timing is not measured.

**Score:** Controlled malformed rejection rises **1/22 → 22/22** (**100%**),
with **13/13 valid results** and **2/2 ordinary upstream errors** preserved
exactly. HAFBE rises **1/8 → 8/8**; decoded condenser results **0/14 → 14/14**.
Every fixture identity, expected category, rejection type/context, and result
is retained. The panel was not changed or relabeled after implementation.

This score covers the declared service boundaries. Condenser injection starts
after hive-ruby's HTTP/JSON-RPC envelope handling; digest batch-ID validation
remains separate and unchanged. HAFBE checks collection/entry shape while
operation-specific normalization retains its existing policy. These checks
are not a complete Hive/HAFBE schema validator, semantic validation of every
field, or a claim about malformed cases outside this fixed panel.

**Processing cost:** Each large-valid boundary fixture has **20 measurements**.
The allowed increase was fixed at **20 ms p95 per case** before implementation.

- 5,000 HAFBE operations: **4.991 → 5.367 ms p95**, **+0.376 ms**.
- 5,000 active votes: approximately **0.001 → 13.642 ms**, **+13.641 ms**.
- 5,000 replies: approximately **0.001 → 0.165 ms**, **+0.164 ms**.
- Decoded content with a 1 MiB extra body: approximately **0.001 → 0.001 ms**;
  the extra body is not traversed because it is not consumed by this service.

All four cost guards pass. The condenser baseline's near-empty boundary work
does not establish meaningful sub-microsecond precision. Whole-process peak
RSS is **144.11 → 148.97 MiB**, including boot and all cases, not isolated
validator retention. Allocation samples are archived. Request counts and valid
outputs for every revision/content-cache case match, as do between-request
freshness and HTTP-status/payload fingerprints. No performance gain is claimed;
the measured cost buys explicit malformed-data rejection.

**Recovery and regression checks:** Each frozen fixture is a distinct normal
Rails test. Additional coverage exercises actual Hashie result collections
through chain stats, malformed replies/content returning `unavailable` without
changing an existing stored payout or filling either cache, and successful
later requests after upstream correction. Malformed HAFBE entries return HTTP
502 while retaining local body text; a new request recovers and still uses one
upstream fetch. Existing timeout, request reuse, cold body loading, signed-vote,
and failover tests remain.

The focused run passes **119 tests / 840 assertions**. The full Rails suite
passes **410 tests / 2,893 assertions**, with zero failures, errors, or skips.
Coverage is **3,150/3,703 lines** and **756/1,179 branch outcomes** across **71
files**. No frontend or browser suites were rerun for this Ruby service-only
change; healthy endpoint contracts are checked by the unchanged response
fingerprints and public controller tests.

**Artifacts:** The [control](benchmarks/baselines/2026-10-26-response-contract-before.json.gz),
[candidate](benchmarks/baselines/2026-10-26-response-contract-after.json.gz), and
[comparison](benchmarks/baselines/2026-10-26-response-contract-summary.json) retain
all fixture outcomes, source hashes, request/payload traces, allocations, cost
samples, and resource observations. Matching before/after `.log` files contain
process measurements. The [comparison driver](benchmarks/response_contract_compare.py)
enforces the exact panel, all valid/error controls, the cost guard, unchanged
valid request/output traces, and the two-file production scope.

The [control source](benchmarks/baselines/2026-10-26-response-contract-before-sources.tar.gz)
and [candidate source/test archive](benchmarks/baselines/2026-10-26-response-contract-after-sources.tar.gz)
preserve the changed services, tests, frozen matrix, and measurement code. The
[focused log](benchmarks/baselines/2026-10-26-response-contract-focused.log),
[full Rails log](benchmarks/baselines/2026-10-26-response-contract-rails.log), and
[coverage report](benchmarks/baselines/2026-10-26-response-contract-coverage.json.gz)
record verification.

Reproduce the baseline runner using the borrowed-hill scratch-database command,
with distinct `HILLS_OUTPUT` paths on isolated control/candidate source trees.
Compare with `python3 benchmarks/response_contract_compare.py <before-json-or-json.gz>
<after-json-or-json.gz> <summary-path>`, keeping matching process logs beside
the reports. The first full-suite attempt triggered a test Vite rebuild under
the default older Node and failed on missing `node:util.styleText`; the retained
clean run pins Node **26.12.0** in `PATH`, as required by this project. That
environment-error log remains only under ignored `tmp/` and is excluded from
test/coverage results above. All created processes have exited. No commits or
pushes were made. Live-node compatibility across deployments and arbitrary
malformed payloads outside the panel remain unmeasured.

## Hill #14 experiment — 2026-10-26

**Retained change:** Chain stats and payout now read validated raw content from
one existing `post-payout` cache entry per author/permlink. Its **120-second TTL**
and **10-second race grace** remain. Votes/replies have their own cache; current
account vote state is still computed for each caller. Forced stats refresh
refreshes both caches, so the next payout read sees the same fresh content.
Stats uses one total timeout across metadata and content; standalone payout
retains its existing deadline. No dependencies or locks were added.

The votes/replies key is versioned as `chain-stats-v2`: old workers expect
content in the old stats payload. The old key is left intact, and the shared
payout payload format is unchanged. Rollout therefore incurs a one-time cold
votes/replies cache rather than exposing the new shape to old workers.

**Fixed comparison:** A fresh control preceded production edits. Both runs use
the unchanged [borrowed-hill runner](benchmarks/sibling_baseline.rb), fixed IDs,
frozen clock, actual payout persistence inside a rolled-back scratch-database
transaction, explicit MemoryStore, and **5 ms per-RPC** doubles. Each case has
one warmup and **20 measurements**. Ruby **3.3.11**, Rails **8.1.4**, PostgreSQL
**16.15**, runner/fixture hashes, and base commit
`ff12a97379f6eb475ffea44f2827325aa6f982a1` plus earlier retained changes match.
Only `app/services/post_chain_payload.rb` differs among production Ruby sources.

**Score:** Both cold orders make **1 content / 3 total RPC calls**, down from
**2 content / 4 total**. Expiry has the same reduction; two identities fall
**4 → 2 content** and **8 → 6 total**. Warm revisits and another account using
the primed cache still make **zero RPC calls**. Forced refresh remains **1
content / 3 total**, and now both responses report **2.000 HBD**, replacing
the old payout response's stale **1.000 HBD**. Every other returned field,
identity, account vote, and healthy result matches exactly.

Measured service/persistence p95, control → candidate:

- Stats→payout: **32.625 → 25.774 ms**, **21.0% lower**.
- Payout→stats: **33.586 → 26.948 ms**, **19.8% lower**.
- Warm revisit: **2.037 → 2.010 ms**.
- Expired at 121 seconds: **35.032 → 27.568 ms**, **21.3% lower**.
- Forced refresh: **28.403 → 26.963 ms**.
- Two identities: **67.829 → 51.991 ms**, **23.3% lower**.
- Another account: **2.088 → 2.069 ms**.

Every original 10% p95 guard passes, with no added RPCs. The small warm timing
differences are not meaningful gains. Sharing adds a cache read: median cold
pair allocations rise **656 → 691**, warm allocations **574 → 617**. Whole-run
peak RSS is **147.91 → 148.36 MiB**, including boot and unrelated controls;
it does not measure isolated cache retention. These are controlled local service
timings, not live-node or HTTP latency.

**Cache-backend control and limit:** Before implementation, inspection found no
active production cache override in checked-in configuration; Rails 8.1.4's
inherited default is FileStore. The [additional probe](benchmarks/content_file_cache.rb)
uses isolated temporary FileStore directories, separate service/cache instances,
20 sequential and 20 simultaneous cold pairs, fixed 30 ms content / 5 ms other
RPC delays, and a payout stub. All temporary directories are removed. This
checks the locally configured backend class, not a live deployment, separate
processes, shared network filesystem, or deployment-specific overrides.

Sequential FileStore content calls fall **2 → 1** in every sample; simultaneous
cold misses remain **2 → 2**. Both return correct payouts and account votes,
without extra RPCs. Observed p95 is **100.713 → 59.404 ms** sequential and
**60.158 → 58.515 ms** concurrent; these additional timings are descriptive,
not replacements for the original MemoryStore guards. Rails cache fetch does
not coalesce cold misses here. This change establishes sequential reuse only;
one global fetch during concurrent misses remains unachieved and would need
coordination. The requirement to verify the actual deployed backend remains
open because deployment configuration was unavailable.

**Regression checks:** Nine new tests cover both cold orders across service
instances, warm reads at 119 seconds and exact expiry at 120, content refreshed
while votes remain cached, explicit refresh of payout and vote state, failed
refresh preserving cached/stored payout followed by recovery, identity/account
isolation, one total timeout, and legacy-key coexistence. Existing malformed
reply tests now inspect the versioned stats key. All **37 upstream contract
cases**, revision request/payload fingerprints, and next-request freshness
controls remain unchanged.

The focused run passes **120 tests / 846 assertions**. Full Rails passes **419
tests / 2,952 assertions**, with zero failures, errors, or skips, under seed
`6604` and Node **26.12.0** in `PATH`. Coverage is **3,147/3,697 lines** and
**755/1,177 branch outcomes** across **71 files**. Frontend/browser suites were
not rerun for this Ruby service-only change. No production cache or deployment
was touched. All created processes have exited; changes remain uncommitted.

**Artifacts:** The [control](benchmarks/baselines/2026-10-26-content-reuse-before.json.gz),
[candidate](benchmarks/baselines/2026-10-26-content-reuse-after.json.gz), and
[comparison](benchmarks/baselines/2026-10-26-content-reuse-summary.json) retain
all samples, RPC/identity traces, results, allocations, hashes, and resource
observations. FileStore [control](benchmarks/baselines/2026-10-26-content-file-before.json.gz)
and [candidate](benchmarks/baselines/2026-10-26-content-file-after.json.gz) retain
every concurrent/sequential result and call. Matching `.log` files accompany
the reports. The [comparison driver](benchmarks/content_reuse_compare.py)
enforces source scope, fixed sample counts, exact request reductions, all p95
guards, unchanged valid outputs except intentional refresh freshness, retained
revision/contract controls, and FileStore outcomes.

The [control source archive](benchmarks/baselines/2026-10-26-content-reuse-before-sources.tar.gz)
and [candidate source/test archive](benchmarks/baselines/2026-10-26-content-reuse-after-sources.tar.gz)
preserve the measured service, tests, runners, matrix, production configuration,
and dependency locks. Service/runner/fixture hashes were verified against the
reports. The [focused log](benchmarks/baselines/2026-10-26-content-reuse-focused.log),
[full Rails log](benchmarks/baselines/2026-10-26-content-reuse-rails.log), and
[coverage](benchmarks/baselines/2026-10-26-content-reuse-coverage.json.gz) record
verification; coverage source hashes match the measured candidate.

Reproduce the main runner with the scratch-database command in the borrowed
baseline, using distinct `HILLS_OUTPUT` paths on isolated source versions. Run
`benchmarks/content_file_cache.rb` through the same Rails runner for the isolated
backend control. Compare with `python3 benchmarks/content_reuse_compare.py
<main-before> <main-after> <file-before> <file-after> <summary-path>`; each report
may be JSON or gzip, with matching process logs beside the main reports. No
live RPCs or production deployments were measured.
