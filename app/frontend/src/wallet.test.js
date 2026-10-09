import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createWallet } from '../../javascript/wallet'

const accountName = 'fixture-curator'
const voteArgs = {accountName, provider: 'keychain', author: 'author', permlink: 'post', weight: 4200}
const response = (payload, ok = true) => ({ok, json: async () => payload})

function setup({provider = 'keychain', timeoutMs = 120000} = {}) {
  localStorage.setItem('aiohaUsername', accountName)
  localStorage.setItem('aiohaProvider', provider)
  const core = {
    on: vi.fn(), off: vi.fn(), logoutAll: vi.fn().mockResolvedValue(),
    isProviderEnabled: vi.fn(() => true),
    getCurrentUser: vi.fn(() => accountName), getCurrentProvider: vi.fn(() => provider),
    login: vi.fn().mockResolvedValue({success: true, username: accountName, provider, result: 'signature'}),
    vote: vi.fn().mockResolvedValue({success: true, result: 'transaction-id'})
  }
  const fetcher = vi.fn().mockResolvedValue(response({authenticated: true, account: {name: accountName}, wallet: {provider}}))
  const close = vi.fn()
  const onRequest = vi.fn(() => close)
  const adapter = createWallet({coreFactory: () => core, fetcher, onRequest, timeoutMs})
  return {adapter, core, fetcher, onRequest, close}
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('crypto', webcrypto)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete window.hive_keychain })

