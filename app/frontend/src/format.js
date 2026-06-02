export function imageProxy(url, size) {
  if (!url || url.startsWith('data:')) return url
  const imageUrl = url.startsWith('//') ? `https:${url}` : url
  if (!/^https?:\/\//i.test(imageUrl)) return url
  const params = new URLSearchParams({url: imageUrl})
  if (size) params.set('size', size)
  return `/api/v1/images/proxy?${params.toString()}`
}

export function relativeAge(value) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 90) return `${seconds}s ago`

  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}

export function queryParams(query) {
  const values = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value === false || value === '' || value == null) return
    values.set(key, value === true ? 'true' : value)
  })

  return values
}

export function tagLabel(tag, post, label) {
  if (!/^hive-\d+$/i.test(tag)) return tag
  if (label && label !== tag) return label
  if (!post.category_name || post.category_name === tag) return tag

  return post.category_name
}
