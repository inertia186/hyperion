const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content

const request = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
      ...(options.headers || {})
    },
    ...options
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(payload.error || response.statusText)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export const api = {
  session: () => request('/api/v1/session'),
  votingPower: () => request('/api/v1/session/voting_power'),
  posts: (params) => request(`/api/v1/posts?${params.toString()}`),
  postTimeline: (params = {}) => request(`/api/v1/posts/timeline?${new URLSearchParams(params).toString()}`),
  post: (id) => request(`/api/v1/posts/${id}`),
  postRevisions: (id) => request(`/api/v1/posts/${id}/revisions`),
  postPayout: (id, params = {}, options = {}) => request(`/api/v1/posts/${id}/payout?${new URLSearchParams(params).toString()}`, options),
  postChainStats: (id, params = {}, options = {}) => request(`/api/v1/posts/${id}/chain_stats?${new URLSearchParams(params).toString()}`, options),
  markRead: (id) => request(`/api/v1/posts/${id}/read`, {method: 'PATCH', body: '{}'}),
  markUnread: (id) => request(`/api/v1/posts/${id}/read`, {method: 'DELETE', body: '{}'}),
  markManyRead: (payload) => request('/api/v1/posts/read', {method: 'PATCH', body: JSON.stringify(Array.isArray(payload) ? {post_ids: payload} : payload)}),
  ignoreTag: (tag) => request(`/api/v1/tags/${encodeURIComponent(tag)}/ignored`, {method: 'POST', body: '{}'}),
  unignoreTag: (tag) => request(`/api/v1/tags/${encodeURIComponent(tag)}/ignored`, {method: 'DELETE', body: '{}'}),
  poisonTag: (tag) => request(`/api/v1/tags/${encodeURIComponent(tag)}/poisoned_pill`, {method: 'POST', body: '{}'}),
  unpoisonTag: (tag) => request(`/api/v1/tags/${encodeURIComponent(tag)}/poisoned_pill`, {method: 'DELETE', body: '{}'}),
  favoriteTag: (tag) => request(`/api/v1/tags/${encodeURIComponent(tag)}/favorite`, {method: 'POST', body: '{}'}),
  unfavoriteTag: (tag) => request(`/api/v1/tags/${encodeURIComponent(tag)}/favorite`, {method: 'DELETE', body: '{}'}),
  removePastTag: (tag) => request(`/api/v1/past_tags/${encodeURIComponent(tag)}`, {method: 'DELETE', body: '{}'}),
  clearPastTags: () => request('/api/v1/past_tags', {method: 'DELETE', body: '{}'}),
  clearIgnoredPastTags: () => request('/api/v1/past_tags?only_ignored=true', {method: 'DELETE', body: '{}'}),
  clearIgnoredTags: () => request('/api/v1/ignored_tags', {method: 'DELETE', body: '{}'}),
  setMute: (enabled) => request('/api/v1/preferences/mute', {method: 'PATCH', body: JSON.stringify({enabled})}),
  setOnlyFavoriteTags: (enabled) => request('/api/v1/preferences/only_favorite_tags', {method: 'PATCH', body: JSON.stringify({enabled})}),
  setTheme: (theme) => request('/api/v1/preferences/theme', {method: 'PATCH', body: JSON.stringify({theme})}),
  setMinimumReputation: (minimum_reputation) => request('/api/v1/preferences/minimum_reputation', {method: 'PATCH', body: JSON.stringify({minimum_reputation})}),
  setBlacklists: (payload) => request('/api/v1/preferences/blacklists', {method: 'PATCH', body: JSON.stringify(payload)})
}
