import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'

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

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {promise, resolve, reject}
}

const setMobileLayout = (matches) => {
  window.matchMedia = vi.fn(() => ({
    matches,
    media: '(max-width: 1279px)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn()
  }))
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

let currentPosts
let detailResponses
let detailFailures
let hivesignerAvailable
let emptyTags

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
      only_favorite_tags: false,
      sort: params.get('sort') || 'latest',
      limit,
      only_read: params.get('only_read') === 'true',
      only_ignored: params.get('only_ignored') === 'true',
      only_deleted: params.get('only_deleted') === 'true',
      only_blacklisted: params.get('only_blacklisted') === 'true'
    },
    pagination: {page, limit, total_count: filteredPosts.length, total_pages: Math.max(Math.ceil(filteredPosts.length / limit), 1)},
    mode_counts: {unread: filteredPosts.length, read: 1, ignored: 2, deleted: 3, blacklisted: 4},
    posts: pagePosts,
    related_tags: [{name: 'haf', tag: 'haf', count: 24}, {name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png', count: 6}],
    related_authors: ['visible-author'],
    ignored_tags: ['spam'],
    favorite_tags: ['haf'],
    past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}],
    counts: {read_posts: 1, ignored_tags: 1, tags: 3}
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
    hivesignerAvailable = false
    emptyTags = new Set()
    window.confirm = vi.fn(() => true)
    window.alert = vi.fn()
    window.open = vi.fn()
    installLocalStorage()
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
          preferences: {muted_authors_enabled: false, only_favorite_tags: false, enabled_blacklist_sources: [], hivesigner_available: hivesignerAvailable},
          blacklist_sources: [
            {community: 'hive-163399', name: 'Trusted Safety', enabled: false},
            {community: 'hive-136001', name: 'Ban Hammer', enabled: false}
          ],
          counts: {read_posts: 1, ignored_tags: 1, favorite_tags: 1, past_tags: 1, tags: 3},
          muted_authors: ['muted-author'],
          ignored_tags: ['spam'],
          favorite_tags: ['haf'],
          past_tags: [{name: 'Hive', tag: 'hive-13323', image_url: 'https://example.com/hive-community.png'}]
        })
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
            hive_db: `https://hive-db.com/hive-13323/@visible-author/post-${id}`,
            scribe: `http://scribe.hivekings.com/?url=post-${id}`
          }
        })
      }

      const readMatch = url.toString().match(/\/api\/v1\/posts\/(\d+)\/read$/)
      if (readMatch && options.method === 'PATCH') {
        return jsonResponse({id: Number(readMatch[1]), read: true, read_posts_count: 2})
      }

      if (url === '/api/v1/posts/read' && options.method === 'PATCH') {
        return jsonResponse({read_posts_count: currentPosts.length})
      }

      const ignoreMatch = url.toString().match(/\/api\/v1\/tags\/([^/]+)\/ignored$/)
      if (ignoreMatch && options.method === 'POST') {
        const tag = decodeURIComponent(ignoreMatch[1])
        return jsonResponse({ignored_tags: ['spam', tag], favorite_tags: ['haf'], past_tags: [{name: tag, tag}]})
      }

      if (ignoreMatch && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], favorite_tags: ['haf'], past_tags: [{name: 'haf', tag: 'haf'}]})
      }

      if (url === '/api/v1/preferences/mute' && options.method === 'PATCH') {
        return jsonResponse({muted_authors_enabled: JSON.parse(options.body).enabled})
      }

      if (url === '/api/v1/preferences/only_favorite_tags' && options.method === 'PATCH') {
        return jsonResponse({only_favorite_tags: JSON.parse(options.body).enabled})
      }

      if (url === '/api/v1/preferences/blacklists' && options.method === 'PATCH') {
        const enabledSources = JSON.parse(options.body).enabled_sources
        return jsonResponse({
          enabled_blacklist_sources: enabledSources,
          blacklist_sources: [
            {community: 'hive-163399', name: 'Trusted Safety', enabled: enabledSources.includes('hive-163399')},
            {community: 'hive-136001', name: 'Ban Hammer', enabled: enabledSources.includes('hive-136001')}
          ]
        })
      }

      if (url === '/api/v1/past_tags?only_ignored=true' && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], favorite_tags: ['haf'], past_tags: [{name: 'haf', tag: 'haf'}]})
      }

      if (url === '/api/v1/past_tags' && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: ['spam'], favorite_tags: ['haf'], past_tags: []})
      }

      if (url === '/api/v1/ignored_tags' && options.method === 'DELETE') {
        return jsonResponse({ignored_tags: [], favorite_tags: ['haf'], past_tags: [{name: 'haf', tag: 'haf'}]})
      }

      throw new Error(`Unhandled fetch ${url}`)
    })
  })

  afterEach(() => {
    cleanup()
    window.localStorage?.clear?.()
    vi.restoreAllMocks()
  })

  test('bootstraps session and renders posts from the API', async () => {
    await renderApp()

    await waitFor(() => expect(screen.getAllByText('First Post').length).toBeGreaterThan(0))
    expect(screen.getByText('Preview 1')).toBeInTheDocument()
  })

  test('opens settings with blacklist sources disabled by default', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))

    expect(screen.getByRole('dialog', {name: 'Settings'})).toBeInTheDocument()
    expect(screen.getByLabelText(/Trusted Safety/)).not.toBeChecked()
    expect(screen.getByLabelText(/Ban Hammer/)).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', {name: 'Close settings'}))
    expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument()
  })

  test('saves blacklist settings and reloads posts', async () => {
    await renderApp()
    const initialPostRequests = global.fetch.mock.calls.filter(([url]) => url.toString().startsWith('/api/v1/posts?')).length

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}))
    fireEvent.click(screen.getByLabelText(/Trusted Safety/))
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/v1/preferences/blacklists', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({enabled_sources: ['hive-163399']})
    })))
    await waitFor(() => {
      const postRequests = global.fetch.mock.calls.filter(([url]) => url.toString().startsWith('/api/v1/posts?')).length
      expect(postRequests).toBeGreaterThan(initialPostRequests)
    })
    expect(screen.queryByRole('dialog', {name: 'Settings'})).not.toBeInTheDocument()
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
    expect(firstThumbnail).toHaveAttribute('src', 'https://images.hive.blog/0x96/https://example.com/first-post.jpg')

    const middleThumbnail = screen.getByTestId('post-thumbnail-2')
    expect(middleThumbnail).toHaveAttribute('src', 'https://images.hive.blog/0x96/https://images.hive.blog/u/middle-author/avatar')

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

    fireEvent.change(screen.getByPlaceholderText('haf @author app:peakd -spam'), {target: {value: 'haf'}})
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
    expect(screen.getByText('1.234 HBD')).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /hive.blog/i})).toHaveAttribute('href', 'https://hive.blog/hive-13323/@visible-author/post-1')
    expect(screen.getByRole('link', {name: /hive-db/i})).toHaveAttribute('href', 'https://hive-db.com/hive-13323/@visible-author/post-1')
  })

  test('renders blacklist reasons in the preview header', async () => {
    currentPosts = [
      {
        ...posts[0],
        blacklisted: true,
        blacklist_reasons: [{community: 'hive-163399', name: 'Trusted Safety'}, {community: 'hive-136001', name: 'Ban Hammer'}]
      }
    ]

    await renderApp()

    expect(screen.getByText('Blacklisted: author is muted by Trusted Safety, Ban Hammer.')).toBeInTheDocument()
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
    await waitFor(() => expect(window.hive.api.getActiveVotes).toHaveBeenCalledWith('original-author', 'original-post', expect.any(Function)))
    expect(window.hive.api.getContent).toHaveBeenCalledWith('original-author', 'original-post', expect.any(Function))
  })

  test('casts keychain upvotes with the selected weight', async () => {
    await renderApp()

    fireEvent.click(await screen.findByText('Votes: 2'))
    fireEvent.change(screen.getByRole('slider'), {target: {value: '42'}})
    fireEvent.click(screen.getByRole('button', {name: 'Vote'}))

    expect(window.hive_keychain.requestVote).toHaveBeenCalledWith('fixture-curator', 'first-post', 'visible-author', 4200, expect.any(Function))
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
    expect(window.hive.api.getActiveVotes).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
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

    fireEvent.change(screen.getByPlaceholderText('haf @author app:peakd -spam'), {target: {value: 'haf @author app:peakd -spam'}})
    fireEvent.click(screen.getByRole('button', {name: 'Search'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('tag=haf+%40author+app%3Apeakd+-spam'),
      expect.any(Object)
    ))
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
    expect(screen.getByRole('button', {name: 'Clear author @visible-author'})).toBeInTheDocument()
    expect(screen.getByText('Preview 1')).toBeInTheDocument()
  })

  test('expands known community tag labels while preserving the raw tag query', async () => {
    await renderApp()

    expect(screen.getAllByRole('button', {name: 'Focus tag hive-13323'})[0]).toHaveTextContent('Hive')
    expect(screen.getAllByRole('button', {name: 'Focus tag hive-19999'})[0]).toHaveTextContent('Side Community')
    expect(screen.getAllByTestId('community-profile-image')[0]).toHaveAttribute('src', 'https://images.hive.blog/0x32/https://example.com/hive-community.png')

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus tag hive-19999'})[0])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=hive-19999'), expect.any(Object)))
  })

  test('focuses the query from a preview tag', async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus tag haf'})[1])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
  })

  test('focuses the query from a preview author', async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus author @visible-author'})[1])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('author=visible-author'), expect.any(Object)))
    expect(screen.getByRole('button', {name: 'Clear author @visible-author'})).toBeInTheDocument()
  })

  test('clears an active author query back to all authors', async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole('button', {name: 'Focus author @visible-author'})[0])
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('author=visible-author'), expect.any(Object)))

    fireEvent.click(screen.getByRole('button', {name: 'Clear author @visible-author'}))

    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.not.stringContaining('author='), expect.any(Object)))
  })

  test('clears an active tag query back to all tags', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Focus tag curation'}))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=curation'), expect.any(Object)))
    expect(screen.getByRole('button', {name: 'Clear tag curation'})).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Clear tag curation'}))

    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.not.stringContaining('tag='), expect.any(Object)))
    expect(screen.getByRole('button', {name: 'All tags'})).toHaveAttribute('aria-pressed', 'true')
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

    fireEvent.change(screen.getByPlaceholderText('haf @author app:peakd -spam'), {target: {value: 'haf'}})
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

    fireEvent.keyDown(screen.getByPlaceholderText('haf @author app:peakd -spam'), {key: 'j'})

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

  test('opens mobile tag discovery and focuses a tag', async () => {
    setMobileLayout(true)
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    const dialog = await screen.findByRole('dialog', {name: 'Tag discovery'})
    fireEvent.click(within(dialog).getAllByRole('button', {name: 'haf'})[0])

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Tag discovery'})).not.toBeInTheDocument())
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

  test('focuses a related tag from the collapsed desktop tag panel', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', {name: 'Tags'}))

    const relatedSection = screen.getByRole('heading', {name: 'Related Tags'}).closest('section')
    fireEvent.click(within(relatedSection).getByRole('button', {name: 'haf'}))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=haf'), expect.any(Object)))
    await waitFor(() => expect(screen.queryByRole('heading', {name: 'Related Tags'})).not.toBeInTheDocument())
    expect(screen.getByText('Hyperion')).toBeInTheDocument()
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

  test('renders post detail through the sandbox iframe when available', async () => {
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

    const frame = await screen.findByTitle('Rendered post: First Post')
    expect(frame).toHaveAttribute('src', '/posts/1/content_sandbox?pp=skip')
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups')
    expect(screen.queryByText('Fallback preview')).not.toBeInTheDocument()
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
