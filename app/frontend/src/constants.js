export const SORTS = [
  ['latest', 'Latest'],
  ['oldest', 'Oldest'],
  ['most_prolific', 'Prolific'],
  ['least_prolific', 'Non-prolific'],
  ['most_tags', 'Most tags'],
  ['least_tags', 'Least tags'],
  ['highest_payout', 'Highest payout'],
  ['lowest_payout', 'Lowest payout']
]

export const SIGNALS = [
  ['high_prolific_author', 'Prolific authors', '7+ posts', 'most_prolific'],
  ['high_tag_utilization', 'High tag use', '8+ tags', 'most_tags'],
  ['poisoned_pills', 'Poisoned Pills', 'poisoned authors', 'latest']
]

export const initialQuery = {
  tag: '',
  query: '',
  author: '',
  sort: 'latest',
  signal: '',
  limit: '30',
  page: '1',
  only_read: false,
  only_keyword: false,
  only_ignored: false,
  only_deleted: false,
  only_blacklisted: false
}
