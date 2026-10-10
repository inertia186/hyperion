import { parseQueryInput } from './curationInboxState'
import { SIGNALS } from './constants'

export const DEFAULT_SIGNAL = SIGNALS[0]?.[0] || ''

export function signalDefaultSort(signal) {
  return SIGNALS.find(([value]) => value === signal)?.[3] || 'latest'
}

export function queryWithUpdates(currentQuery, updates) {
  return {...currentQuery, ...updates, page: updates.page || '1'}
}

export function keywordOnlyQuery(keyword) {
  return {
    tag: '',
    author: '',
    signal: '',
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
    signal: '',
    query: '',
    only_keyword: false
  }
}

export function resetFilterQuery() {
  return {tag: '', query: '', author: '', signal: '', only_keyword: false}
}

export function signalQuery(signal = DEFAULT_SIGNAL) {
  const selectedSignal = signal || DEFAULT_SIGNAL

  return {
    tag: '',
    author: '',
    query: '',
    signal: selectedSignal,
    sort: signalDefaultSort(selectedSignal),
    only_keyword: false,
    only_read: false,
    only_ignored: false,
    only_deleted: false,
    only_blacklisted: false
  }
}
