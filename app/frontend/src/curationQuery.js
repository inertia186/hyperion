import { parseQueryInput } from './curationInboxState'

export function queryWithUpdates(currentQuery, updates) {
  return {...currentQuery, ...updates, page: updates.page || '1'}
}

export function keywordOnlyQuery(keyword) {
  return {
    tag: '',
    author: '',
    query: String(keyword || '').trim(),
    only_keyword: true,
    only_read: false,
    only_ignored: false,
    only_deleted: false,
    only_blacklisted: false
  }
}

export function filterInputQuery(input) {
  return {
    ...parseQueryInput(input),
    query: '',
    only_keyword: false
  }
}

export function resetFilterQuery() {
  return {tag: '', query: '', author: '', only_keyword: false}
}
