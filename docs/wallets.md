# Browser wallets

Hyperion owns the login screen and Rails session. `app/javascript/wallet.js`
provides `connect`, `signChallenge`, `vote`, `disconnect`, and `capabilities`
for the React inbox and the legacy pages. Aioha core is pinned to 1.8.5;
QR codes are rendered locally with qrcode 1.5.4.

The login buttons use locally served provider artwork with visible text labels:
[Keychain](https://github.com/hive-keychain/hive-keychain-extension/blob/master/public/assets/images/keychain-round-logo.svg),
[HiveSigner](https://hivesigner.com/icons/icon-128.png),
[HiveAuth](https://hiveauth.com/wp-content/uploads/2022/02/HiveAuth_logo_safezone.svg),
and [Peak Vault](https://vault.peakd.com/peakvault.svg). The decorative images have
empty alt text so screen readers announce each wallet name once. The buttons
include keyboard focus indicators and stack on small screens.

The Edition login layout keeps the original text and Work Sans font. Its
background is `whitesmoke` (#f5f5f5), with a charcoal (#1c1e21) dark palette
selected automatically by `prefers-color-scheme`. Input, message, and wallet
colors follow the same preference, including changes while the page is open.

## Providers and rollout

| Provider | Rails login proof | Voting | Availability |
| --- | --- | --- | --- |
| Hive Keychain | Posting-key signature over a server challenge | Aioha calls the wallet for each vote | Default; requires Keychain in the browser |
| HiveSigner | Rails verifies the OAuth access token with `/api/me` and checks account + state | An explicit HiveSigner signing link for each vote | Default; requires the registered callback for the current host |
| HiveAuth | Posting-key signature over a server challenge | Aioha HiveAuth request with local QR code, deep link, and cancellation | Disabled pending real desktop/mobile checks |
| Peak Vault | Posting-key signature over a server challenge | Aioha calls the extension for each vote | Disabled pending real extension checks |
| Ledger / MetaMask Snap | Not implemented | Not exposed | Disabled |

The default `HYPERION_WALLET_PROVIDERS` is `keychain,hivesigner`. The same
allowlist controls the login buttons and server challenge issuance. On a
verification instance, use `keychain,hivesigner,hiveauth,peakvault` to exercise
the additional providers. Do not enable them in production until their checks
below pass. An empty allowlist disables new browser wallet logins.

HiveAuth needs a secure browser context for both `crypto.randomUUID()` and
`crypto.subtle` encryption. Use HTTPS when reaching development from another
computer; plain HTTP on a LAN hostname or IP will not work. On the computer
running Rails, `http://localhost:3000` is also a secure context. Hyperion checks
these capabilities before starting HiveAuth and explains how to proceed.

All signed wallets (Keychain, HiveAuth, and Peak Vault) also require the browser's
Web Locks API to coordinate authentication changes across Hyperion tabs. Use an
updated browser over HTTPS or localhost; plain HTTP on a LAN hostname does not
provide this API. HiveSigner remains available without it and does not modify
Aioha state on that path.

Peak Vault requires its extension in the browser running Hyperion. Its
[official releases](https://vault.peakd.com/peakvault/releases) list Chrome and
Firefox builds, with no Safari build. Install or enable the extension for the
site and reload; use HiveAuth or HiveSigner in Safari. When the extension is
not detected, Hyperion explains these options before creating a login challenge.

HiveSigner deliberately uses the existing Rails OAuth flow behind the adapter,
with only `scope=login`. Its Aioha provider is not registered: Aioha's token
broadcast path must not silently replace per-vote approval. The access token
is verified, then discarded; it is not sent back to frontend JavaScript.
See [callback registration](../README.md#hivesigner-callbacks). The callback
paths and `hyperion.zone` client ID are unchanged. Verify the actual registered
URIs for every deployed host; localhost needs its own registered callback to
complete real OAuth.

## Authentication and state

Run `bundle exec rails db:migrate` before serving the new login flow.
`POST /sessions` creates a five-minute, single-use challenge bound to the
account, provider, origin, and browser session. `POST /sessions/complete`
recovers the signing key from the signature and the stored message. A direct
posting key must meet the account's posting weight threshold. Active, owner,
memo, delegated account authorities, and signatures below that threshold are
not accepted by the signature verifier. No private keys are requested.

Keep the challenge on one line: Keychain mobile's
[signing bridge](https://github.com/hive-keychain/hive-keychain-mobile/blob/e6f2de660fbe143a5ca01b07c5497221fa9e911d/src/components/bridge/index.tsx#L26)
inserts string arguments into JavaScript without escaping line breaks. A
multiline challenge causes a syntax error before signing and can leave its
Approve screen waiting indefinitely. Rails issues and verifies the same
single-line message; the client must not alter it before signing.

HiveSigner instead returns to `/sessions/authorized` with the challenge token
in OAuth `state`. Rails requires the same browser binding and the account
returned by `/api/me` to match the challenge. Redemption is locked, checked
again for expiry after verification, and followed by session rotation. Login
POSTs require CSRF tokens. Legacy client-supplied digest login is rejected.
The binding uses the loaded Rails session ID, so simultaneous challenge requests
from one browser share the same binding. Loading the stored session first also
prevents a saved, deleted session cookie from redeeming a challenge after logout.

Aioha's restored browser state alone never authenticates a Rails session.
Every vote first checks the live Rails account and provider; signed-provider
votes also require matching Aioha state and persisted account/provider. A
mismatch asks the user to sign in again before invoking a wallet. Existing
browser sessions without a provider require one fresh login before voting.
HiveAuth credentials are reloaded under the browser lock before voting, so a tab
uses the token, key, and expiry renewed by another tab for the same account.
Agent bearer-token issuance and transaction-signing authority are unchanged.

The header's wallet link opens the login form for reconnecting or changing
accounts/providers. Viewing the form preserves the shared Rails session, CSRF
token, pending challenge, and wallet state, so opening it in another tab cannot
invalidate an existing form or wallet request. Starting a signed login resets
the wallet under its browser lock; successful login rotates the Rails session.
A form made stale by explicit logout or a completed login is still rejected with
a reload instruction. CSRF protection stays enabled.

Logout clears the Rails session and cancels this tab's
pending adapter request. Aioha state is cleared when the browser lock is
available; a pending operation in another tab blocks that cleanup.
The legacy frontend waits for the cleanup attempt before submitting Rails logout,
and still submits if cleanup fails.
Some extensions cannot dismiss an outstanding native prompt.
An origin-wide browser lock keeps other Hyperion tabs from changing Aioha state
while a wallet request is pending. After cancellation or timeout, another request
stays blocked until the original wallet operation finishes and any late login
state is cleared. Finish or dismiss the prompt in the wallet, or reload its
Hyperion tab before retrying. Late vote
callbacks do not disconnect a valid login. Requests time out after two minutes;
Rails HTTP requests after 15 seconds. HiveAuth users can scan the QR on another
device or open the deep link, approve there, and return to the still-pending
browser page.

Hive weights are signed integers from -10000 through 10000. A wallet's explicit
success starts vote-state polling; it does not claim chain confirmation.
Closing HiveSigner approval only refreshes the actual vote state. Rejection,
cancellation, timeout, and switching the selected post clear the pending UI
without announcing a successful vote.

HiveSigner signing pages prohibit iframe embedding. The inbox instead shows an
Open HiveSigner link that opens a new tab. Returning to Hyperion refreshes the
observed vote state; Check vote does the same if the browser does not report the
return. Closing the dialog also refreshes without assuming approval. The legacy
frontend already uses an external signing link.
Its signing link and return listener are removed when the weight changes, the
dialog closes, or the post is removed. A late response cannot restore a canceled
link, and each new approval gets its own return listener.

## Verification record (2026-10-09)

Automated coverage includes Rails expiry/replay/browser binding, account
mismatch, CSRF, HiveSigner state and token verification, real secp256k1 posting
signature recovery, and unchanged agent authentication. Frontend coverage
includes all four adapter routes, signed weights, local/server account changes,
missing extensions, cancellation, timeout, logout, late callbacks, duplicate
clicks, and dismissing HiveSigner without false success. The real Aioha Keychain
bridge is exercised with a simulated extension, including reload, logout, a late
rejected vote, and blocked login retries through stale authentication cleanup.
Both the legacy esbuild bundle and React/Vite build are checked.

The latest sub-agent review found and fixed four regressions: stale legacy
HiveSigner links, legacy logout skipping wallet cleanup, simultaneous initial
challenges receiving different browser bindings, and HiveAuth tabs retaining
credentials renewed elsewhere. Tests reproduce each failure. Independent
re-review of the fixes found no remaining blockers. The legacy regressions run
the complete application bundle with real Rails UJS, Stimulus, Bootstrap, and
jQuery; the HiveAuth regression uses the real Aioha provider with only its
signing transport simulated.

The user confirmed local Keychain login, an accepted vote, and logout. After
registering the localhost callback, the user also confirmed HiveSigner login as
`inertia`, logout, and a successful vote broadcast through the external Open
link. The embedded signing page was blocked by HiveSigner's `X-Frame-Options:
DENY` and CSP `frame-ancestors 'none'`; it has been replaced by the external-link
dialog. Automated checks cover returning to refresh the observed vote, manual
refresh, and removing return listeners on dismissal. The user confirmed the
replacement workflow works; no transaction ID was independently verified.

The user confirmed logout in tab A is reflected after refreshing tab B. That
refresh exposed a login-page session reset that invalidated tab A's CSRF token.
Regression tests reproduce the error and verify that repeated login-page loads
preserve earlier forms and challenges, while logout still invalidates both.
Frontend tests cover preserving wallet state on form load and handling non-JSON
server failures with a reload instruction. After the fix, the user confirmed
that overlapping login requests across the two tabs worked as expected.

The desktop login page has been visually checked with all four providers.
On `http://localhost:3000`, a real HiveAuth request reached the QR approval
dialog; cancellation removed the dialog and restored the login buttons.
On the HTTP LAN hostname, the capability check displayed the HTTPS/localhost
guidance before opening a request. After the single-line challenge fix, the user
confirmed a successful HiveAuth login using mobile Keychain and localhost.
HiveAuth voting, rejection, expiry, and logout checks remain pending. Peak Vault
correctly reported a missing extension in Safari, and now explains the supported
browser options. The user confirmed
that Hyperion successfully invoked the installed Peak Vault extension in Brave.
No account had been imported, so signed login and voting remain unverified.
Local login, voting, and logout are confirmed for the default providers. The
two-tab overlapping-login retest passed. The table below records additional
browser/mobile and edge-case coverage that remains unverified.
Simulated extension tests do not establish real-wallet compatibility; keep
HiveAuth and Peak Vault disabled in production until their rows pass too.

| Provider | Desktop | Mobile / return flow |
| --- | --- | --- |
| Keychain | User confirmed local login, an accepted vote, and logout. Pending reload, rejection, switch account, and remaining vote weights | Pending in Keychain's supported mobile browser |
| HiveSigner | User registered localhost callback and confirmed login as inertia, logout, external-link vote broadcast, and the replacement approval/return workflow. Pending up/down/changed-weight coverage and close without approval | Pending: mobile OAuth return and signing-page return |
| HiveAuth | QR display/cancellation verified; user confirmed mobile Keychain approval and localhost login after the single-line challenge fix; pending reload, rejection, expiry, vote and logout | QR approval/return confirmed by user; pending deep link, cancel and background/timeout |
| Peak Vault | User confirmed extension invocation in Brave; no account imported yet. Missing extension handled in Safari. Pending signed login, reload, vote and rejection | Not enabled; verify a supported mobile environment before offering it there |

For each supported environment, check an upvote, downvote, and changed weight
against the chain result. Also expire the Rails session and change the wallet
account in another tab: neither case should sign until reauthenticated. Confirm
that logout removes local wallet state and that changing providers cannot reuse
an old challenge. Record browser, OS, wallet version, and transaction IDs when
running the live checks.

## Rollback

The branch is independent of the agent digest fix. Before deployment it can be
reverted as a unit. The migration only adds `wallet_login_challenges`; retaining
that table is harmless during a code rollback. After rollout, prefer disabling
an affected provider in `HYPERION_WALLET_PROVIDERS` while correcting it. Reverting
the entire login change also restores the old caller-supplied digest flow, so
it should not be used as an unattended authentication rollback.
