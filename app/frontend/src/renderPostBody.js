import { DefaultRenderer } from '@hive/hive-content-renderer'
import { imageProxy } from './format'

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
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    image.setAttribute('referrerpolicy', 'no-referrer')
  })

  return doc.body.innerHTML
}

function absoluteImageProxy(url) {
  const proxiedUrl = imageProxy(url)
  if (typeof window === 'undefined') return proxiedUrl

  return new URL(proxiedUrl, window.location.origin).toString()
}
