import { describe, expect, test } from 'vitest'
import {
  bucketFromChartClick,
  chartData,
  chartLayout,
  formatPayout,
  linePath,
  metricLabel,
  metricTitle
} from './timelineChart'

const bucket = (hour, {payout = 0, posts = 0, shares = 0, authors = []} = {}) => ({
  starts_at: `2026-06-12T${String(hour).padStart(2, '0')}:00:00Z`,
  series: {
    unfiltered: {
      payout_sum: payout,
      posts_count: posts,
      net_rshares_sum: shares,
      reward_share_authors: authors
    },
    deleted: {payout_sum: 0, posts_count: 0, net_rshares_sum: 0},
    blacklisted: {payout_sum: 0, posts_count: 0, net_rshares_sum: 0}
  }
})

describe('timeline chart helpers', () => {
  test('builds chart series and signposts from timeline buckets', () => {
    const buckets = [
      bucket(0, {payout: 1, posts: 2, shares: 10, authors: ['alice']}),
      bucket(1, {payout: 3, posts: 4, shares: -5}),
      bucket(2, {payout: 8, posts: 6, shares: 20}),
      bucket(3, {payout: 10, posts: 8, shares: 100, authors: ['bob', 'carol']})
    ]

    const chart = chartData(buckets, 'payout', new Set([buckets[0].starts_at]))

    expect(chart.minValue).toBe(0)
    expect(chart.series.map((series) => series.key)).toEqual(['unfiltered', 'deleted', 'blacklisted'])
    expect(chart.maxValue).toBe(10)
    expect(chart.series[0].points[0]).toEqual({x: 48, y: 194})
    expect(chart.series[0].points.at(-1)).toEqual({x: 700, y: 32})
    expect(chart.signposts.map((signpost) => signpost.kind)).toEqual(['downvote', 'high-reward-share', 'manual'])
    expect(chart.signposts[1].authors).toEqual(['bob', 'carol'])
    expect(chart.signposts[2].authors).toEqual(['alice'])
  })

  test('maps clicks inside the plot area to the nearest bucket', () => {
    const buckets = [bucket(0), bucket(1), bucket(2)]
    const svg = {
      getBoundingClientRect: () => ({left: 10, top: 20, width: chartLayout.viewBoxWidth, height: chartLayout.viewBoxHeight})
    }

    expect(bucketFromChartClick({clientX: 10 + chartLayout.left, clientY: 20 + chartLayout.top}, svg, buckets)).toBe(buckets[0])
    expect(bucketFromChartClick({clientX: 10 + chartLayout.left + chartLayout.width * 0.5, clientY: 20 + chartLayout.top + 20}, svg, buckets)).toBe(buckets[1])
    expect(bucketFromChartClick({clientX: 1, clientY: 1}, svg, buckets)).toBeNull()
  })

  test('formats chart paths, labels, and payouts', () => {
    expect(linePath([{x: 1, y: 2}, {x: 3.456, y: 7.891}])).toBe('M 1.00 2.00 L 3.46 7.89')
    expect(metricTitle('posts')).toBe('Hourly post count')
    expect(metricLabel('payout')).toBe('payout')
    expect(formatPayout(12.3456)).toBe('12.346 HBD')
  })
})
