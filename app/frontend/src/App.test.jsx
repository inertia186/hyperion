import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { imageProxy } from './format'

const posts = [
  {
    id: 1,
    author: 'visible-author',
    permlink: 'first-post',
    title: 'First Post',
    category: 'hive-13323',
    category_name: 'Hive',
    category_image_url: 'https://example.com/hive-community.png',
    tags: [
      {tag: 'hive-13323', name: 'Hive', image_url: 'https://example.com/hive-community.png', category: true},
      {tag: 'hive-19999', name: 'Side Community', image_url: 'https://example.com/side-community.png', category: false},
      {tag: 'haf', category: false}
    ],
    tags_count: 1,
    thumbnail_url: 'https://example.com/first-post.jpg',
    author_avatar_url: 'https://images.hive.blog/u/visible-author/avatar',
    placeholder_image_url: 'data:image/gif;base64,R0lGODdhAQABAAAAACw=',
    canonical_url: 'https://hive.blog/hive-13323/@visible-author/first-post',
    app: 'unknown',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted: false,
    blacklisted: false,
    read: false,
    muted_author: false
  },
  {
    id: 2,
    author: 'middle-author',
    permlink: 'middle-post',
    title: 'Middle Post',
    category: 'hive-13323',
    category_name: 'Hive',
    category_image_url: 'https://example.com/hive-community.png',
    tags: [{tag: 'curation', category: false}],
    tags_count: 1,
    thumbnail_url: null,
    author_avatar_url: 'https://images.hive.blog/u/middle-author/avatar',
    placeholder_image_url: 'data:image/gif;base64,R0lGODdhAQABAAAAACw=',
    canonical_url: 'https://hive.blog/hive-13323/@middle-author/middle-post',
    app: 'unknown',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted: false,
    blacklisted: false,
    read: false,
    muted_author: false
  },
  {
    id: 3,
    author: 'last-author',
    permlink: 'last-post',
    title: 'Last Post',
    category: 'hive-13323',
    category_name: 'Hive',
    category_image_url: 'https://example.com/hive-community.png',
    tags: [{tag: 'testing', category: false}],
    tags_count: 1,
    thumbnail_url: null,
    author_avatar_url: 'https://images.hive.blog/u/last-author/avatar',
    placeholder_image_url: 'data:image/gif;base64,R0lGODdhAQABAAAAACw=',
    canonical_url: 'https://hive.blog/hive-13323/@last-author/last-post',
    app: 'unknown',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted: false,
    blacklisted: false,
    read: false,
    muted_author: false
  }
]

const makePost = (id) => ({
  ...posts[0],
  id,
  author: `author-${id}`,
  permlink: `post-${id}`,
  title: `Post ${id}`,
  tags: [{tag: `tag-${id}`, category: false}],
  canonical_url: `https://hive.blog/hive-13323/@author-${id}/post-${id}`
})

const jsonResponse = (payload) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(payload)
})

const jsonError = (payload, status = 500) => Promise.resolve({
  ok: false,
  status,
  statusText: 'Request failed',
  json: () => Promise.resolve(payload)
})

const proxiedImage = (url, size) => {
  const params = new URLSearchParams({url})
  if (size) params.set('size', size)
  return `/api/v1/images/proxy?${params.toString()}`
}

test('imageProxy normalizes protocol-relative image URLs', () => {
  expect(imageProxy('//example.com/body.png')).toBe(proxiedImage('https://example.com/body.png'))
})

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {promise, resolve, reject}
}

let mobileLayoutMatches
let systemDarkMatches
let mediaListeners

const installMatchMedia = () => {
  mediaListeners = new Map()
  window.matchMedia = vi.fn((query) => ({
    matches: query === '(prefers-color-scheme: dark)' ? systemDarkMatches : mobileLayoutMatches,
    media: query,
    addEventListener: vi.fn((_event, listener) => {
      if (!mediaListeners.has(query)) mediaListeners.set(query, new Set())
      mediaListeners.get(query).add(listener)
    }),
    removeEventListener: vi.fn((_event, listener) => mediaListeners.get(query)?.delete(listener)),
    addListener: vi.fn((listener) => {
      if (!mediaListeners.has(query)) mediaListeners.set(query, new Set())
      mediaListeners.get(query).add(listener)
    }),
    removeListener: vi.fn((listener) => mediaListeners.get(query)?.delete(listener))
  }))
}

const setMobileLayout = (matches) => {
  mobileLayoutMatches = matches
  installMatchMedia()
}

const setSystemDark = (matches) => {
  systemDarkMatches = matches
  const listeners = mediaListeners?.get('(prefers-color-scheme: dark)') || new Set()
  listeners.forEach((listener) => listener({matches, media: '(prefers-color-scheme: dark)'}))
}

const installLocalStorage = () => {
  const store = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: vi.fn(() => store.clear()),
      getItem: vi.fn((key) => store.has(key) ? store.get(key) : null),
      removeItem: vi.fn((key) => store.delete(key)),
      setItem: vi.fn((key, value) => store.set(key, String(value)))
    }
  })
}

const pointerEvent = (type, target, properties = {}) => {
  const event = new Event(type, {bubbles: true, cancelable: true})
  Object.entries(properties).forEach(([key, value]) => {
    Object.defineProperty(event, key, {value})
  })
  fireEvent(target, event)
}

const installIntersectionObserverMock = () => {
  const observers = []

  class MockIntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback
      this.options = options
      this.targets = new Set()
      observers.push(this)
    }

    observe(target) {
      this.targets.add(target)
    }

    unobserve(target) {
      this.targets.delete(target)
    }

    disconnect() {
      this.targets.clear()
    }
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver
  })
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver
  })

  return {
    observers,
    trigger: (target, isIntersecting = true) => {
      act(() => {
        observers
          .filter((observer) => observer.targets.has(target))
          .forEach((observer) => observer.callback([{target, isIntersecting}], observer))
      })
    }
  }
}

let currentPosts
let detailResponses
let detailFailures
let revisionResponses
let revisionFailures
let hivesignerAvailable
let emptyTags
let onlyFavoriteTagsEnabled
let sessionTheme
let minimumReputation
let hivewatchersBlacklistEnabled
let votingPowerPayload
let votingPowerFailure
let chainStatsPayload
let chainStatsResponses

const postsPayload = (params = new URLSearchParams()) => {
  const tag = params.get('tag') || ''
  const author = params.get('author') || ''
  const page = Number(params.get('page') || 1)
  const limit = Number(params.get('limit') || 30)
  const filteredPosts = emptyTags.has(tag) ? [] : currentPosts
  const pagePosts = filteredPosts.slice((page - 1) * limit, page * limit)

  return {
    query: {
      tag,
      tag_pattern: tag,
      author,
      muted_authors_enabled: false,
      only_favorite_tags: onlyFavoriteTagsEnabled,
      sort: params.get('sort') || 'latest',
      limit,
      only_read: params.get('only_read') === 'true',
      only_ignored: params.get('only_ignored') === 'true',
      only_deleted: params.get('only_deleted') === 'true',
      only_blacklisted: params.get('only_blacklisted') === 'true',
      minimum_reputation: minimumReputation
    },
    pagination: {page, limit, total_count: filteredPosts.length, total_pages: Math.max(Math.ceil(filteredPosts.length / limit), 1)},
    mode_counts: {unread: filteredPosts.length, read: 1, ignored: 2, deleted: 3, blacklisted: 4},
    posts: pagePosts,
    related_tags: [{name: 'haf', tag: 'haf', count: 24}, {name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png', count: 6}],
    related_authors: ['visible-author'],
    ignored_tags: ['spam'],
    poisoned_pill_tags: [],
    favorite_tags: ['haf'],
    past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}],
    counts: {read_posts: 1, ignored_tags: 1, poisoned_pill_tags: 0, muted_posts: 2, tags: 3}
  }
}

const renderApp = async ({waitForPreview = true} = {}) => {
  render(<App />)
  expect(await screen.findByText('Hyperion')).toBeInTheDocument()
  if (waitForPreview) {
    await waitFor(() => expect(screen.getByText('Preview 1')).toBeInTheDocument())
  }
}

