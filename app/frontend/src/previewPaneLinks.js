export function blacklistReasonText(reasons) {
  const accounts = [...new Set((reasons || []).map((reason) => reason?.name || reason?.account).filter(Boolean))]
  if (accounts.length === 0) return 'Blacklisted: author appears on a Hive blacklist.'

  return `Blacklisted: author appears on ${accounts.join(', ')}.`
}

export function previewExternalLinks(urls, displayPost) {
  const builtInLinks = [
    {key: 'hive_blog', href: urls.hive_blog, label: 'hive.blog'},
    {key: 'peakd', href: urls.peakd, label: 'peakd'},
    {key: 'hiveblocks', href: urls.hiveblocks, label: 'hiveblocks'},
    {key: 'hive_db', href: urls.hive_db, label: 'hivehub.dev'}
  ]
  const builtInHosts = new Set(builtInLinks.map((link) => normalizedHost(link.href)).filter(Boolean))
  const canonicalHref = urls.canonical || displayPost?.canonical_url
  const canonicalHost = normalizedHost(canonicalHref)
  const canonicalLink = canonicalHref && canonicalHost && !builtInHosts.has(canonicalHost) ? [{key: 'canonical', href: canonicalHref, label: canonicalHost}] : []

  return [...canonicalLink, ...builtInLinks]
}

export function replyCommentsUrl(urls, displayPost) {
  const baseUrl = urls.hive_blog || (displayPost ? `https://hive.blog/${displayPost.category}/@${displayPost.author}/${displayPost.permlink}` : '')
  if (!baseUrl) return '#comments'

  return `${baseUrl.split('#')[0]}#comments`
}

function normalizedHost(href) {
  try {
    return new URL(href).host.toLowerCase().replace(/^www\./, '')
  } catch (_error) {
    return null
  }
}
