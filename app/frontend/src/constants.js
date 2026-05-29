export const SORTS = [
  ['latest', 'Latest'],
  ['oldest', 'Oldest'],
  ['most_prolific', 'Prolific'],
  ['least_prolific', 'Non-prolific'],
  ['most_tags', 'Most tags'],
  ['least_tags', 'Least tags']
]

export const initialQuery = {
  tag: '',
  author: '',
  sort: 'latest',
  limit: '30',
  page: '1',
  only_read: false,
  only_ignored: false,
  only_deleted: false,
  only_blacklisted: false
}
