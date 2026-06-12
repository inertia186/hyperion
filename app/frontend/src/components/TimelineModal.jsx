import { useEffect, useMemo, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'
import { api } from '../api'
import {
  bucketFromChartClick,
  chartData,
  chartLayout,
  formatAxisValue,
  formatCompact,
  formatInteger,
  formatPayout,
  linePath,
  metricLabel,
  metricTitle,
  seriesConfig,
  timelineRange
} from '../timelineChart'
import { closeOnBackdropClick, useModalDismiss } from '../useModalDismiss'

const cardHelp = {
  'All posts': 'Every post Hyperion has indexed in this rolling 7-day window, including deleted and blacklisted posts.',
  Deleted: 'Posts in the same window that have been deleted. This is an overlapping subset of all posts.',
  Blacklisted: 'Posts in the same window from current blacklist sources. This is an overlapping subset of all posts.',
  'Reward share': 'The signed net rshares total for all posts in the window. Higher values mean more stake-weighted curator attention; downvotes reduce it.'
}

export default function TimelineModal({visible, onClose, onSelectAuthor}) {
  const [metric, setMetric] = useState('payout')
  const [state, setState] = useState({status: 'idle', payload: null, error: null})
  const [manualSignpostKeys, setManualSignpostKeys] = useState(() => new Set())
  useModalDismiss(visible, onClose)

  useEffect(() => {
    if (!visible) {
      setManualSignpostKeys(new Set())
      return undefined
    }

    let active = true
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    setState((current) => ({status: current.payload ? 'ready' : 'loading', payload: current.payload, error: null}))

    api.postTimeline({time_zone: timeZone})
      .then((payload) => {
        if (active) {
          setManualSignpostKeys(new Set())
          setState({status: 'ready', payload, error: null})
        }
      })
      .catch((error) => {
        if (active) setState({status: 'error', payload: null, error: error.message || 'Timeline failed to load.'})
      })

    return () => {
      active = false
    }
  }, [visible])

  if (!visible) return null

  const payload = state.payload

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-3" role="dialog" aria-modal="true" aria-label="This Week on Hive" onClick={closeOnBackdropClick(onClose)}>
      <div className="timeline-modal flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="timeline-modal-header flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">This Week on Hive</h2>
            <div className="text-xs text-slate-500">{payload ? timelineRange(payload) : 'Rolling 7 days · hourly'}</div>
          </div>
          <div className="timeline-metric-toggle inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs" role="group" aria-label="Timeline metric">
            <button className={`h-8 rounded px-3 ${metric === 'payout' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`} type="button" onClick={() => setMetric('payout')} aria-pressed={metric === 'payout'}>Payout</button>
            <button className={`h-8 rounded px-3 ${metric === 'posts' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`} type="button" onClick={() => setMetric('posts')} aria-pressed={metric === 'posts'}>Posts</button>
          </div>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" type="button" onClick={onClose} aria-label="Close timeline">
            <X size={15} />
          </button>
        </div>
        <div className="timeline-modal-body min-h-0 flex-1 overflow-auto p-4">
          {state.status === 'loading' ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">Loading timeline...</div>
          ) : state.status === 'error' ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{state.error}</div>
          ) : payload && payload.buckets?.length > 0 ? (
            <TimelineContent payload={payload} metric={metric} manualSignpostKeys={manualSignpostKeys} onToggleManualSignpost={(bucketKey) => {
              setManualSignpostKeys((current) => {
                const next = new Set(current)
                if (next.has(bucketKey)) {
                  next.delete(bucketKey)
                } else {
                  next.add(bucketKey)
                }
                return next
              })
            }} onSelectAuthor={(author) => {
              onSelectAuthor?.(author)
              onClose()
            }} />
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">No timeline data for this week.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function TimelineContent({payload, metric, manualSignpostKeys, onToggleManualSignpost, onSelectAuthor}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="All posts" metrics={payload.summary?.unfiltered} />
        <SummaryCard label="Deleted" metrics={payload.summary?.deleted} />
        <SummaryCard label="Blacklisted" metrics={payload.summary?.blacklisted} />
        <RewardShareCard metrics={payload.summary?.unfiltered} />
      </div>
      <TimelineChart buckets={payload.buckets} metric={metric} manualSignpostKeys={manualSignpostKeys} onToggleManualSignpost={onToggleManualSignpost} onSelectAuthor={onSelectAuthor} />
    </div>
  )
}

function SummaryCard({label, metrics = {}}) {
  return (
    <div className="timeline-summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <CardLabel label={label} />
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatInteger(metrics.posts_count)}</div>
      <div className="mt-0.5 text-xs tabular-nums text-slate-600">{formatPayout(metrics.payout_sum)} payout</div>
    </div>
  )
}

