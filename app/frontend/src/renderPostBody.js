import { DefaultRenderer } from 'steem-content-renderer'

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
    imageProxyFn: (url) => url,
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

  return doc.body.innerHTML
}
