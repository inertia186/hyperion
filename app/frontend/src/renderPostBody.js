import { DefaultRenderer } from '@hive/hive-content-renderer'
import { imageProxy } from './format'

const POST_BODY_IMAGE_SIZE = '1280x0'
const BBS_POST_BODY_IMAGE_SIZE = '160x0'

export function renderPostBody(markdown, post = {}) {
  const renderer = new DefaultRenderer({
    baseUrl: 'https://hive.blog/',
    breaks: true,
    skipSanitization: false,
    allowInsecureScriptTags: false,
    addNofollowToLinks: true,
    doNotShowImages: false,
    ipfsPrefix: '',
    assetsWidth: 640,
    assetsHeight: 480,
    imageProxyFn: (url) => absoluteImageProxy(url),
    usertagUrlFn: (account) => `/@${account}`,
    hashtagUrlFn: (hashtag) => `/${post.category || 'trending'}/@${post.author || ''}/${post.permlink || ''}#${hashtag}`,
    isLinkSafeFn: () => true
  })

  return hardenRenderedEmbeds(renderer.render(markdown || ''))
}

function hardenRenderedEmbeds(html) {
  if (typeof window === 'undefined' || !window.DOMParser) return html

  const doc = new window.DOMParser().parseFromString(html, 'text/html')

  doc.querySelectorAll('iframe').forEach((iframe) => {
    const src = iframe.getAttribute('src') || ''

    try {
      const url = new URL(src, window.location.origin)
      if (!['http:', 'https:'].includes(url.protocol)) {
        iframe.remove()
        return
      }
    } catch (_error) {
      iframe.remove()
      return
    }

    iframe.setAttribute('loading', 'lazy')
  })

  doc.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src') || ''
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    image.setAttribute('referrerpolicy', 'no-referrer')
    image.classList.add('bbs-image-source')
    image.setAttribute('data-bbs-image', 'source')
    image.setAttribute('data-bbs-original-src', src)
    image.setAttribute('data-bbs-pixel-src', bbsPixelImageProxy(src))
  })

  return doc.body.innerHTML
}

function absoluteImageProxy(url) {
  const proxiedUrl = imageProxy(url, POST_BODY_IMAGE_SIZE)
  if (typeof window === 'undefined') return proxiedUrl

  return new URL(proxiedUrl, window.location.origin).toString()
}

function bbsPixelImageProxy(src) {
  if (!src || typeof window === 'undefined') return src

  try {
    const url = new URL(src, window.location.origin)
    if (!url.pathname.endsWith('/api/v1/images/proxy')) return src
    if (!url.searchParams.has('url')) return src

    url.searchParams.set('size', BBS_POST_BODY_IMAGE_SIZE)
    return url.toString()
  } catch (_error) {
    return src
  }
}