function RewardShareCard({metrics = {}}) {
  return (
    <div className="timeline-summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <CardLabel label="Reward share" />
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatCompact(metrics.net_rshares_sum)}</div>
      <div className="mt-0.5 text-xs tabular-nums text-slate-600">net rshares</div>
    </div>
  )
}

function CardLabel({label}) {
  const [open, setOpen] = useState(false)
  const help = cardHelp[label]

  return (
    <div className="relative inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span>{label}</span>
      {help && (
        <button className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700" type="button" onClick={() => setOpen((current) => !current)} aria-label={`${label} info`} aria-expanded={open}>
          <Info size={12} />
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-5 z-10 w-56 rounded-md border border-slate-200 bg-white p-2 text-xs font-normal leading-snug text-slate-600 shadow-lg">
          {help}
        </div>
      )}
    </div>
  )
}

function TimelineChart({buckets, metric, manualSignpostKeys, onToggleManualSignpost, onSelectAuthor}) {
  const svgRef = useRef(null)
  const chart = useMemo(() => chartData(buckets, metric, manualSignpostKeys), [buckets, metric, manualSignpostKeys])
  const title = metricTitle(metric)
  const handleChartClick = (event) => {
    const bucket = bucketFromChartClick(event, svgRef.current, buckets)
    if (bucket) onToggleManualSignpost?.(bucket.starts_at)
  }

  return (
    <div className="timeline-chart-card rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="text-xs font-medium text-slate-500">{title}</div>
        <div className="ml-auto flex flex-wrap gap-3">
          {Object.entries(seriesConfig).map(([key, config]) => (
            <span key={key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor: config.color}} />
              {config.label}
            </span>
          ))}
        </div>
      </div>
      <svg ref={svgRef} className="h-72 w-full cursor-crosshair overflow-visible" viewBox={`0 0 ${chartLayout.viewBoxWidth} ${chartLayout.viewBoxHeight}`} role="img" aria-label={`This Week on Hive ${metricLabel(metric)} timeline`} preserveAspectRatio="none" onClick={handleChartClick}>
        <rect x={chartLayout.left} y={chartLayout.top} width={chartLayout.width} height={chartLayout.height} fill="transparent" />
        <line x1="48" y1={chart.zeroY} x2="700" y2={chart.zeroY} stroke="#cbd5e1" />
        <line x1="48" y1="32" x2="48" y2="212" stroke="#e2e8f0" />
        {[0, 0.5, 1].map((ratio) => {
          const y = 212 - ratio * 180
          const value = chart.minValue + (chart.maxValue - chart.minValue) * ratio
          return (
            <g key={ratio}>
              <line x1="48" y1={y} x2="700" y2={y} stroke="#f1f5f9" />
              <text x="8" y={y + 4} fill="#64748b" fontSize="11">{formatAxisValue(value, metric)}</text>
            </g>
          )
        })}
        {chart.series.map(({key, points}) => (
          <path key={key} d={linePath(points)} fill="none" stroke={seriesConfig[key].color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {chart.signposts.map((signpost) => (
          <g key={signpost.key}>
            <circle cx={signpost.x} cy={signpost.y} r="5" fill={signpost.color} stroke="#ffffff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <title>{signpost.label}</title>
          </g>
        ))}
        {chart.labels.map((label) => (
          <text key={label.x} x={label.x} y="238" textAnchor={label.anchor} fill="#64748b" fontSize="11">{label.text}</text>
        ))}
      </svg>
      {chart.signposts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
          {chart.signposts.map((signpost) => (
            <span key={`${signpost.key}-label`} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{backgroundColor: signpost.color}} />
              {signpost.authors?.length > 0 ? (
                signpost.authors.map((author, index) => (
                  <span key={`${signpost.key}-${author}`} className="inline-flex items-center gap-1">
                    {index > 0 && <span>,</span>}
                    <button className="font-medium text-slate-600 hover:text-blue-700 hover:underline" type="button" onClick={() => onSelectAuthor?.(author)} aria-label={`Focus author @${author}`}>
                      @{author}
                    </button>
                  </span>
                ))
              ) : signpost.label}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        Hyperion focuses on pending root-post rewards from its local index, so this timeline excludes replies, curation rewards, DHF payments, and other reward activity. For a broader rewards view, see{' '}
        <a className="font-medium text-blue-700 hover:underline" href="https://hivehub.dev/stats?metric=comment_rewards&timeframe=daily" target="_blank" rel="noreferrer">
          HiveHub reward stats
        </a>.
      </p>
    </div>
  )
}
