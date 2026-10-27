import { act, cleanup, renderHook } from '@testing-library/react'
import { afterAll, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { usePostPreview } from '../app/frontend/src/usePostPreview'

const output = process.env.HILLS_OUTPUT
if (!output || existsSync(output)) throw new Error('HILLS_OUTPUT must be an unused path')
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const paths = ['app/frontend/src/usePostPreview.js', 'app/frontend/src/api.js']
const report = {
  recorded_at: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  node: process.version, environment: 'Vitest/jsdom; controlled fetch and clock; no browser/server transport',
  harness_sha256: hash('benchmarks/sibling_preview.jsx'), config_sha256: hash('benchmarks/sibling_preview.config.mjs'),
  source_sha256: Object.fromEntries(paths.map(path => [path, hash(path)])),
  samples_per_case: 20, response_delay_ms: 300, rapid_selection_interval_ms: 25, cases: {}
}

for (const scenario of ['rapid', 'clear', 'unmount', 'error_recovery']) {
  test(scenario, async () => {
    const rows = []
    for (let sample = 0; sample < 20; sample += 1) {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-25T12:00:00Z'))
      const start = Date.now()
      let selected = 1
      let alive = true
      let active = 0
      let peak = 0
      const calls = []
      vi.stubGlobal('fetch', (url, options = {}) => new Promise((resolve, reject) => {
        const id = Number(url.match(/\/posts\/(\d+)$/)[1])
        const call = {id, started_ms: Date.now() - start, signal_supplied: Boolean(options.signal), aborted: false}
        calls.push(call)
        active += 1
        peak = Math.max(peak, active)
        let settled = false
        const finish = aborted => {
          if (settled) return
          settled = true
          active -= 1
          call.finished_ms = Date.now() - start
          call.obsolete = !alive || selected !== id
          call.aborted = aborted
          if (aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
          } else if (scenario === 'error_recovery' && id === 1) {
            call.failed = true
            reject(new Error('Fixed upstream failure'))
          } else {
            resolve({ok: true, json: async () => ({id, body_html: `<p>Post ${id}</p>`})})
          }
        }
        const timer = setTimeout(() => finish(false), 300)
        options.signal?.addEventListener('abort', () => { clearTimeout(timer); finish(true) }, {once: true})
        if (options.signal?.aborted) { clearTimeout(timer); finish(true) }
      }))
      const hook = renderHook(({id}) => usePostPreview(id), {initialProps: {id: 1}})
      try {
        let finalSelection = 0
        if (scenario === 'rapid') {
          for (let id = 2; id <= 10; id += 1) {
            await act(async () => { await vi.advanceTimersByTimeAsync(25) })
            selected = id
            hook.rerender({id})
          }
          finalSelection = Date.now() - start
          await act(async () => { await vi.advanceTimersByTimeAsync(299) })
          expect(hook.result.current.postId).toBe(10)
          expect(hook.result.current.status).toBe('loading')
          await act(async () => { await vi.advanceTimersByTimeAsync(1) })
          expect(hook.result.current).toMatchObject({postId: 10, status: 'ready', html: '<p>Post 10</p>'})
        } else if (scenario === 'clear') {
          await act(async () => { await vi.advanceTimersByTimeAsync(50) })
          selected = null
          hook.rerender({id: null})
          await act(async () => { await vi.advanceTimersByTimeAsync(300) })
          expect(hook.result.current).toMatchObject({postId: null, status: 'idle', html: ''})
        } else if (scenario === 'unmount') {
          await act(async () => { await vi.advanceTimersByTimeAsync(50) })
          alive = false
          hook.unmount()
          await act(async () => { await vi.advanceTimersByTimeAsync(300) })
        } else {
          await act(async () => { await vi.advanceTimersByTimeAsync(300) })
          expect(hook.result.current).toMatchObject({postId: 1, status: 'error', error: 'Fixed upstream failure'})
          selected = 2
          hook.rerender({id: 2})
          finalSelection = Date.now() - start
          await act(async () => { await vi.advanceTimersByTimeAsync(300) })
          expect(hook.result.current).toMatchObject({postId: 2, status: 'ready', html: '<p>Post 2</p>'})
        }
        expect(active).toBe(0)
        expect(vi.getTimerCount()).toBe(0)
        rows.push({calls, peak_in_flight: peak, completed_obsolete: calls.filter(call => call.obsolete && !call.aborted && !call.failed).length,
          aborted: calls.filter(call => call.aborted).length,
          latest_ready_ms: ['rapid', 'error_recovery'].includes(scenario) ? Date.now() - start - finalSelection : null})
      } finally {
        hook.unmount()
        cleanup()
        vi.unstubAllGlobals()
        vi.useRealTimers()
      }
    }
    const ready = rows.map(row => row.latest_ready_ms).filter(value => value != null).sort((a, b) => a - b)
    report.cases[scenario] = {samples: rows, p95_latest_ready_ms: ready.length ? ready[Math.ceil(ready.length * 0.95) - 1] : null}
  })
}

afterAll(() => {
  expect(Object.keys(report.cases)).toHaveLength(4)
  for (const path of paths) expect(hash(path)).toBe(report.source_sha256[path])
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
})
