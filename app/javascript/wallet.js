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
  core.loadAuth()
  return core
}

export function createWallet({coreFactory = createCore, fetcher = (...args) => fetch(...args), timeoutMs = 120000, onRequest = showWalletRequest} = {}) {
  let core
  let cancelPending
  const getCore = () => (core ||= coreFactory())

  async function request(path, body) {
    const response = await fetcher(path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
      headers: {Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''},
      ...(body ? {body: JSON.stringify(body)} : {})
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Your session expired. Please sign in again.')
    return payload
  }

  async function walletRequest(action) {
    if (cancelPending) throw new Error('A wallet request is already pending. Finish or cancel it first.')
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
      const operation = Promise.resolve(action(aioha)).then(async (result) => {
        // Extensions cannot always dismiss a prompt; discard auth restored by a late callback.
        if (finished) await aioha.logoutAll()
        return result
      })
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
    return {
      name: names[provider],
      available: provider === 'hivesigner' || (!!names[provider] && getCore().isProviderEnabled(provider)),
      signChallenge: !!names[provider] && provider !== 'hivesigner',
      vote: !!names[provider]
    }
  }

  async function disconnect() {
    cancelPending?.()
    await getCore().logoutAll()
  }

  async function signChallenge(challenge) {
    const {provider, account_name: accountName, message} = challenge
    if (!capabilities(provider).signChallenge) throw new Error('This wallet cannot sign a login challenge.')
    if (!capabilities(provider).available) throw new Error(`${names[provider]} is not available in this browser.`)
    const result = await walletRequest((aioha) => aioha.login(provider, accountName, {msg: message, keyType: KeyTypes.Posting}))
    if (result.username !== accountName || result.provider !== provider) throw new Error('The wallet account changed. Please sign in again.')
    return result.result
  }

  async function connect({accountName, provider}) {
    if (!names[provider]) throw new Error('Choose a supported wallet.')
    await disconnect()
    const challenge = await request('/sessions', {account_name: accountName, provider})
    if (provider === 'hivesigner') return {redirect_url: challenge.redirect_url}

    try {
      const signature = await signChallenge(challenge)
      return await request('/sessions/complete', {token: challenge.token, signature})
    } catch (error) {
      await disconnect()
      throw error
    }
  }

  async function vote({accountName, provider, author, permlink, weight}) {
    if (!Number.isInteger(weight) || weight < -10000 || weight > 10000) throw new Error('Vote weight must be between -10000 and 10000.')
    const session = await request('/api/v1/session')
    if (!session.authenticated || session.account?.name !== accountName || !names[provider] || session.wallet?.provider !== provider) {
      throw new Error('Your account or wallet changed. Please sign in again before voting.')
    }
    // Keep HiveSigner login-only: every vote requires its own signing approval.
    if (provider === 'hivesigner') return {status: 'approval_required', url: hivesignerVoteUrl({accountName, author, permlink, weight})}

    const aioha = getCore()
    if (aioha.getCurrentUser() !== accountName || aioha.getCurrentProvider() !== provider ||
        localStorage.getItem('aiohaUsername') !== accountName || localStorage.getItem('aiohaProvider') !== provider) {
      throw new Error('Reconnect your wallet by signing in again before voting.')
    }
    if (!capabilities(provider).available) throw new Error(`${names[provider]} is not available in this browser.`)
    const result = await walletRequest((client) => client.vote(author, permlink, weight))
    return {status: 'submitted', transactionId: result.result}
  }

  return {connect, signChallenge, vote, disconnect, capabilities}
}

export const wallet = createWallet()
