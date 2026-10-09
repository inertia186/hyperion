# Browser wallets

Hyperion owns the login screen and Rails session. `app/javascript/wallet.js`
provides `connect`, `signChallenge`, `vote`, `disconnect`, and `capabilities`
for the React inbox and the legacy pages. Aioha core is pinned to 1.8.5;
QR codes are rendered locally with qrcode 1.5.4.

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

HiveSigner instead returns to `/sessions/authorized` with the challenge token
in OAuth `state`. Rails requires the same browser binding and the account
returned by `/api/me` to match the challenge. Redemption is locked, checked
again for expiry after verification, and followed by session rotation. Login
POSTs require CSRF tokens. Legacy client-supplied digest login is rejected.

Aioha's restored browser state alone never authenticates a Rails session.
Every vote first checks the live Rails account and provider; signed-provider
votes also require matching Aioha state and persisted account/provider. A
mismatch asks the user to sign in again before invoking a wallet. Existing
browser sessions without a provider require one fresh login before voting.
Agent bearer-token issuance and transaction-signing authority are unchanged.

The header's wallet link starts a fresh login for reconnecting or changing
accounts/providers. Logout clears Rails and Aioha state and cancels the pending
adapter request. A late extension callback is discarded. Some extensions
cannot dismiss an outstanding native prompt; after timeout, check the wallet
before retrying. Requests time out after two minutes; Rails HTTP requests after
15 seconds. HiveAuth users can scan the QR on another device or open the deep
link, approve there, and return to the still-pending browser page.

Hive weights are signed integers from -10000 through 10000. A wallet's explicit
success starts vote-state polling; it does not claim chain confirmation.
Closing HiveSigner approval only refreshes the actual vote state. Rejection,
cancellation, timeout, and switching the selected post clear the pending UI
without announcing a successful vote.

## Verification record (2026-10-09)

Automated coverage includes Rails expiry/replay/browser binding, account
mismatch, CSRF, HiveSigner state and token verification, real secp256k1 posting
signature recovery, and unchanged agent authentication. Frontend coverage
includes all four adapter routes, signed weights, local/server account changes,
missing extensions, cancellation, timeout, logout, late callbacks, duplicate
clicks, and dismissing HiveSigner without false success. The real Aioha Keychain
bridge is exercised with a simulated extension, including reload and logout.
Both the legacy esbuild bundle and React/Vite build are checked.

Real-wallet desktop and mobile checks have **not** been performed for any
provider in this change. No live transaction was submitted. The local Rails
login page returned HTTP 200, but the collaborative preview browser failed to
navigate to it; visual verification remains pending. Simulated extension tests
are not evidence of real-wallet compatibility. Keep the PR in draft until the
default providers pass the following checks; keep HiveAuth and Peak Vault
disabled until their rows pass too.

| Provider | Desktop | Mobile / return flow |
| --- | --- | --- |
| Keychain | Pending: installed and missing extension, login, reload, vote, rejection, switch account, logout | Pending in Keychain's supported mobile browser |
| HiveSigner | Pending: registered callback, login-only scope, explicit up/down/changed-weight approvals, close without approval | Pending: OAuth return and signing-page return |
| HiveAuth | Pending: QR handoff, approved/rejected/expired requests, login and vote | Pending: deep link, approve, return, cancel, background/timeout |
| Peak Vault | Pending: extension availability, signed login, reload, vote and rejection | Not enabled; verify a supported mobile environment before offering it there |

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
