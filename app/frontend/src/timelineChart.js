export const seriesConfig = {
  unfiltered: {label: 'Unfiltered', color: '#2563eb'},
  deleted: {label: 'Deleted', color: '#dc2626'},
  blacklisted: {label: 'Blacklisted', color: '#9333ea'}
}

export const chartLayout = {
  viewBoxWidth: 720,
  viewBoxHeight: 260,
  left: 48,
  top: 32,
  width: 652,
  height: 180
}

export function chartData(buckets, metric, manualSignpostKeys = new Set()) {
  const values = Object.keys(seriesConfig).flatMap((key) => buckets.map((bucket) => metricValue(bucket.series?.[key], metric)))
  const maxValue = Math.max(...values, 0)
  const minValue = Math.min(...values, 0)
  const span = Math.max(maxValue - minValue, 1)
  const {left, top, width, height} = chartLayout
  const denominator = Math.max(buckets.length - 1, 1)
  const zeroY = top + height - ((0 - minValue) / span) * height
  const series = Object.keys(seriesConfig).map((key) => ({
    key,
    points: buckets.map((bucket, index) => {
      const value = metricValue(bucket.series?.[key], metric)
      return {
        x: left + (index / denominator) * width,
        y: top + height - ((value - minValue) / span) * height
      }
    })
  }))
  const unfilteredPoints = series.find((item) => item.key === 'unfiltered')?.points || []
  const signposts = [
    ...(metric === 'payout' ? rewardShareSignposts(buckets, unfilteredPoints) : []),
    ...manualSignposts(buckets, unfilteredPoints, manualSignpostKeys)
  ]
  const labelIndexes = [0, Math.floor(denominator / 2), denominator]
  const labels = [...new Set(labelIndexes)].map((index, labelIndex) => ({
    x: left + (index / denominator) * width,
    anchor: labelIndex === 0 ? 'start' : labelIndex === 2 ? 'end' : 'middle',
    text: shortBucketLabel(buckets[index]?.starts_at)
  }))

  return {maxValue, minValue, zeroY, series, labels, signposts}
}

export function bucketFromChartClick(event, svg, buckets) {
  if (!svg || buckets.length === 0) return null

  const rect = svg.getBoundingClientRect()
  if (!rect.width || !rect.height) return null

  const x = ((event.clientX - rect.left) / rect.width) * chartLayout.viewBoxWidth
  const y = ((event.clientY - rect.top) / rect.height) * chartLayout.viewBoxHeight
  const right = chartLayout.left + chartLayout.width
  const bottom = chartLayout.top + chartLayout.height
  if (x < chartLayout.left || x > right || y < chartLayout.top || y > bottom) return null

  const denominator = Math.max(buckets.length - 1, 1)
  const ratio = (x - chartLayout.left) / chartLayout.width
  const index = Math.min(Math.max(Math.round(ratio * denominator), 0), buckets.length - 1)
  return buckets[index]
}

export function linePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
}

export function metricTitle(metric) {
  if (metric === 'payout') return 'Hourly payout sums'
  return 'Hourly post count'
}

export function metricLabel(metric) {
  if (metric === 'payout') return 'payout'
  return 'post count'
}

export function timelineRange(payload) {
  return `${shortBucketLabel(payload.started_at)} - ${shortBucketLabel(payload.ended_at)} · hourly`
}

export function shortBucketLabel(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', hour: 'numeric'}).format(new Date(value))
}

export function formatAxisValue(value, metric) {
  if (metric === 'posts') return formatInteger(Math.round(value))
  return Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 1})
}

export function formatInteger(value) {
  return Number(value || 0).toLocaleString()
}

export function formatPayout(value) {
  return `${Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 3})} HBD`
}

export function formatCompact(value) {
  return Number(value || 0).toLocaleString(undefined, {notation: 'compact', maximumFractionDigits: 1})
}

function rewardShareSignposts(buckets, points) {
  const rewardShares = buckets.map((bucket) => Number(bucket.series?.unfiltered?.net_rshares_sum || 0))
  const positiveShares = rewardShares.filter((value) => value > 0).sort((a, b) => a - b)
  const median = positiveShares[Math.floor(positiveShares.length / 2)] || 0
  const highThreshold = median > 0 ? median * 1.5 : Infinity
  const signposts = []

  rewardShares.forEach((value, index) => {
    if (value < 0) {
      signposts.push({
        key: `auto-downvote-${buckets[index]?.starts_at}`,
        kind: 'downvote',
        color: '#dc2626',
        label: `Net downvoted ${shortBucketLabel(buckets[index]?.starts_at)}`,
        x: points[index]?.x || 0,
        y: points[index]?.y || 0
      })
    }
  })

  rewardShares
    .map((value, index) => ({value, index}))
    .filter(({value}) => value >= highThreshold)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .forEach(({index}) => {
      const authors = buckets[index]?.series?.unfiltered?.reward_share_authors || []
      signposts.push({
        key: `auto-high-reward-share-${buckets[index]?.starts_at}`,
        kind: 'high-reward-share',
        color: '#f59e0b',
        authors,
        label: authors.length > 0 ? authors.map((author) => `@${author}`).join(', ') : `High reward share ${shortBucketLabel(buckets[index]?.starts_at)}`,
        x: points[index]?.x || 0,
        y: points[index]?.y || 0
      })
    })

  return signposts
}

function manualSignposts(buckets, points, manualSignpostKeys) {
  return buckets.flatMap((bucket, index) => {
    if (!manualSignpostKeys.has(bucket.starts_at)) return []

    const authors = bucket.series?.unfiltered?.reward_share_authors || []
    const bucketLabel = shortBucketLabel(bucket.starts_at)
    return [{
      key: `manual-${bucket.starts_at}`,
      kind: 'manual',
      color: '#0f766e',
      authors,
      label: authors.length > 0 ? authors.map((author) => `@${author}`).join(', ') : `No reward-share authors ${bucketLabel}`,
      x: points[index]?.x || 0,
      y: points[index]?.y || 0
    }]
  })
}

function metricValue(metrics = {}, metric) {
  if (metric === 'payout') return Number(metrics.payout_sum || 0)
  return Number(metrics.posts_count || 0)
}