describe('wallet adapter', () => {
  test('HiveAuth rejects HTTP origins before opening a wallet or creating a challenge', async () => {
    vi.stubGlobal('isSecureContext', false)
    const {adapter, core, fetcher} = setup({provider: 'hiveauth'})
    expect(adapter.capabilities('hiveauth').available).toBe(false)
    expect(adapter.capabilities('peakvault').available).toBe(true)
    await expect(adapter.connect({accountName, provider: 'hiveauth'})).rejects.toThrow('HTTPS, or use localhost')
    await expect(adapter.signChallenge({account_name: accountName, provider: 'hiveauth', message: 'challenge'})).rejects.toThrow('secure connection')
    expect(fetcher).not.toHaveBeenCalled()
    expect(core.logoutAll).not.toHaveBeenCalled()
    expect(core.login).not.toHaveBeenCalled()
    await expect(adapter.vote({...voteArgs, provider: 'hiveauth'})).rejects.toThrow('secure connection')
    expect(core.vote).not.toHaveBeenCalled()
  })

  test.each(['randomUUID', 'subtle'])('HiveAuth explains missing %s support in a secure context', async (missing) => {
    vi.stubGlobal('crypto', {randomUUID: webcrypto.randomUUID.bind(webcrypto), subtle: webcrypto.subtle, [missing]: undefined})
    const {adapter, core, fetcher} = setup({provider: 'hiveauth'})
    await expect(adapter.connect({accountName, provider: 'hiveauth'})).rejects.toThrow('update your browser')
    expect(fetcher).not.toHaveBeenCalled()
    expect(core.login).not.toHaveBeenCalled()
  })

  test.each(['keychain', 'hiveauth', 'peakvault'])('verifies a server-issued %s challenge before completing Rails login', async (provider) => {
    const {adapter, core, fetcher} = setup({provider})
    fetcher.mockResolvedValueOnce(response({token: 'token', account_name: accountName, provider, message: 'server challenge'}))
      .mockResolvedValueOnce(response({authenticated: true, redirect_url: '/'}))

    await expect(adapter.connect({accountName, provider})).resolves.toEqual({authenticated: true, redirect_url: '/'})
    expect(core.login).toHaveBeenCalledWith(provider, accountName, {msg: 'server challenge', keyType: 'posting'})
    expect(fetcher).toHaveBeenLastCalledWith('/sessions/complete', expect.objectContaining({body: JSON.stringify({token: 'token', signature: 'signature'})}))
  })

  test('keeps HiveSigner OAuth and per-vote approval outside token broadcasting', async () => {
    const {adapter, core, fetcher} = setup({provider: 'hivesigner'})
    fetcher.mockResolvedValueOnce(response({redirect_url: 'https://hivesigner.com/oauth2/authorize?scope=login'}))
    await expect(adapter.connect({accountName, provider: 'hivesigner'})).resolves.toEqual({redirect_url: 'https://hivesigner.com/oauth2/authorize?scope=login'})
    const result = await adapter.vote({...voteArgs, provider: 'hivesigner', weight: -1700})
    expect(result).toEqual({status: 'approval_required', url: 'https://hivesigner.com/sign/vote?authority=post&voter=fixture-curator&author=author&permlink=post&weight=-1700'})
    expect(core.login).not.toHaveBeenCalled()
    expect(core.vote).not.toHaveBeenCalled()
  })

  test.each([10000, -2500, 0])('passes Hive vote weight %i unchanged and reports only explicit success', async (weight) => {
    const {adapter, core} = setup()
    await expect(adapter.vote({...voteArgs, weight})).resolves.toEqual({status: 'submitted', transactionId: 'transaction-id'})
    expect(core.vote).toHaveBeenCalledWith('author', 'post', weight)
  })

  test.each([
    {authenticated: false},
    {authenticated: true, account: {name: 'different-account'}, wallet: {provider: 'keychain'}},
    {authenticated: true, account: {name: accountName}, wallet: {provider: 'hivesigner'}},
    {authenticated: true, account: {name: accountName}}
  ])('blocks signing when the Rails account or provider does not match', async (payload) => {
    const {adapter, core, fetcher} = setup()
    fetcher.mockResolvedValue(response(payload))
    await expect(adapter.vote(voteArgs)).rejects.toThrow('sign in again')
    expect(core.vote).not.toHaveBeenCalled()
  })

  test('blocks local wallet switches until Rails authentication is repeated', async () => {
    const {adapter, core} = setup()
    localStorage.setItem('aiohaUsername', 'another-user')
    await expect(adapter.vote(voteArgs)).rejects.toThrow('Reconnect your wallet')
    expect(core.vote).not.toHaveBeenCalled()
  })

  test('rejects unsupported wallets, missing extensions, wrong login accounts, and rejected votes', async () => {
    const {adapter, core} = setup()
    await expect(adapter.connect({accountName, provider: 'metamasksnap'})).rejects.toThrow('supported wallet')
    core.isProviderEnabled.mockReturnValue(false)
    await expect(adapter.vote(voteArgs)).rejects.toThrow('not available')
    core.isProviderEnabled.mockReturnValue(true)
    core.login.mockResolvedValue({success: true, provider: 'keychain', username: 'someone-else', result: 'signature'})
    await expect(adapter.signChallenge({provider: 'keychain', account_name: accountName, message: 'challenge'})).rejects.toThrow('account changed')
    core.vote.mockResolvedValue({success: false, error: 'Cancelled by user'})
    await expect(adapter.vote(voteArgs)).rejects.toThrow('Cancelled by user')
    core.vote.mockResolvedValue(undefined)
    await expect(adapter.vote(voteArgs)).rejects.toThrow('did not approve')
  })

  test('times out pending requests and removes provider event handlers', async () => {
    vi.useFakeTimers()
    const {adapter, core} = setup({timeoutMs: 20})
    core.vote.mockImplementation(() => new Promise(() => {}))
    const result = expect(adapter.vote(voteArgs)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(20)
    await result
    expect(core.off).toHaveBeenCalledTimes(3)
  })

  test('logout cancels pending requests and duplicate requests cannot sign', async () => {
    const {adapter, core} = setup()
    core.vote.mockImplementation(() => new Promise(() => {}))
    const pending = expect(adapter.vote(voteArgs)).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(core.vote).toHaveBeenCalledOnce())
    await expect(adapter.vote(voteArgs)).rejects.toThrow('already pending')
    await adapter.disconnect()
    await pending
    expect(core.logoutAll).toHaveBeenCalledOnce()
    expect(core.off).toHaveBeenCalledTimes(3)
  })

  test.each([-10001, 10001, 1.5, NaN])('rejects invalid vote weight %s before contacting a wallet', async (weight) => {
    const {adapter, core, fetcher} = setup()
    await expect(adapter.vote({...voteArgs, weight})).rejects.toThrow('Vote weight')
    expect(fetcher).not.toHaveBeenCalled()
    expect(core.vote).not.toHaveBeenCalled()
  })

  test('a late extension login callback after logout cannot restore wallet state', async () => {
    const {adapter, core} = setup()
    let resolveLogin
    core.login.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve }))
    const pending = expect(adapter.signChallenge({provider: 'keychain', account_name: accountName, message: 'challenge'})).rejects.toThrow('cancelled')
    await adapter.disconnect()
    await pending
    resolveLogin({success: true, provider: 'keychain', username: accountName, result: 'signature'})
    await vi.waitFor(() => expect(core.logoutAll).toHaveBeenCalledTimes(2))
  })

  test('shows HiveAuth request data locally and cancellation clears the request UI', async () => {
    const {adapter, core, onRequest, close} = setup({provider: 'hiveauth'})
    const cancel = vi.fn()
    core.vote.mockImplementation(() => {
      core.on.mock.calls.find(([event]) => event === 'hiveauth_sign_request')[1]('has://sign_req/test', {}, cancel)
      return new Promise(() => {})
    })
    const vote = adapter.vote({...voteArgs, provider: 'hiveauth'})
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalled())
    onRequest.mock.calls[0][0].cancel()
    await expect(vote).rejects.toThrow('cancelled')
    expect(cancel).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(core.off).toHaveBeenCalledTimes(3)
  })

  test('uses the real Aioha Keychain bridge for login, refresh, voting and logout', async () => {
    window.hive_keychain = {
      requestSignBuffer: vi.fn((_account, _message, _role, callback) => callback({success: true, result: 'signature'})),
      requestVote: vi.fn((_account, _permlink, _author, _weight, callback) => callback({success: true, result: {id: 'tx'}}))
    }
    const fetcher = vi.fn().mockResolvedValueOnce(response({token: 'token', account_name: accountName, provider: 'keychain', message: 'server challenge'}))
      .mockResolvedValueOnce(response({authenticated: true, redirect_url: '/'}))
      .mockResolvedValue(response({authenticated: true, account: {name: accountName}, wallet: {provider: 'keychain'}}))
    await createWallet({fetcher}).connect({accountName, provider: 'keychain'})
    expect(window.hive_keychain.requestSignBuffer).toHaveBeenCalledWith(accountName, 'server challenge', 'Posting', expect.any(Function), undefined, undefined)
    const refreshed = createWallet({fetcher})
    await expect(refreshed.vote(voteArgs)).resolves.toEqual({status: 'submitted', transactionId: 'tx'})
    expect(window.hive_keychain.requestVote).toHaveBeenCalledWith(accountName, 'post', 'author', 4200, expect.any(Function))
    await refreshed.disconnect()
    expect(localStorage.getItem('aiohaUsername')).toBeNull()
  })
})
