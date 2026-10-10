// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const { JSDOM } = require('jsdom')
let bundle
let page
let browser
let document
let wallet
let submissions

beforeAll(async () => {
  const result = await build({
    entryPoints: [require.resolve('../../javascript/application.js')],
    bundle: true, write: false, format: 'iife', platform: 'browser',
    plugins: [{name: 'wallet-boundary', setup(builder) {
      builder.onLoad({filter: /\/app\/javascript\/wallet\.js$/}, () => ({
        contents: 'export const wallet = window.testWallet', loader: 'js'
      }))
    }}]
  })
  bundle = result.outputFiles[0].text
})

beforeEach(async () => {
  page = new JSDOM(`
    <body data-controller="hyperion">
      <a href="/sessions/alice" data-method="delete" data-action="hyperion#disableBody">Log Out</a>
      <div class="global-spinner" style="display:none"></div>
      <div id="current-account" data-name="alice" data-wallet-provider="hivesigner"></div>
      <section data-controller="posts" data-posts-id-value="1" data-posts-author-value="writer" data-posts-permlink-value="post">
        <div data-posts-target="pendingPayout"></div>
        <div data-posts-target="previewVoteCount"></div>
        <div data-posts-target="previewPendingPayout"></div>
        <div class="modal" id="upvote-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-body">
          <input type="range" min="0" max="100" value="100" data-action="posts#changeUpvote">
          <span class="upvote-percent">100 %</span><button data-action="posts#upvote">Vote</button>
        </div></div></div></div>
      </section>
    </body>`, {url: 'https://hyperion.test', runScripts: 'outside-only', pretendToBeVisual: true})
  browser = page.window
  document = browser.document
  wallet = {
    disconnect: vi.fn().mockResolvedValue(),
    vote: vi.fn(async ({weight}) => ({status: 'approval_required', url: `https://hivesigner.com/sign/vote?weight=${weight}`}))
  }
  browser.testWallet = wallet
  browser.hive = {api: {
    getContent: vi.fn((_author, _permlink, callback) => callback(null, {pending_payout_value: '0.000 HBD'})),
    getActiveVotes: vi.fn((_author, _permlink, callback) => callback(null, []))
  }}
  // Run the vote refresh immediately without replacing Bootstrap's own timers.
  const setTimeout = browser.setTimeout.bind(browser)
  browser.setTimeout = (callback, delay, ...args) => setTimeout(callback, delay === 3000 ? 0 : delay, ...args)
  submissions = []
  document.addEventListener('submit', (event) => {
    submissions.push(event.target)
    event.preventDefault()
  })
  browser.eval(bundle)
  await vi.waitFor(() => expect(browser.hive.api.getContent).toHaveBeenCalledOnce())
})

afterEach(() => page?.window.close())

const signingLink = () => document.querySelector('[data-wallet-signing-link]')
const showVote = () => browser.$('#upvote-1').modal('show')
const hideVote = () => browser.$('#upvote-1').modal('hide')
const returnToPage = () => browser.dispatchEvent(new browser.Event('focus'))
const changeWeight = (weight) => {
  document.querySelector('input').value = String(weight)
  document.querySelector('input').dispatchEvent(new browser.Event('input', {bubbles: true}))
}
const requestApproval = async () => {
  document.querySelector('button').click()
  await vi.waitFor(() => expect(signingLink()).not.toBeNull())
  return signingLink()
}

describe('legacy logout through Rails UJS', () => {
  test.each(['resolved', 'rejected'])('waits for %s wallet cleanup before submitting logout', async (outcome) => {
    let finish
    wallet.disconnect.mockImplementation(() => new Promise((resolve, reject) => {
      finish = () => outcome === 'resolved' ? resolve() : reject(new Error('Another tab holds the wallet lock.'))
    }))
    document.querySelector('a[data-method]').click()
    expect(wallet.disconnect).toHaveBeenCalledOnce()
    expect(submissions).toHaveLength(0)
    expect(document.querySelector('.global-spinner').style.display).not.toBe('none')
    finish()
    await vi.waitFor(() => expect(submissions).toHaveLength(1))
    expect(submissions[0].action).toBe('https://hyperion.test/sessions/alice')
    expect(submissions[0].querySelector('[name="_method"]').value).toBe('delete')
  })
})

describe('legacy HiveSigner approval lifetime', () => {
  test('changing the slider removes the old signing URL before another approval', async () => {
    showVote()
    await requestApproval()
    changeWeight(10)
    expect(Boolean(signingLink())).toBe(false)
    const link = await requestApproval()
    expect(new URL(link.href).searchParams.get('weight')).toBe('1000')
  })

  test.each([false, true])('hiding and reopening clears approval and its return listener (opened: %s)', async (opened) => {
    showVote()
    const link = await requestApproval()
    if (opened) link.click()
    hideVote()
    showVote()
    returnToPage()
    expect(Boolean(signingLink())).toBe(false)
    expect(document.getElementById('upvote-1').classList.contains('show')).toBe(true)
    expect(browser.hive.api.getActiveVotes).not.toHaveBeenCalled()
  })

  test('returning checks observed votes and each later approval gets a fresh return listener', async () => {
    for (const [index, weight] of [100, 10].entries()) {
      showVote()
      changeWeight(weight)
      const link = await requestApproval()
      expect(new URL(link.href).searchParams.get('weight')).toBe(String(weight * 100))
      link.click()
      returnToPage()
      await vi.waitFor(() => expect(browser.hive.api.getActiveVotes).toHaveBeenCalledTimes(index + 1))
      expect(Boolean(signingLink())).toBe(false)
      expect(document.getElementById('upvote-1').classList.contains('show')).toBe(false)
    }
  })

  test.each(['hide', 'weight'])('discards a late signing URL after %s cancels the request', async (cancel) => {
    let finish
    wallet.vote.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    showVote()
    document.querySelector('button').click()
    if (cancel === 'hide') hideVote()
    else changeWeight(10)
    finish({status: 'approval_required', url: 'https://hivesigner.com/sign/vote?weight=10000'})
    await vi.waitFor(() => expect(document.querySelector('button').disabled).toBe(false))
    expect(Boolean(signingLink())).toBe(false)
  })

  test('removing the post disconnects its pending return listener', async () => {
    showVote()
    const link = await requestApproval()
    link.click()
    const errors = []
    browser.addEventListener('error', (event) => { errors.push(event.error); event.preventDefault() })
    document.querySelector('section').remove()
    await new Promise((resolve) => browser.setTimeout(resolve, 0))
    returnToPage()
    await new Promise((resolve) => browser.setTimeout(resolve, 0))
    expect(errors).toEqual([])
    expect(browser.hive.api.getActiveVotes).not.toHaveBeenCalled()
  })
})
