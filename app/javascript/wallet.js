import { Aioha, KeyTypes } from '@aioha/aioha'
import { showWalletRequest } from './wallet_request'

const names = {keychain: 'Hive Keychain', hivesigner: 'HiveSigner', hiveauth: 'HiveAuth', peakvault: 'Peak Vault'}

export function hivesignerVoteUrl({accountName, author, permlink, weight}) {
  return `https://hivesigner.com/sign/vote?authority=post&voter=${encodeURIComponent(accountName)}&author=${encodeURIComponent(author)}&permlink=${encodeURIComponent(permlink)}&weight=${weight}`
}

function createCore() {
  const core = new Aioha()
  core.registerKeychain()
  core.registerHiveAuth({name: 'Hyperion', description: 'Read and curate Hive posts'})
  core.registerPeakVault()
  return core
}

export function createWallet({coreFactory = createCore, fetcher = (...args) => fetch(...args), timeoutMs = 120000, onRequest = showWalletRequest} = {}) {
  let core
  let cancelPending
  let operationPending = false
  let operationSettlement
  let ownsLock = false
  let disconnectVersion = 0
  const getCore = () => (core ||= coreFactory())
  const hasWalletLocks = () => typeof navigator.locks?.request === 'function'
  const pendingMessage = 'A wallet request is already pending. Finish it in your wallet or reload its Hyperion tab before trying again.'
  const lockMessage = 'This wallet needs browser coordination support. Open Hyperion over HTTPS or localhost in an updated browser, or use HiveSigner.'

  function requireIdle() {
    if (cancelPending || operationPending) throw new Error(pendingMessage)
  }

  function withWalletLock(action) {
    if (!hasWalletLocks()) return Promise.reject(new Error(lockMessage))
    const version = disconnectVersion
    return new Promise((resolve, reject) => {
      navigator.locks.request('hyperion-wallet', {ifAvailable: true}, async (lock) => {
        if (!lock) throw new Error(pendingMessage)
        ownsLock = true
        try {
          if (version !== disconnectVersion) throw new Error('Wallet request cancelled.')
          getCore().loadAuth()
          return await action()
        } catch (error) {
          // Let the UI cancel now, but retain the origin lock until the SDK stops writing auth.
          if (operationPending) reject(error)
          throw error
        } finally {
          await operationSettlement?.catch(() => {})
          operationSettlement = undefined
          ownsLock = false
        }
      }).then(resolve, reject)
    })
  }

  async function request(path, body) {
    const response = await fetcher(path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
      headers: {Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''},
      ...(body ? {body: JSON.stringify(body)} : {})
    })
    const payload = await response.json().catch(() => {
      throw new Error('The server returned an unexpected response. Reload this page and try again.')
    })
    if (!response.ok) throw new Error(payload.error || 'Your session expired. Please sign in again.')
    return payload
  }

  async function walletRequest(action, authenticating = false) {
    requireIdle()
    const aioha = getCore()
    let close = () => {}
    let cancel = () => {}
    let timer
    let finished = false
    let rejectRequest
    const cancelled = new Promise((_, reject) => { rejectRequest = reject })
    cancelPending = () => {
      cancel()
      rejectRequest(new Error('Wallet request cancelled.'))
    }
    const events = ['hiveauth_login_request', 'hiveauth_sign_request', 'hiveauth_challenge_request']
    const handleRequest = (uri, _event, cancelRequest) => {
      close()
      cancel = cancelRequest
      close = onRequest({uri, cancel: cancelPending}) || (() => {})
    }
    events.forEach((event) => aioha.on(event, handleRequest))
    timer = setTimeout(() => {
      cancel()
      rejectRequest(new Error('Wallet request timed out. Check your wallet before trying again.'))
    }, timeoutMs)
    try {
      operationPending = true
      const operation = (async () => {
        try {
          return await action(aioha)
        } finally {
          try {
            // Aioha persists login before returning. Keep retries blocked through stale-auth cleanup.
            if (finished && authenticating) await aioha.logoutAll()
          } finally {
            operationPending = false
          }
        }
      })()
      operationSettlement = operation
      const result = await Promise.race([operation, cancelled])
      if (result?.success !== true) throw new Error(result?.error || 'The wallet did not approve the request.')
      return result
    } finally {
      finished = true
      cancelPending = undefined
      clearTimeout(timer)
      close()
      events.forEach((event) => aioha.off(event, handleRequest))
    }
  }

  function capabilities(provider) {
    let unavailableReason
    if (provider === 'hiveauth') {
      if (window.isSecureContext === false) unavailableReason = 'HiveAuth needs a secure connection. Open Hyperion over HTTPS, or use localhost on the computer running it.'
      else if (typeof window.crypto?.randomUUID !== 'function' || !window.crypto?.subtle) unavailableReason = 'HiveAuth needs browser encryption support. Please update your browser and open Hyperion over HTTPS.'
    }
    if (provider !== 'hivesigner' && !unavailableReason && !hasWalletLocks()) unavailableReason = lockMessage
    const available = !unavailableReason && (provider === 'hivesigner' || (!!names[provider] && getCore().isProviderEnabled(provider)))
    if (!available && !unavailableReason && provider === 'peakvault') unavailableReason = 'Peak Vault extension was not detected. Use Chrome or Firefox with Peak Vault installed and enabled for this site, then reload. In Safari, use HiveAuth or HiveSigner.'
    return {
      name: names[provider],
      available,
      unavailableReason,
      signChallenge: !!names[provider] && provider !== 'hivesigner',
      vote: !!names[provider]
    }
  }

  function requireAvailable(provider) {
    const capability = capabilities(provider)
    if (!capability.available) throw new Error(capability.unavailableReason || `${names[provider]} is not available in this browser.`)
  }

  async function disconnect() {
    disconnectVersion += 1
    cancelPending?.()
    if (!hasWalletLocks()) return
    if (ownsLock) await getCore().logoutAll()
    else await withWalletLock(() => getCore().logoutAll())
  }

  async function signLoginChallenge(challenge) {
    const {provider, account_name: accountName, message} = challenge
    if (!capabilities(provider).signChallenge) throw new Error('This wallet cannot sign a login challenge.')
    requireAvailable(provider)
    const result = await walletRequest((aioha) => aioha.login(provider, accountName, {msg: message, keyType: KeyTypes.Posting}), true)
    if (result.username !== accountName || result.provider !== provider) throw new Error('The wallet account changed. Please sign in again.')
    return result.result
  }

  async function connect({accountName, provider}) {
    requireIdle()
    if (!names[provider]) throw new Error('Choose a supported wallet.')
    requireAvailable(provider)
    if (provider === 'hivesigner') {
      const challenge = await request('/sessions', {account_name: accountName, provider})
      return {redirect_url: challenge.redirect_url}
    }
    return withWalletLock(async () => {
      const version = disconnectVersion
      await getCore().logoutAll()
      try {
        const challenge = await request('/sessions', {account_name: accountName, provider})
        if (version !== disconnectVersion) throw new Error('Wallet request cancelled.')
        const signature = await signLoginChallenge(challenge)
        if (version !== disconnectVersion) throw new Error('Wallet request cancelled.')
        return await request('/sessions/complete', {token: challenge.token, signature})
      } catch (error) {
        await getCore().logoutAll()
        throw error
      }
    })
  }

  async function vote({accountName, provider, author, permlink, weight}) {
    if (!Number.isInteger(weight) || weight < -10000 || weight > 10000) throw new Error('Vote weight must be between -10000 and 10000.')
    const session = await request('/api/v1/session')
    if (!session.authenticated || session.account?.name !== accountName || !names[provider] || session.wallet?.provider !== provider) {
      throw new Error('Your account or wallet changed. Please sign in again before voting.')
    }
    // Keep HiveSigner login-only: every vote requires its own signing approval.
    if (provider === 'hivesigner') return {status: 'approval_required', url: hivesignerVoteUrl({accountName, author, permlink, weight})}

    requireAvailable(provider)
    return withWalletLock(async () => {
      const aioha = getCore()
      if (aioha.getCurrentUser() !== accountName || aioha.getCurrentProvider() !== provider ||
          localStorage.getItem('aiohaUsername') !== accountName || localStorage.getItem('aiohaProvider') !== provider) {
        throw new Error('Reconnect your wallet by signing in again before voting.')
      }
      const result = await walletRequest((client) => client.vote(author, permlink, weight))
      return {status: 'submitted', transactionId: result.result}
    })
  }

  return {connect, signChallenge: (challenge) => withWalletLock(() => signLoginChallenge(challenge)), vote, disconnect, capabilities}
}

export const wallet = createWallet()