describe('App', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="test-token">'
    currentPosts = posts
    detailResponses = new Map()
    detailFailures = new Set()
    revisionResponses = new Map()
    revisionFailures = new Set()
    hivesignerAvailable = false
    emptyTags = new Set()
    onlyFavoriteTagsEnabled = false
    sessionTheme = 'system'
    minimumReputation = 25
    hivewatchersBlacklistEnabled = false
    votingPowerPayload = {status: 'ready', value: 9730, percent: 97.3, fetched_at: '2026-06-01T12:00:00Z'}
    votingPowerFailure = false
    chainStatsPayload = {status: 'ready', votes: 2, replies: 2, payout: '1.234 HBD', current_vote: 10000}
    chainStatsResponses = new Map()
    window.confirm = vi.fn(() => true)
    window.alert = vi.fn()
    window.open = vi.fn()
    installLocalStorage()
    systemDarkMatches = false
    setMobileLayout(false)
    window.hive_keychain = {requestVote: vi.fn((_voter, _permlink, _author, _weight, callback) => callback({success: true}))}
    window.hive = {
      api: {
        getActiveVotes: vi.fn((_author, _permlink, callback) => callback(null, [{voter: 'fixture-curator', percent: 10000}, {voter: 'other-curator', percent: 5000}])),
        getContentReplies: vi.fn((_author, _permlink, callback) => callback(null, [{id: 1}, {id: 2}])),
        getContent: vi.fn((_author, _permlink, callback) => callback(null, {cashout_time: '2026-05-30T00:00:00', pending_payout_value: '1.234 HBD', total_payout_value: '0.000 HBD'}))
      }
    }

    global.fetch = vi.fn((url, options = {}) => {
      if (url === '/api/v1/session') {
        return jsonResponse({
          authenticated: true,
          account: {name: 'fixture-curator', avatar_url: 'avatar.png'},
          preferences: {muted_authors_enabled: false, only_favorite_tags: onlyFavoriteTagsEnabled, theme: sessionTheme, minimum_reputation: minimumReputation, hivewatchers_blacklist_enabled: hivewatchersBlacklistEnabled, hivesigner_available: hivesignerAvailable},
          blacklist_sources: [
            {account: 'fixture-curator', name: 'fixture-curator'},
            {account: 'hive.blog', name: 'hive.blog'}
          ],
          offchain_blacklist_sources: [
            {account: 'hivewatchers', name: 'Hivewatchers', enabled: hivewatchersBlacklistEnabled, description: 'Powered by the Spaminator active blacklist.'}
          ],
          counts: {read_posts: 1, ignored_tags: 1, poisoned_pill_tags: 0, favorite_tags: 1, past_tags: 1, muted_posts: 2, tags: 3},
          muted_authors: ['muted-author'],
          ignored_tags: ['spam'],
          poisoned_pill_tags: [],
          favorite_tags: ['haf'],
          past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}]
        })
      }

      if (url === '/api/v1/session/voting_power') {
        if (votingPowerFailure) return jsonResponse({status: 'unavailable', value: null, percent: null, fetched_at: '2026-06-01T12:00:00Z'})
        return jsonResponse(votingPowerPayload)
      }

      if (url.toString().startsWith('/api/v1/posts?')) return jsonResponse(postsPayload(new URLSearchParams(url.toString().split('?')[1])))

      const detailMatch = url.toString().match(/\/api\/v1\/posts\/(\d+)$/)
      if (detailMatch) {
        const id = Number(detailMatch[1])

        if (detailFailures.has(id)) {
          return jsonError({error: 'Preview failed'})
        }

        if (detailResponses.has(id)) {
          return detailResponses.get(id).promise.then((payload) => jsonResponse(payload))
        }

        return jsonResponse({
          id,
          title: posts.find((post) => post.id === id)?.title,
          body_html: `<p>Preview ${id}</p>`,
          urls: {
            canonical: `https://canonical.example/${id}`,
            hive_blog: `https://hive.blog/hive-13323/@visible-author/post-${id}`,
            peakd: `https://peakd.com/hive-13323/@visible-author/post-${id}`,
            hiveblocks: `https://hiveblocks.com/hive-13323/@visible-author/post-${id}`,
            hive_db: `https://hivehub.dev/hive-13323/@visible-author/post-${id}`,
            scribe: `http://scribe.hivekings.com/?url=post-${id}`
          }
        })
      }

      const revisionsMatch = url.toString().match(/\/api\/v1\/posts\/(\d+)\/revisions$/)
      if (revisionsMatch) {
        const id = Number(revisionsMatch[1])

        if (revisionFailures.has(id)) {
          return jsonError({error: 'Diff service is not configured.'}, 503)
        }

        if (revisionResponses.has(id)) {
          return revisionResponses.get(id).promise.then((payload) => jsonResponse(payload))
        }

        return jsonResponse({
          post_id: id,
          author: 'visible-author',
          permlink: 'post-1',
          title: 'First Post',
          revisions: [
            {index: 0, label: 'Revision 1', published_at: '2026-01-01T00:00:00', block_num: 10, body: 'shared line\nold source line', body_html: '<p>Old rendered body</p>'},
            {index: 1, label: 'Revision 2', published_at: '2026-01-02T00:00:00', block_num: 20, body: 'shared line\nmiddle source line', body_html: '<p>Middle rendered body</p>'},
            {index: 2, label: 'Revision 3', published_at: '2026-01-03T00:00:00', block_num: 30, body: 'shared line\ncurrent source line', body_html: '<p>Current rendered body</p>'}
          ]
        })
      }

      const chainStatsMatch = url.toString().match(/\/api\/v1\/posts\/(\d+)\/chain_stats(?:\?(.*))?$/)
      if (chainStatsMatch) {
        const id = Number(chainStatsMatch[1])
        if (chainStatsResponses.has(id)) {
          return chainStatsResponses.get(id).promise.then((payload) => jsonResponse(payload))
        }

        return jsonResponse(chainStatsPayload)
      }

      const payoutMatch = url.toString().match(/\/api\/v1\/posts\/(\d+)\/payout(?:\?(.*))?$/)
      if (payoutMatch) {
        return jsonResponse({status: 'ready', payout: '1.234 HBD'})
      }

      const readMatch = url.toString().match(/\/api\/v1\/posts\/(\d+)\/read$/)
      if (readMatch && options.method === 'PATCH') {
        return jsonResponse({id: Number(readMatch[1]), read: true, read_posts_count: 2})
      }

      if (url === '/api/v1/posts/read' && options.method === 'PATCH') {
        const body = JSON.parse(options.body)
        return jsonResponse({
          marked_count: body.all_matching ? currentPosts.length : body.post_ids.length,
          read_posts_count: currentPosts.length
        })
      }

      const ignoreMatch = url.toString().match(/\/api\/v1\/tags\/([^/]+)\/ignored$/)
      if (ignoreMatch && options.method === 'POST') {
        const tag = decodeURIComponent(ignoreMatch[1])
        return jsonResponse({ignored_tags: ['spam', tag], poisoned_pill_tags: [], favorite_tags: ['haf'], past_tags: [{name: tag, tag}]})
      }

      if (ignoreMatch && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], poisoned_pill_tags: [], favorite_tags: ['haf'], past_tags: [{name: 'haf', tag: 'haf'}]})
      }

      const poisonMatch = url.toString().match(/\/api\/v1\/tags\/([^/]+)\/poisoned_pill$/)
      if (poisonMatch && options.method === 'POST') {
        const tag = decodeURIComponent(poisonMatch[1])
        return jsonResponse({ignored_tags: ['spam'], poisoned_pill_tags: [tag], favorite_tags: ['haf'], past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}]})
      }

      if (poisonMatch && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], poisoned_pill_tags: [], favorite_tags: ['haf'], past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}]})
      }

      const favoriteMatch = url.toString().match(/\/api\/v1\/tags\/([^/]+)\/favorite$/)
      if (favoriteMatch && options.method === 'POST') {
        const tag = decodeURIComponent(favoriteMatch[1])
        return jsonResponse({ignored_tags: ['spam'], poisoned_pill_tags: [], favorite_tags: ['haf', tag], past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}]})
      }

      if (favoriteMatch && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], poisoned_pill_tags: [], favorite_tags: ['haf'], past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}]})
      }

      if (url === '/api/v1/preferences/mute' && options.method === 'PATCH') {
        return jsonResponse({muted_authors_enabled: JSON.parse(options.body).enabled})
      }

      if (url === '/api/v1/preferences/only_favorite_tags' && options.method === 'PATCH') {
        onlyFavoriteTagsEnabled = JSON.parse(options.body).enabled
        return jsonResponse({only_favorite_tags: onlyFavoriteTagsEnabled})
      }

      if (url === '/api/v1/preferences/theme' && options.method === 'PATCH') {
        const theme = JSON.parse(options.body).theme
        sessionTheme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system'
        return jsonResponse({theme: sessionTheme})
      }

      if (url === '/api/v1/preferences/minimum_reputation' && options.method === 'PATCH') {
        minimumReputation = Number(JSON.parse(options.body).minimum_reputation)
        return jsonResponse({minimum_reputation: minimumReputation})
      }

      if (url === '/api/v1/preferences/blacklists' && options.method === 'PATCH') {
        hivewatchersBlacklistEnabled = !!JSON.parse(options.body).hivewatchers_blacklist_enabled
        return jsonResponse({
          hivewatchers_blacklist_enabled: hivewatchersBlacklistEnabled,
          blacklist_sources: [
            {account: 'fixture-curator', name: 'fixture-curator'},
            {account: 'hive.blog', name: 'hive.blog'}
          ],
          offchain_blacklist_sources: [
            {account: 'hivewatchers', name: 'Hivewatchers', enabled: hivewatchersBlacklistEnabled, description: 'Powered by the Spaminator active blacklist.'}
          ]
        })
      }

      if (url === '/api/v1/past_tags?only_ignored=true' && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], poisoned_pill_tags: [], favorite_tags: ['haf'], past_tags: [{name: 'haf', tag: 'haf'}]})
      }

      if (url === '/api/v1/past_tags' && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], poisoned_pill_tags: [], favorite_tags: ['haf'], past_tags: []})
      }

      if (url === '/api/v1/ignored_tags' && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: [], poisoned_pill_tags: [], favorite_tags: ['haf'], past_tags: [{name: 'haf', tag: 'haf'}]})
      }

      throw new Error(`Unhandled fetch ${url}`)
    })
  })

  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
    window.localStorage?.clear?.()
    delete window.IntersectionObserver
    delete globalThis.IntersectionObserver
    vi.restoreAllMocks()
  })

  test('bootstraps session and renders posts from the API', async () => {
    await renderApp()

    await waitFor(() => expect(screen.getAllByText('First Post').length).toBeGreaterThan(0))
    expect(screen.getByText('Preview 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Legacy inbox'})).not.toBeInTheDocument()
  })

  test('displays current voting power beside the avatar', async () => {
    await renderApp()

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/session/voting_power', expect.anything()))
    expect(screen.getByText('VP 97.3%')).toBeInTheDocument()
    expect(screen.getByLabelText('Current voting power')).toHaveAttribute('title', 'Current voting power')
  })

  test('polls current voting power periodically', async () => {
    let poll
    const originalSetInterval = window.setInterval
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((callback, delay, ...args) => {
      if (delay === 60000) {
        poll = callback
        return 123
      }

      return originalSetInterval(callback, delay, ...args)
    })
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => {})

    await renderApp()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/session/voting_power', expect.anything()))
    await waitFor(() => expect(screen.getByText('VP 97.3%')).toBeInTheDocument())

    votingPowerPayload = {status: 'ready', value: 9840, percent: 98.4, fetched_at: '2026-06-01T12:01:00Z'}
    await act(async () => {
      poll()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(global.fetch.mock.calls.filter(([url]) => url === '/api/v1/session/voting_power')).toHaveLength(2)
    await waitFor(() => expect(screen.getByText('VP 98.4%')).toBeInTheDocument())
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000)

    cleanup()
    expect(clearIntervalSpy).toHaveBeenCalledWith(123)
  })

  test('keeps rendering when current voting power is unavailable', async () => {
    votingPowerFailure = true

    await renderApp()

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/session/voting_power', expect.anything()))
    expect(screen.getByText('VP --')).toBeInTheDocument()
    expect(screen.getByText('Preview 1')).toBeInTheDocument()
  })

  test('opens settings with Hive blacklist sources', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))

    expect(screen.getByRole('dialog', {name: 'Settings'})).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', {name: 'Minimum reputation'})).toHaveValue(25)
    expect(screen.getAllByText('fixture-curator').length).toBeGreaterThan(0)
    expect(screen.getByText('@hive.blog')).toBeInTheDocument()
    expect(screen.getByRole('link', {name: 'blacklist subscriptions'})).toHaveAttribute('href', 'https://hive.blog/@fixture-curator/lists/followed_blacklists')
    expect(screen.getByLabelText(/Hivewatchers/)).not.toBeChecked()
    expect(screen.getByText('Powered by the Spaminator active blacklist.')).toBeInTheDocument()
    expect(screen.getByRole('link', {name: 'Tag management'})).toHaveAttribute('href', '/tags')
    expect(screen.getByRole('link', {name: 'Legacy Inbox'})).toHaveAttribute('href', '/posts')

    fireEvent.click(screen.getByRole('button', {name: 'Close settings'}))
    expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument()
  })

  test('saves dark theme from the header selector', async () => {
    await renderApp()

    fireEvent.change(screen.getByRole('combobox', {name: 'Theme'}), {target: {value: 'dark'}})

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/theme', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({theme: 'dark'})
    })))
    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem('hyperion.theme')).toBe('dark')
  })

  test('saves light theme and removes dark class', async () => {
    window.localStorage.setItem('hyperion.theme', 'dark')
    document.documentElement.classList.add('dark')

    await renderApp()
    fireEvent.change(screen.getByRole('combobox', {name: 'Theme'}), {target: {value: 'light'}})

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/theme', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({theme: 'light'})
    })))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(window.localStorage.getItem('hyperion.theme')).toBe('light')
  })

  test('system theme follows color scheme changes', async () => {
    setSystemDark(true)

    await renderApp()

    expect(screen.getByRole('combobox', {name: 'Theme'})).toHaveValue('system')
    expect(document.documentElement).toHaveClass('dark')

    act(() => setSystemDark(false))

    expect(document.documentElement).not.toHaveClass('dark')
  })

  test('dismisses settings with Escape and click-away', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))
    expect(screen.getByRole('dialog', {name: 'Settings'})).toBeInTheDocument()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))
    const dialog = screen.getByRole('dialog', {name: 'Settings'})
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument()
  })

  test('settings no longer saves local blacklist toggles', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))
    fireEvent.click(screen.getByRole('button', {name: 'Close'}))

    expect(global.fetch).not.toHaveBeenCalledWith('/api/v1/preferences/blacklists', expect.anything())
    expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument()
  })

  test('saves minimum reputation from settings and refreshes posts', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))
    fireEvent.change(screen.getByRole('spinbutton', {name: 'Minimum reputation'}), {target: {value: '35'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/minimum_reputation', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({minimum_reputation: '35'})
    })))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/blacklists', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({hivewatchers_blacklist_enabled: false})
    })))
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument())
    expect(global.fetch.mock.calls.filter(([url]) => url.toString().startsWith('/api/v1/posts?')).length).toBeGreaterThan(1)
  })

  test('saves Hivewatchers off-chain blacklist preference from settings', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))
    fireEvent.click(screen.getByLabelText(/Hivewatchers/))
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/blacklists', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({hivewatchers_blacklist_enabled: true})
    })))
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument())
  })

  test('resizes the desktop list and post view with a drag handle', async () => {
    await renderApp()

    const main = screen.getByRole('main')
    main.getBoundingClientRect = () => ({left: 0, right: 1000, width: 1000, top: 0, bottom: 800, height: 800, x: 0, y: 0, toJSON: () => {}})

    const handle = screen.getByRole('separator', {name: 'Resize list and post view'})
    expect(main.style.getPropertyValue('--desktop-preview-width')).toBe('65%')

    pointerEvent('pointerdown', handle, {button: 0, clientX: 700})
    expect(main.style.getPropertyValue('--desktop-preview-width')).toBe('30%')
    expect(window.localStorage.getItem('hyperion.desktopPreviewPercent')).toBe('30')

    pointerEvent('pointermove', window, {clientX: 100})
    expect(main.style.getPropertyValue('--desktop-preview-width')).toBe('65%')

    pointerEvent('pointerup', window)
  })

  test('uses a persisted desktop preview width', async () => {
    window.localStorage.setItem('hyperion.desktopPreviewPercent', '45')

    await renderApp()

    expect(screen.getByRole('main').style.getPropertyValue('--desktop-preview-width')).toBe('45%')
  })

  test('uses compact desktop mode selector at the default preview width', async () => {
    await renderApp()

    expect(screen.getByRole('combobox', {name: 'View mode'})).toHaveValue('unread')
    expect(screen.queryByRole('button', {name: /Unread/})).not.toBeInTheDocument()
  })

  test('expands desktop mode selector when the preview is resized smaller', async () => {
    window.localStorage.setItem('hyperion.desktopPreviewPercent', '45')

    await renderApp()

    expect(screen.getByRole('button', {name: /Unread/})).toHaveTextContent('3')
    expect(screen.queryByRole('combobox', {name: 'View mode'})).not.toBeInTheDocument()
  })

  test('switches desktop mode selector from compact to expanded while resizing', async () => {
    await renderApp()

    const main = screen.getByRole('main')
    main.getBoundingClientRect = () => ({left: 0, right: 1000, width: 1000, top: 0, bottom: 800, height: 800, x: 0, y: 0, toJSON: () => {}})

    expect(screen.getByRole('combobox', {name: 'View mode'})).toHaveValue('unread')

    pointerEvent('pointerdown', screen.getByRole('separator', {name: 'Resize list and post view'}), {button: 0, clientX: 550})

    expect(screen.getByRole('button', {name: /Unread/})).toHaveTextContent('3')

    pointerEvent('pointerup', window)
  })

  test('ignores invalid persisted desktop preview widths', async () => {
    window.localStorage.setItem('hyperion.desktopPreviewPercent', '90')

    await renderApp()

    expect(screen.getByRole('main').style.getPropertyValue('--desktop-preview-width')).toBe('65%')
  })

  test('does not expose the desktop resize handle in mobile layout', async () => {
    setMobileLayout(true)

    await renderApp()

    expect(screen.queryByRole('separator', {name: 'Resize list and post view'})).not.toBeInTheDocument()
  })

  test('uses post thumbnails before falling back to author avatars and placeholders', async () => {
    await renderApp()

    const firstThumbnail = screen.getByTestId('post-thumbnail-1')
    expect(firstThumbnail).toHaveAttribute('src', proxiedImage('https://example.com/first-post.jpg'))

    const middleThumbnail = screen.getByTestId('post-thumbnail-2')
    expect(middleThumbnail).toHaveAttribute('src', proxiedImage('https://images.hive.blog/u/middle-author/avatar', '0x96'))

    fireEvent.error(middleThumbnail)
    expect(middleThumbnail).toHaveAttribute('src', 'data:image/gif;base64,R0lGODdhAQABAAAAACw=')
  })

  test('loads additional pages into the current post list', async () => {
    currentPosts = [...posts, ...Array.from({length: 28}, (_item, index) => makePost(index + 4))]
    await renderApp()

    expect(screen.getByText('31 unread posts · 30 loaded')).toBeInTheDocument()
    expect(screen.queryByText('Post 31')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object)))
    await waitFor(() => expect(screen.getByText('Post 31')).toBeInTheDocument())
    expect(screen.getByText('31 unread posts')).toBeInTheDocument()
    expect(screen.getByText('All loaded')).toBeInTheDocument()
  })

  test('resets appended pages when the query changes', async () => {
    currentPosts = [...posts, ...Array.from({length: 28}, (_item, index) => makePost(index + 4))]
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))
    await waitFor(() => expect(screen.getByText('Post 31')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', {name: 'Focus tag curation'}))

    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('tag=curation'), expect.any(Object)))
    expect(global.fetch).toHaveBeenLastCalledWith(expect.not.stringContaining('page=2'), expect.any(Object))
    await waitFor(() => expect(screen.queryByText('Post 31')).not.toBeInTheDocument())
    expect(screen.getByText('31 unread posts · 30 loaded')).toBeInTheDocument()
  })

  test('selects loaded posts before offering all matching posts', async () => {
    currentPosts = [...posts, ...Array.from({length: 28}, (_item, index) => makePost(index + 4))]
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Select loaded posts'}))

    expect(screen.getByText('30 selected.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Select all 31 posts in this filter.'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Mark selected read/})).toHaveTextContent('30')

    fireEvent.click(screen.getByRole('button', {name: 'Select all 31 posts in this filter.'}))

    expect(screen.getByText('All 31 posts in this filter selected.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Mark selected read/})).toHaveTextContent('31')
  })

  test('marks all matching posts read with the current query instead of loaded ids', async () => {
    currentPosts = [...posts, ...Array.from({length: 28}, (_item, index) => makePost(index + 4))]
    await renderApp()

    fireEvent.change(screen.getByPlaceholderText('photography @author app:peakd -contests'), {target: {value: 'haf'}})
    fireEvent.click(screen.getByRole('button', {name: 'Search'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: 'Select loaded posts'}))
    fireEvent.click(screen.getByRole('button', {name: 'Select all 31 posts in this filter.'}))
    fireEvent.click(screen.getByRole('button', {name: /Mark selected read/}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/read', expect.objectContaining({method: 'PATCH'})))
    const bulkCall = global.fetch.mock.calls.find(([url]) => url === '/api/v1/posts/read')
    const body = JSON.parse(bulkCall[1].body)
    expect(body).toEqual(expect.objectContaining({all_matching: true, query: expect.objectContaining({tag: 'haf'})}))
    expect(body).not.toHaveProperty('post_ids')
  })

  test('query changes clear all matching selection', async () => {
    currentPosts = [...posts, ...Array.from({length: 28}, (_item, index) => makePost(index + 4))]
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Select loaded posts'}))
    fireEvent.click(screen.getByRole('button', {name: 'Select all 31 posts in this filter.'}))
    fireEvent.click(screen.getByRole('button', {name: 'Focus tag curation'}))

    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('tag=curation'), expect.any(Object)))
    expect(screen.getByText('Select loaded posts for bulk actions.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Mark selected read'})).toBeDisabled()
  })

  test('row toggles leave all matching mode for loaded row selection', async () => {
    currentPosts = [...posts, ...Array.from({length: 28}, (_item, index) => makePost(index + 4))]
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Select loaded posts'}))
    fireEvent.click(screen.getByRole('button', {name: 'Select all 31 posts in this filter.'}))
    fireEvent.click(screen.getByRole('button', {name: 'Deselect First Post'}))

    expect(screen.queryByText('All 31 posts in this filter selected.')).not.toBeInTheDocument()
    expect(screen.getByText('29 selected.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Select First Post'})).toHaveAttribute('aria-pressed', 'false')
  })

  test('renders preview chain stats and external links', async () => {
    await renderApp()

    await waitFor(() => expect(screen.getByText('Votes: 2')).toBeInTheDocument())
    expect(screen.getByText('Replies: 2')).toBeInTheDocument()
    expect(screen.getAllByText('1.234 HBD').length).toBeGreaterThan(1)
    expect(screen.getByRole('link', {name: /canonical.example/i})).toHaveAttribute('href', 'https://canonical.example/1')
    expect(screen.queryByRole('link', {name: /^Canonical$/i})).not.toBeInTheDocument()
    expect(screen.getByRole('link', {name: /hive.blog/i})).toHaveAttribute('href', 'https://hive.blog/hive-13323/@visible-author/post-1')
    expect(screen.getByRole('link', {name: /hivehub.dev/i})).toHaveAttribute('href', 'https://hivehub.dev/hive-13323/@visible-author/post-1')
    expect(screen.getByRole('button', {name: /Diff/i})).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: /scribe/i})).not.toBeInTheDocument()
  })

  test('loads chain stats for the preview without fanning out across list rows', async () => {
    await renderApp()

    await waitFor(() => expect(screen.getByText('Votes: 2')).toBeInTheDocument())
    expect(global.fetch.mock.calls.filter(([url]) => url.toString().includes('/chain_stats')).map(([url]) => url)).toEqual([
      '/api/v1/posts/1/chain_stats?author=visible-author&permlink=first-post'
    ])
    expect(global.fetch.mock.calls.filter(([url]) => url.toString().includes('/payout')).map(([url]) => url)).toEqual([
      '/api/v1/posts/1/payout?author=visible-author&permlink=first-post',
      '/api/v1/posts/2/payout?author=middle-author&permlink=middle-post',
      '/api/v1/posts/3/payout?author=last-author&permlink=last-post'
    ])
  })

  test('loads preview body before requesting preview chain stats', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)

    await renderApp({waitForPreview: false})
    await waitFor(() => expect(screen.getAllByText('First Post').length).toBeGreaterThan(0))

    expect(global.fetch.mock.calls.filter(([url]) => url.toString().includes('/chain_stats'))).toEqual([])

    detail.resolve({
      id: 1,
      title: 'First Post',
      body_html: '<p>Body first</p>',
      urls: {}
    })

    expect(await screen.findByText('Body first')).toBeInTheDocument()
    await waitFor(() => expect(global.fetch.mock.calls.filter(([url]) => url.toString().includes('/chain_stats')).map(([url]) => url)).toEqual([
      '/api/v1/posts/1/chain_stats?author=visible-author&permlink=first-post'
    ]))
  })

  test('ignores stale preview chain stats after selection changes without aborting the request', async () => {
    const firstStats = deferred()
    chainStatsResponses.set(1, firstStats)

    await renderApp()
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.toString().includes('/api/v1/posts/1/chain_stats'))).toBe(true))

    fireEvent.keyDown(document, {key: 'j'})
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Votes: 2')).toBeInTheDocument())

    firstStats.resolve({status: 'ready', votes: 99, replies: 99, payout: '99.999 HBD', current_vote: null})

    await waitFor(() => expect(screen.queryByText('Votes: 99')).not.toBeInTheDocument())
    expect(screen.queryByText('99.999 HBD')).not.toBeInTheDocument()
  })

  test('lazy-loads list payout and thumbnails only after they intersect the viewport', async () => {
    const visibility = installIntersectionObserverMock()

    await renderApp()

    const payoutUrls = () => global.fetch.mock.calls.filter(([url]) => url.toString().includes('/payout')).map(([url]) => url)
    const firstPayout = screen.getByTestId('post-payout-1')
    const secondPayout = screen.getByTestId('post-payout-2')
    const firstThumbnail = screen.getByTestId('post-thumbnail-1')
    const secondThumbnail = screen.getByTestId('post-thumbnail-2')

    await waitFor(() => expect(screen.getByText('Votes: 2')).toBeInTheDocument())
    expect(payoutUrls()).toEqual([])
    expect(firstPayout).toHaveTextContent('...')
    expect(firstThumbnail).not.toHaveAttribute('src')
    expect(secondThumbnail).not.toHaveAttribute('src')
    expect(visibility.observers.every((observer) => observer.options.root === null && observer.options.rootMargin === '0px')).toBe(true)

    visibility.trigger(firstPayout)
    await waitFor(() => expect(payoutUrls()).toEqual(['/api/v1/posts/1/payout?author=visible-author&permlink=first-post']))
    await waitFor(() => expect(firstPayout).toHaveTextContent('1.234 HBD'))
    expect(secondPayout).toHaveTextContent('...')

    visibility.trigger(firstThumbnail)
    expect(firstThumbnail).toHaveAttribute('src', proxiedImage('https://example.com/first-post.jpg'))
    expect(secondThumbnail).not.toHaveAttribute('src')

    visibility.trigger(secondThumbnail)
    expect(secondThumbnail).toHaveAttribute('src', proxiedImage('https://images.hive.blog/u/middle-author/avatar', '0x96'))

    fireEvent.error(secondThumbnail)
    expect(secondThumbnail).toHaveAttribute('src', 'data:image/gif;base64,R0lGODdhAQABAAAAACw=')
  })

  test('uses Bootstrap-style post list columns with expandable tags', async () => {
    await renderApp()

    const row = document.querySelector('[data-post-list-row="1"]')
    expect(row).toHaveClass('post-list-row')
    expect(within(row).getByRole('button', {name: 'Select First Post'})).toBeInTheDocument()
    expect(within(row).getByText('1.234 HBD')).toBeInTheDocument()
    expect(within(row).getByText('1.234 HBD').closest('.post-row-payout')).toBeInTheDocument()
    expect(within(row).getByTestId('post-thumbnail-1')).toHaveClass('post-row-thumbnail')
    expect(within(row).getAllByRole('button', {name: 'Focus author @visible-author'}).length).toBeGreaterThan(0)

    const tagsColumn = within(row).getByTestId('post-tags-1')
    expect(tagsColumn).toHaveClass('post-row-tags')
    expect(within(tagsColumn).getByRole('button', {name: 'Focus tag hive-13323'})).toHaveTextContent('Hive')
    expect(within(tagsColumn).getByRole('button', {name: 'Expand tags for First Post'})).toHaveAttribute('aria-expanded', 'false')
    expect(within(tagsColumn).queryByRole('button', {name: 'Focus tag hive-19999'})).not.toBeInTheDocument()
    fireEvent.click(within(tagsColumn).getByRole('button', {name: 'Expand tags for First Post'}))

    expect(within(tagsColumn).getByRole('button', {name: 'Collapse tags for First Post'})).toHaveAttribute('aria-expanded', 'true')
    expect(within(tagsColumn).getByRole('button', {name: 'Focus tag hive-19999'})).toHaveTextContent('Side Community')
    expect(within(tagsColumn).getByRole('button', {name: 'Focus tag haf'})).toHaveTextContent('haf')
  })

  test('opens a rendered revision diff modal', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: /Diff/i}))

    const dialog = await screen.findByRole('dialog', {name: 'Revision diff'})
    expect(within(dialog).getByText('-middle source line')).toBeInTheDocument()
    expect(within(dialog).getByText('+current source line')).toBeInTheDocument()
    expect(within(dialog).queryByText('-old source line')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Current rendered body')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', {name: 'Revision pair'})).toHaveValue('1')

    fireEvent.change(within(dialog).getByRole('combobox', {name: 'Revision pair'}), {target: {value: '0'}})

    expect(within(dialog).getByText('-old source line')).toBeInTheDocument()
    expect(within(dialog).getByText('+middle source line')).toBeInTheDocument()
    expect(within(dialog).queryByText('+current source line')).not.toBeInTheDocument()
  })

  test('dismisses the revision diff modal with Escape and click-away', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: /Diff/i}))
    expect(await screen.findByRole('dialog', {name: 'Revision diff'})).toBeInTheDocument()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('dialog', {name: 'Revision diff'})).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: /Diff/i}))
    const dialog = await screen.findByRole('dialog', {name: 'Revision diff'})
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog', {name: 'Revision diff'})).not.toBeInTheDocument()
  })

  test('shows revision diff errors', async () => {
    revisionFailures.add(1)
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: /Diff/i}))

    const dialog = await screen.findByRole('dialog', {name: 'Revision diff'})
    expect(within(dialog).getByText('Diff service is not configured.')).toBeInTheDocument()
  })

  test('hides canonical links when the host is already shown', async () => {
    detailResponses.set(1, {
      promise: Promise.resolve({
        id: 1,
        title: 'First Post',
        body_html: '<p>Preview 1</p>',
        urls: {
          canonical: 'https://www.hive.blog/hive-13323/@visible-author/first-post',
          hive_blog: 'https://hive.blog/hive-13323/@visible-author/first-post',
          peakd: 'https://peakd.com/hive-13323/@visible-author/first-post'
        }
      })
    })

    await renderApp()

    const hiveBlogLinks = screen.getAllByRole('link', {name: /hive.blog/i})
    expect(hiveBlogLinks).toHaveLength(1)
    expect(hiveBlogLinks[0]).toHaveAttribute('href', 'https://hive.blog/hive-13323/@visible-author/first-post')
  })

  test('hides canonical peakd links when peakd is already shown', async () => {
    detailResponses.set(1, {
      promise: Promise.resolve({
        id: 1,
        title: 'First Post',
        body_html: '<p>Preview 1</p>',
        urls: {
          canonical: 'https://peakd.com/hive-13323/@visible-author/first-post',
          hive_blog: 'https://hive.blog/hive-13323/@visible-author/first-post',
          peakd: 'https://peakd.com/hive-13323/@visible-author/first-post'
        }
      })
    })

    await renderApp()

    const peakdLinks = screen.getAllByRole('link', {name: /peakd/i})
    expect(peakdLinks).toHaveLength(1)
    expect(peakdLinks[0]).toHaveTextContent('peakd')
  })

  test('renders blacklist reasons in the preview header', async () => {
    currentPosts = [
      {
        ...posts[0],
        blacklisted: true,
        blacklist_reasons: [{account: 'fixture-curator', name: 'fixture-curator'}, {account: 'hive.blog', name: 'hive.blog'}]
      }
    ]

    await renderApp()

    expect(screen.getByText('Blacklisted: author appears on fixture-curator, hive.blog.')).toBeInTheDocument()
  })

  test('uses referenced display post details in the preview', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'Original Post',
      body_html: '<p>Original body</p>',
      display_post: {
        author: 'original-author',
        permlink: 'original-post',
        title: 'Original Post',
        category: 'hive-13323',
        category_name: 'Hive',
        category_image_url: 'https://example.com/hive-community.png',
        app: 'peakd',
        canonical_url: 'https://hive.blog/hive-13323/@original-author/original-post'
      },
      urls: {
        canonical: 'https://hive.blog/hive-13323/@original-author/original-post',
        hive_blog: 'https://hive.blog/hive-13323/@original-author/original-post'
      }
    })

    await renderApp({waitForPreview: false})

    expect(await screen.findByRole('heading', {name: 'Original Post'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Focus author @original-author'})).toBeInTheDocument()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/1/chain_stats?author=original-author&permlink=original-post', expect.objectContaining({credentials: 'same-origin'})))
  })

  test('casts keychain upvotes with the selected weight', async () => {
    await renderApp()

    fireEvent.click(await screen.findByText('Votes: 2'))
    fireEvent.change(screen.getByRole('slider'), {target: {value: '42'}})
    fireEvent.click(screen.getByRole('button', {name: 'Vote'}))

    expect(window.hive_keychain.requestVote).toHaveBeenCalledWith('fixture-curator', 'first-post', 'visible-author', 4200, expect.any(Function))
  })

  test('retries preview stats after keychain vote until the vote appears', async () => {
    await renderApp()
    await waitFor(() => expect(screen.getByText('Votes: 2')).toBeInTheDocument())
    vi.useFakeTimers()

    chainStatsPayload = {status: 'ready', votes: 2, replies: 2, payout: '1.234 HBD', current_vote: 0}
    fireEvent.click(screen.getByText('Votes: 2'))
    fireEvent.change(screen.getByRole('slider'), {target: {value: '42'}})
    fireEvent.click(screen.getByRole('button', {name: 'Vote'}))

    act(() => vi.advanceTimersByTime(2500))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    chainStatsPayload = {status: 'ready', votes: 3, replies: 2, payout: '2.000 HBD', current_vote: 4200}
    act(() => vi.advanceTimersByTime(7000))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Votes: 3')).toBeInTheDocument()
    expect(screen.getByText('2.000 HBD')).toBeInTheDocument()
    expect(screen.getByText('Preview 1')).toBeInTheDocument()
    vi.useRealTimers()
  })

  test('casts hivesigner downvotes in a signing modal', async () => {
    hivesignerAvailable = true
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: /Downvote/}))
    fireEvent.change(screen.getByRole('slider'), {target: {value: '17'}})
    fireEvent.click(screen.getByRole('button', {name: 'Vote'}))

    const dialog = screen.getByRole('dialog', {name: 'Hivesigner vote'})
    const expectedUrl = 'https://hivesigner.com/sign/vote?authority=post&voter=fixture-curator&author=visible-author&permlink=first-post&weight=-1700'
    expect(within(dialog).getByTitle('Hivesigner vote')).toHaveAttribute('src', expectedUrl)
    expect(within(dialog).getByRole('link', {name: /Open/})).toHaveAttribute('href', expectedUrl)
    expect(window.open).not.toHaveBeenCalled()
  })

  test('closing the hivesigner vote modal refreshes stats', async () => {
    hivesignerAvailable = true
    await renderApp()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', {name: /Downvote/}))
    fireEvent.click(screen.getByRole('button', {name: 'Vote'}))
    fireEvent.click(screen.getByRole('button', {name: 'Close Hivesigner vote'}))

    expect(screen.queryByRole('dialog', {name: 'Hivesigner vote'})).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(global.fetch.mock.calls.filter(([url]) => url.toString().startsWith('/api/v1/posts/1/chain_stats')).length).toBeGreaterThanOrEqual(2)
    vi.useRealTimers()
  })

  test('dismisses the hivesigner vote modal with Escape and click-away', async () => {
    hivesignerAvailable = true
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: /Downvote/}))
    fireEvent.click(screen.getByRole('button', {name: 'Vote'}))
    expect(screen.getByRole('dialog', {name: 'Hivesigner vote'})).toBeInTheDocument()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('dialog', {name: 'Hivesigner vote'})).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: /Downvote/}))
    fireEvent.click(screen.getByRole('button', {name: 'Vote'}))
    const dialog = screen.getByRole('dialog', {name: 'Hivesigner vote'})
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog', {name: 'Hivesigner vote'})).not.toBeInTheDocument()
  })

  test('clears past and ignored tag groups', async () => {
    currentPosts = []
    await renderApp({waitForPreview: false})
    await waitFor(() => expect(screen.getByText('All caught up for this view.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    fireEvent.click(screen.getByRole('button', {name: /All past/}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/past_tags', expect.objectContaining({method: 'DELETE'})))

    fireEvent.click(screen.getByRole('button', {name: 'Clear ignored tags'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/ignored_tags', expect.objectContaining({method: 'DELETE'})))
  })

  test('submits the compact query field with the existing tag pattern syntax', async () => {
    await renderApp()

    fireEvent.change(screen.getByPlaceholderText('photography @author app:peakd -contests'), {target: {value: 'photography @author app:peakd -contests'}})
    fireEvent.click(screen.getByRole('button', {name: 'Search'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('tag=photography+app%3Apeakd+-contests'),
      expect.any(Object)
    ))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('author=author'),
      expect.any(Object)
    ))
  })

  test('supports the Hyperion Goes Live tag discovery and favorites workflow', async () => {
    await renderApp()

    fireEvent.change(screen.getByPlaceholderText('photography @author app:peakd -contests'), {target: {value: 'haf'}})
    fireEvent.click(screen.getByRole('button', {name: 'Search'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
    expect(screen.getByPlaceholderText('photography @author app:peakd -contests')).toHaveValue('haf')

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    let relatedSection = screen.getByRole('heading', {name: 'Related Tags'}).closest('section')
    fireEvent.click(within(relatedSection).getByRole('button', {name: 'Hive'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf%2Bhive-13323'), expect.any(Object)))
    expect(screen.getByPlaceholderText('photography @author app:peakd -contests')).toHaveValue('haf+hive-13323')

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    expect(within(relatedSection).queryByTitle('Poison tag')).not.toBeInTheDocument()

    const poisonSection = screen.getByRole('heading', {name: 'Poisoned Pill'}).closest('section')
    expect(within(poisonSection).getByText('No poisoned-pill tags.')).toBeInTheDocument()
    expect(within(poisonSection).getByText('Tip: Setting a tag as poison will ignore all posts by authors that have used a poisoned tag (until they stop).')).toBeInTheDocument()
    fireEvent.click(within(poisonSection).getByRole('button', {name: 'Set Hive as Poison'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/tags/hive-13323/poisoned_pill', expect.objectContaining({method: 'POST'})))
    await waitFor(() => expect(within(poisonSection).getByRole('button', {name: 'Remove poisoned pill hive-13323'})).toBeInTheDocument())
    expect(within(poisonSection).getByRole('button', {name: 'Hive'})).toBeInTheDocument()

    const pastSection = screen.getByRole('heading', {name: 'Past'}).closest('section')
    expect(within(pastSection).queryByTitle('Poison tag')).not.toBeInTheDocument()

    fireEvent.click(within(pastSection).getByTitle('Favorite tag'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/tags/hive-13323/favorite', expect.objectContaining({method: 'POST'})))
    await waitFor(() => expect(within(pastSection).getByTitle('Remove favorite')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', {name: 'Favorites'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/only_favorite_tags', expect.objectContaining({method: 'PATCH'})))
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('tag=haf%2Bhive-13323'), expect.any(Object)))
    expect(screen.getByRole('button', {name: 'Favorites'})).toHaveAttribute('aria-pressed', 'true')
  })

  test('focuses the query from a post list tag without changing the preview selection', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Focus tag curation'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=curation'), expect.any(Object)))
    expect(screen.getByText('Preview 1')).toBeInTheDocument()
  })

  test('focuses the query from a post list author without changing the tag filter', async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus author @visible-author'})[0])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('author=visible-author'), expect.any(Object)))
    expect(screen.getByPlaceholderText('photography @author app:peakd -contests')).toHaveValue('@visible-author')
    expect(screen.getByText('Preview 1')).toBeInTheDocument()
  })

  test('expands known community tag labels while preserving the raw tag query', async () => {
    await renderApp()

    expect(screen.getAllByRole('button', {name: 'Focus tag hive-13323'})[0]).toHaveTextContent('Hive')
    expect(screen.getAllByRole('button', {name: 'Focus tag hive-19999'})[0]).toHaveTextContent('Side Community')
    expect(screen.getAllByTestId('community-profile-image')[0]).toHaveAttribute('src', proxiedImage('https://example.com/hive-community.png', '0x32'))

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus tag hive-19999'})[0])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=hive-19999'), expect.any(Object)))
  })

  test('focuses the query from a category tag without expanding the tag control', async () => {
    await renderApp()

    const tagsColumn = within(document.querySelector('[data-post-list-row="1"]')).getByTestId('post-tags-1')
    fireEvent.click(within(tagsColumn).getByRole('button', {name: 'Focus tag hive-13323'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=hive-13323'), expect.any(Object)))
    expect(within(tagsColumn).getByRole('button', {name: 'Expand tags for First Post'})).toHaveAttribute('aria-expanded', 'false')
  })

  test('focuses the query from a preview tag', async () => {
    await renderApp()

    const previewTags = screen.getByTestId('preview-tags-1')
    fireEvent.click(within(previewTags).getByRole('button', {name: 'Expand tags for preview First Post'}))
    fireEvent.click(within(previewTags).getByRole('button', {name: 'Focus tag haf'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
  })

  test('focuses the query from a preview author', async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus author @visible-author'})[1])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('author=visible-author'), expect.any(Object)))
    expect(screen.getByPlaceholderText('photography @author app:peakd -contests')).toHaveValue('@visible-author')
  })

  test('clears an active author query back to all authors', async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus author @visible-author'})[0])
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('author=visible-author'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: 'Reset'}))

    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.not.stringContaining('author='), expect.any(Object)))
    expect(screen.getByPlaceholderText('photography @author app:peakd -contests')).toHaveValue('')
  })

  test('clears an active tag query back to all tags', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Focus tag curation'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=curation'), expect.any(Object)))
    expect(screen.getByPlaceholderText('photography @author app:peakd -contests')).toHaveValue('curation')

    fireEvent.click(screen.getByRole('button', {name: 'Reset'}))

    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.not.stringContaining('tag='), expect.any(Object)))
    expect(screen.getByPlaceholderText('photography @author app:peakd -contests')).toHaveValue('')
  })

  test('updates sort and mutually exclusive desktop mode selector', async () => {
    window.localStorage.setItem('hyperion.desktopPreviewPercent', '45')

    await renderApp()

    fireEvent.change(screen.getByLabelText('Sort posts'), {target: {value: 'oldest'}})
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sort=oldest'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: /Read/}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('only_read=true'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: /Ignored/}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('only_ignored=true'), expect.any(Object)))
    expect(global.fetch).toHaveBeenLastCalledWith(expect.not.stringContaining('only_read=true'), expect.any(Object))
  })

  test('shows mode counts on desktop mode selector', async () => {
    window.localStorage.setItem('hyperion.desktopPreviewPercent', '45')

    await renderApp()

    expect(screen.getByRole('button', {name: /Unread/})).toHaveTextContent('3')
    expect(screen.getByRole('button', {name: /Read/})).toHaveTextContent('1')
    expect(screen.getByRole('button', {name: /Ignored/})).toHaveTextContent('2')
    expect(screen.getByRole('button', {name: /Deleted/})).toHaveTextContent('3')
    expect(screen.getByRole('button', {name: /Blacklisted/})).toHaveTextContent('4')
  })

  test('uses compact mobile mode dropdown', async () => {
    setMobileLayout(true)

    await renderApp()

    const selector = screen.getByRole('combobox', {name: 'View mode'})
    expect(selector).toHaveValue('unread')
    expect(within(selector).getByRole('option', {name: 'Unread (3)'})).toBeInTheDocument()
    expect(within(selector).getByRole('option', {name: 'Blacklisted (4)'})).toBeInTheDocument()

    fireEvent.change(selector, {target: {value: 'only_blacklisted'}})
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('only_blacklisted=true'), expect.any(Object)))
  })

  test('keeps preference chips and action row behavior wired to existing APIs', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Mute'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/mute', expect.objectContaining({method: 'PATCH'})))

    fireEvent.click(screen.getByRole('button', {name: 'Favorites'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/only_favorite_tags', expect.objectContaining({method: 'PATCH'})))
  })

  test('enables tag ignore actions when the query has an active tag', async () => {
    await renderApp()

    fireEvent.change(screen.getByPlaceholderText('photography @author app:peakd -contests'), {target: {value: 'haf'}})
    fireEvent.click(screen.getByRole('button', {name: 'Search'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
    await waitFor(() => expect(screen.getByRole('button', {name: 'Ignore tag'})).toBeEnabled())

    fireEvent.click(screen.getByRole('button', {name: 'Ignore tag'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/tags/haf/ignored', expect.objectContaining({method: 'POST'})))
  })

  test('uses row checkboxes for bulk selection instead of read toggles', async () => {
    await renderApp()

    const markSelected = screen.getByRole('button', {name: 'Mark selected read'})
    expect(markSelected).toBeDisabled()

    fireEvent.click(screen.getByRole('button', {name: 'Select Middle Post'}))

    expect(screen.getByRole('button', {name: 'Deselect Middle Post'})).toHaveAttribute('aria-pressed', 'true')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/v1/posts/2/read', expect.any(Object))
    expect(screen.getByText('Preview 1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Middle Post'))
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())
  })

  test('marks only selected rows read and removes them from the unread list', async () => {
    window.localStorage.setItem('hyperion.desktopPreviewPercent', '45')
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Select First Post'}))
    fireEvent.click(screen.getByRole('button', {name: 'Select Last Post'}))
    fireEvent.click(screen.getByRole('button', {name: /Mark selected read/}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/read', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({post_ids: [1, 3]})
    })))

    await waitFor(() => expect(screen.queryByText('First Post')).not.toBeInTheDocument())
    expect(screen.queryByText('Last Post')).not.toBeInTheDocument()
    expect(screen.getAllByText('Middle Post').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', {name: 'Mark selected read'})).toBeDisabled()
    expect(screen.getByText('1 unread posts')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Unread/})).toHaveTextContent('1')
    expect(screen.getByRole('button', {name: /Read/})).toHaveTextContent('3')
  })

  test('keeps selected rows visible when marking read in read mode', async () => {
    await renderApp()

    fireEvent.change(screen.getByRole('combobox', {name: 'View mode'}), {target: {value: 'only_read'}})
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('only_read=true'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: 'Select First Post'}))
    fireEvent.click(screen.getByRole('button', {name: /Mark selected read/}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/read', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({post_ids: [1]})
    })))
    expect(screen.getAllByText('First Post').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', {name: 'Mark selected read'})).toBeDisabled()
  })

  test('moves selection with j/down and k/up shortcuts', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    await renderApp()

    fireEvent.keyDown(document, {key: 'j'})
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({block: 'center'}))

    fireEvent.keyDown(document, {key: 'ArrowDown'})
    await waitFor(() => expect(screen.getByText('Preview 3')).toBeInTheDocument())

    fireEvent.keyDown(document, {key: 'k'})
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())

    fireEvent.keyDown(document, {key: 'ArrowUp'})
    await waitFor(() => expect(screen.getByText('Preview 1')).toBeInTheDocument())
  })

  test('ignores global shortcuts while the query input is focused', async () => {
    await renderApp()

    fireEvent.keyDown(screen.getByPlaceholderText('photography @author app:peakd -contests'), {key: 'j'})

    expect(screen.getByText('Preview 1')).toBeInTheDocument()
  })

  test('marks selected post read and moves forward or backward', async () => {
    await renderApp()

    fireEvent.keyDown(document, {key: 'j'})
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())

    fireEvent.keyDown(document, {key: '>'})
    await waitFor(() => expect(screen.getByText('Preview 3')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/2/read', expect.objectContaining({method: 'PATCH'}))

    fireEvent.keyDown(document, {key: '<'})
    await waitFor(() => expect(screen.getByText('Preview 1')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/3/read', expect.objectContaining({method: 'PATCH'}))
  })

  test('marks the preview post read and moves to the next post from the preview button', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Mark read + next'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/1/read', expect.objectContaining({method: 'PATCH'})))
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())
    expect(screen.queryByText('First Post')).not.toBeInTheDocument()
  })

  test('mark read next keeps read-mode rows visible while moving forward', async () => {
    await renderApp()

    fireEvent.change(screen.getByRole('combobox', {name: 'View mode'}), {target: {value: 'only_read'}})
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('only_read=true'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: 'Mark read + next'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/1/read', expect.objectContaining({method: 'PATCH'})))
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())
    expect(screen.getAllByText('First Post').length).toBeGreaterThan(0)
  })

  test('toggles preview focus with enter and escape', async () => {
    await renderApp()

    expect(screen.getByText('Preview focus')).toBeInTheDocument()
    expect(screen.getByText(/\? shortcuts/)).toBeInTheDocument()

    fireEvent.keyDown(document, {key: 'Enter'})
    await waitFor(() => expect(screen.getByText('List focus')).toBeInTheDocument())

    fireEvent.keyDown(document, {key: 'Escape'})
    await waitFor(() => expect(screen.getByText('Preview focus')).toBeInTheDocument())
  })

  test('opens and closes the selected post in a mobile preview drawer', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getByText('Middle Post'))

    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})
    await waitFor(() => expect(within(dialog).getByText('Preview 2')).toBeInTheDocument())
    expect(within(dialog).getAllByText('Middle Post')).toHaveLength(1)
    expect(within(dialog).getAllByText('@middle-author')).toHaveLength(1)
    expect(within(dialog).getAllByText('Hive')).toHaveLength(1)
    expect(document.body).toHaveClass('mobile-preview-open')

    fireEvent.click(within(dialog).getByRole('button', {name: 'Close preview'}))

    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Post preview'})).not.toBeInTheDocument())
    expect(document.body).not.toHaveClass('mobile-preview-open')
    expect(screen.getByText('Preview 2')).toBeInTheDocument()

    fireEvent.keyDown(document, {key: 'Enter'})
    await waitFor(() => expect(screen.getByRole('dialog', {name: 'Post preview'})).toBeInTheDocument())

    fireEvent.keyDown(document, {key: 'Escape'})
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Post preview'})).not.toBeInTheDocument())
  })

  test('moves between posts inside the mobile preview drawer', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getAllByText('First Post')[0])
    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})
    Element.prototype.scrollIntoView.mockClear()

    fireEvent.click(within(dialog).getByRole('button', {name: /Next/}))
    await waitFor(() => expect(within(dialog).getByText('Preview 2')).toBeInTheDocument())

    fireEvent.click(within(dialog).getByRole('button', {name: /Previous/}))
    await waitFor(() => expect(within(dialog).getByText('Preview 1')).toBeInTheDocument())
  })

  test('syncs the mobile list to the selected row after closing preview', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getAllByText('First Post')[0])
    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})
    Element.prototype.scrollIntoView.mockClear()

    fireEvent.click(within(dialog).getByRole('button', {name: /Next/}))
    await waitFor(() => expect(within(dialog).getByText('Preview 2')).toBeInTheDocument())
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({block: 'center'}))

    fireEvent.click(within(dialog).getByRole('button', {name: 'Close preview'}))

    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Post preview'})).not.toBeInTheDocument())
    expect(screen.getAllByText('Middle Post').length).toBeGreaterThan(0)
  })

  test('marks read and moves next from the mobile preview drawer', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getAllByText('First Post')[0])
    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})

    fireEvent.click(within(dialog).getByRole('button', {name: 'Mark read + next'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/posts/1/read', expect.objectContaining({method: 'PATCH'})))
    await waitFor(() => expect(within(dialog).getByText('Preview 2')).toBeInTheDocument())
  })

  test('returns to the list when the last mobile preview post is marked read', async () => {
    setMobileLayout(true)
    currentPosts = [posts[0]]
    await renderApp()

    fireEvent.click(screen.getAllByText('First Post')[0])
    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})

    fireEvent.click(within(dialog).getByRole('button', {name: 'Mark read + next'}))

    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Post preview'})).not.toBeInTheDocument())
    expect(screen.getByText('All caught up for this view.')).toBeInTheDocument()
  })

  test('keeps mobile checkbox selection separate from opening the preview drawer', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Select Middle Post'}))

    expect(screen.queryByRole('dialog', {name: 'Post preview'})).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Deselect Middle Post'})).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByText('Middle Post'))
    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})
    await waitFor(() => expect(within(dialog).getByText('Preview 2')).toBeInTheDocument())
  })

  test('focuses a preview tag from the mobile drawer and returns to the list', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getByText('Middle Post'))
    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})
    await waitFor(() => expect(within(dialog).getByText('Preview 2')).toBeInTheDocument())

    fireEvent.click(within(dialog).getByRole('button', {name: 'Expand tags for preview Middle Post'}))
    fireEvent.click(within(dialog).getByRole('button', {name: 'Focus tag curation'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=curation'), expect.any(Object)))
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Post preview'})).not.toBeInTheDocument())
  })

  test('focuses a preview author from the mobile drawer and returns to the list', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getAllByRole('button', {name: 'First Post'})[0])
    const dialog = await screen.findByRole('dialog', {name: 'Post preview'})
    fireEvent.click(within(dialog).getByRole('button', {name: 'Focus author @visible-author'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('author=visible-author'), expect.any(Object)))
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Post preview'})).not.toBeInTheDocument())
  })

  test('opens the tags modal on mobile and focuses a tag', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    const dialog = await screen.findByRole('dialog', {name: 'Tags'})
    fireEvent.click(within(dialog).getAllByRole('button', {name: 'haf'})[0])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Tags'})).not.toBeInTheDocument())
  })

  test('dismisses the tags modal with Escape and click-away', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))
    expect(await screen.findByRole('dialog', {name: 'Tags'})).toBeInTheDocument()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('dialog', {name: 'Tags'})).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))
    const dialog = await screen.findByRole('dialog', {name: 'Tags'})
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog', {name: 'Tags'})).not.toBeInTheDocument()
  })

  test('switches related tags into word cloud mode', async () => {
    await renderApp()

    expect(screen.queryByRole('heading', {name: 'Related Tags'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    const relatedSection = screen.getByRole('heading', {name: 'Related Tags'}).closest('section')
    fireEvent.click(within(relatedSection).getByRole('button', {name: 'Cloud'}))

    const cloudTag = within(relatedSection).getByRole('button', {name: 'haf'})
    expect(cloudTag).toHaveAttribute('title', '24 posts')
    expect(cloudTag.style.fontSize).toMatch(/rem$/)
  })

  test('focuses a related tag from the tags modal', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    const relatedSection = screen.getByRole('heading', {name: 'Related Tags'}).closest('section')
    fireEvent.click(within(relatedSection).getByRole('button', {name: 'haf'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
    await waitFor(() => expect(screen.queryByRole('heading', {name: 'Related Tags'})).not.toBeInTheDocument())
    expect(screen.getByText('Hyperion')).toBeInTheDocument()
  })

  test('appends a related tag to the active tag query', async () => {
    await renderApp()

    fireEvent.change(screen.getByPlaceholderText('photography @author app:peakd -contests'), {target: {value: 'curation'}})
    fireEvent.click(screen.getByRole('button', {name: 'Search'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=curation'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))
    const relatedSection = screen.getByRole('heading', {name: 'Related Tags'}).closest('section')
    fireEvent.click(within(relatedSection).getByRole('button', {name: 'haf'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=curation%2Bhaf'), expect.any(Object)))
  })

  test('keeps rendering when a related tag query returns no posts', async () => {
    emptyTags.add('haf')
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    const relatedSection = screen.getByRole('heading', {name: 'Related Tags'}).closest('section')
    fireEvent.click(within(relatedSection).getByRole('button', {name: 'haf'}))

    await waitFor(() => expect(screen.getByText('All caught up for this view.')).toBeInTheDocument())
    expect(screen.getByText('Select a post.')).toBeInTheDocument()
    expect(screen.getByText('Hyperion')).toBeInTheDocument()
  })

  test('toggles keyboard shortcut help with question mark', async () => {
    await renderApp()

    expect(screen.queryByText('Keyboard shortcuts')).not.toBeInTheDocument()

    fireEvent.keyDown(document, {key: '?'})
    await waitFor(() => expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument())
    expect(screen.getByText('toggle shortcuts')).toBeInTheDocument()

    fireEvent.keyDown(document, {key: 'Escape'})
    await waitFor(() => expect(screen.queryByText('Keyboard shortcuts')).not.toBeInTheDocument())
  })

  test('toggles keyboard shortcut help from an empty list', async () => {
    currentPosts = []
    await renderApp({waitForPreview: false})

    await waitFor(() => expect(screen.getByText('All caught up for this view.')).toBeInTheDocument())
    fireEvent.keyDown(document, {key: '?'})

    await waitFor(() => expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument())
    expect(screen.getByText('toggle shortcuts')).toBeInTheDocument()
  })

  test('ignores stale preview responses after fast selection changes', async () => {
    const firstDetail = deferred()
    const secondDetail = deferred()
    detailResponses.set(1, firstDetail)
    detailResponses.set(2, secondDetail)

    await renderApp({waitForPreview: false})
    await waitFor(() => expect(screen.getAllByText('First Post').length).toBeGreaterThan(0))

    fireEvent.keyDown(document, {key: 'j'})
    secondDetail.resolve({id: 2, title: 'Middle Post', body_html: '<p>Preview 2</p>'})
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())

    firstDetail.resolve({id: 1, title: 'First Post', body_html: '<p>Stale Preview 1</p>'})
    await waitFor(() => expect(screen.queryByText('Stale Preview 1')).not.toBeInTheDocument())
    expect(screen.getByText('Preview 2')).toBeInTheDocument()
  })

  test('renders server post detail html without the legacy sandbox iframe', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_html: '<p>Fallback preview</p>',
      content_sandbox_url: '/posts/1/content_sandbox?pp=skip',
      urls: {}
    })

    await renderApp({waitForPreview: false})
    await waitFor(() => expect(screen.getAllByText('First Post').length).toBeGreaterThan(0))

    expect(await screen.findByText('Fallback preview')).toBeInTheDocument()
    expect(screen.queryByTitle('Rendered post: First Post')).not.toBeInTheDocument()
  })

  test('renders post markdown with the Steem renderer instead of the server html fallback', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: '# Real Heading\n\n#c-c-c #hivegc',
      body_html: '<h1 id="c-c-c-hivegc">c-c-c #hivegc</h1>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    expect(await screen.findByRole('heading', {name: 'Real Heading'})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: '#c-c-c'})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: '#hivegc'})).toBeInTheDocument()
    expect(screen.queryByRole('heading', {name: 'c-c-c #hivegc'})).not.toBeInTheDocument()
  })

  test('proxies and lazy-loads rendered post body images', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: '![Alt text](https://example.com/body.png)',
      body_html: '<p>Fallback preview</p>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    const image = await screen.findByRole('img', {name: 'Alt text'})
    expect(image).toHaveAttribute('src', new URL(proxiedImage('https://example.com/body.png'), window.location.origin).toString().replace(/^http:/, ''))
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  test('renders YouTube embeds without sandboxing the player iframe', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      body_html: '<p>Fallback preview</p>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    await waitFor(() => expect(document.querySelector('.post-body iframe')).toBeInTheDocument())
    const frame = document.querySelector('.post-body iframe')
    expect(frame).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(frame).toHaveAttribute('allowfullscreen', 'allowfullscreen')
    expect(frame).not.toHaveAttribute('sandbox')
    expect(frame).not.toHaveAttribute('referrerpolicy')
  })

  test('renders direct 3Speak links as embedded players', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: 'https://3speak.tv/watch?v=bradleyarrow/3speak-1780351254312',
      body_html: '<p>Fallback preview</p>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    await waitFor(() => expect(document.querySelector('.post-body iframe')).toBeInTheDocument())
    const frame = document.querySelector('.post-body iframe')
    expect(frame).toHaveAttribute('src', 'https://play.3speak.tv/watch?v=bradleyarrow/3speak-1780351254312&mode=iframe&layout=desktop')
    expect(frame).toHaveAttribute('loading', 'lazy')
  })

  test('renders Hive 3Speak post links as embedded players', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: 'https://hive.blog/hive-181335/@bradleyarrow/3speak-1780351254312',
      body_html: '<p>Fallback preview</p>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    await waitFor(() => expect(document.querySelector('.post-body iframe')).toBeInTheDocument())
    const frame = document.querySelector('.post-body iframe')
    expect(frame).toHaveAttribute('src', 'https://play.3speak.tv/watch?v=bradleyarrow/3speak-1780351254312&mode=iframe&layout=desktop')
  })

  test('keeps non-3Speak Hive post links as normal links', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: 'https://hive.blog/hive-181335/@bradleyarrow/ordinary-post',
      body_html: '<p>Fallback preview</p>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    const link = await screen.findByRole('link', {name: 'https://hive.blog/hive-181335/@bradleyarrow/ordinary-post'})
    expect(link).toHaveAttribute('href', 'https://hive.blog/hive-181335/@bradleyarrow/ordinary-post')
    expect(document.querySelector('.post-body iframe')).not.toBeInTheDocument()
  })

  test('preserves direct 3Speak iframe html', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: '<iframe src="https://play.3speak.tv/watch?v=bradleyarrow/3speak-1780351254312&mode=iframe" width="640" height="360"></iframe>',
      body_html: '<p>Fallback preview</p>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    await waitFor(() => expect(document.querySelector('.post-body iframe')).toBeInTheDocument())
    const frame = document.querySelector('.post-body iframe')
    expect(frame).toHaveAttribute('src', 'https://play.3speak.tv/watch?v=bradleyarrow/3speak-1780351254312&mode=iframe&layout=desktop')
    expect(frame).toHaveAttribute('loading', 'lazy')
  })

  test('renders 3Speak-generated thumbnail links as embedded players', async () => {
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_markdown: '<a href="https://3speak.tv/watch?v=bradleyarrow/3speak-1780351254312"><img src="https://images.hive.blog/768x0/https://img.3speakcontent.online/3speak-1780351254312/post.png"></a>',
      body_html: '<p>Fallback preview</p>',
      urls: {}
    })

    await renderApp({waitForPreview: false})

    await waitFor(() => expect(document.querySelector('.post-body iframe')).toBeInTheDocument())
    const frame = document.querySelector('.post-body iframe')
    expect(frame).toHaveAttribute('src', 'https://play.3speak.tv/watch?v=bradleyarrow/3speak-1780351254312&mode=iframe&layout=desktop')
  })

  test('renders server post detail html in dark theme without the legacy sandbox iframe', async () => {
    sessionTheme = 'dark'
    const detail = deferred()
    detailResponses.set(1, detail)
    detail.resolve({
      id: 1,
      title: 'First Post',
      body_html: '<p>Fallback preview</p>',
      content_sandbox_url: '/posts/1/content_sandbox?pp=skip',
      urls: {}
    })

    await renderApp({waitForPreview: false})
    await waitFor(() => expect(screen.getAllByText('First Post').length).toBeGreaterThan(0))

    expect(await screen.findByText('Fallback preview')).toBeInTheDocument()
    expect(screen.queryByTitle('Rendered post: First Post')).not.toBeInTheDocument()
  })

  test('shows an inline preview failure without replacing the list', async () => {
    detailFailures.add(1)

    await renderApp({waitForPreview: false})

    await waitFor(() => expect(screen.getByText('Preview failed to load.')).toBeInTheDocument())
    expect(screen.getAllByText('First Post').length).toBeGreaterThan(0)
  })

  test('clears the preview when the last unread post is marked read', async () => {
    currentPosts = [posts[0]]
    await renderApp()

    fireEvent.keyDown(document, {key: '>'})

    await waitFor(() => expect(screen.getByText('All caught up for this view.')).toBeInTheDocument())
    expect(screen.getByText('Select a post.')).toBeInTheDocument()
  })

  test('uses preview scroll keys and moves at scroll boundaries', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    await renderApp()

    fireEvent.keyDown(document, {key: 'Enter'})
    await waitFor(() => expect(screen.getByText('List focus')).toBeInTheDocument())

    const previewPane = screen.getByText('Preview 1').closest('[tabindex="-1"]')
    Object.defineProperties(previewPane, {
      clientHeight: {value: 100, configurable: true},
      scrollHeight: {value: 500, configurable: true}
    })

    fireEvent.keyDown(document, {key: ' '})
    expect(previewPane.scrollTop).toBeGreaterThan(0)

    previewPane.scrollTop = 400
    fireEvent.keyDown(document, {key: 'PageDown'})
    await waitFor(() => expect(screen.getByText('Preview 2')).toBeInTheDocument())
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({block: 'center'}))

    const secondPane = screen.getByText('Preview 2').closest('[tabindex="-1"]')
    Object.defineProperties(secondPane, {
      clientHeight: {value: 100, configurable: true},
      scrollHeight: {value: 500, configurable: true}
    })
    secondPane.scrollTop = 0

    fireEvent.keyDown(document, {key: 'PageUp'})
    await waitFor(() => expect(screen.getByText('Preview 1')).toBeInTheDocument())
  })
})
