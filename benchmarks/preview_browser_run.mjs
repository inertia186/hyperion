import {chromium} from 'playwright'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

const base = process.env.HILLS_URL
const version = process.env.HILLS_VERSION
const output = process.env.HILLS_OUTPUT
assert(base && ['before', 'after'].includes(version) && output && !fs.existsSync(output))
const hash = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex')
const report = {recorded_at: new Date().toISOString(), version, response_delay_ms: 300,
  harness_sha256: Object.fromEntries(['benchmarks/preview_browser_run.mjs', 'benchmarks/preview_browser_server.mjs', 'benchmarks/preview_browser.jsx'].map(path => [path, hash(path)])),
  source_sha256: JSON.parse(fs.readFileSync(`tmp/hills-preview-browser-${version}-sources.json`, 'utf8')),
  bundle_sha256: hash(`tmp/hills-preview-browser-${version}.js`), cases: []}
const browser = await chromium.launch({executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium', headless: true})
report.browser = browser.version()
async function waitForStats(predicate) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const stats = await fetch(`${base}/control/stats`, {signal: AbortSignal.timeout(1000)}).then(response => response.json())
    if (predicate(stats)) return stats
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for fixture request state')
}
try {
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
    const context = await browser.newContext({viewport, serviceWorkers: 'block'})
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      for (const scenario of ['rapid', 'clear', 'unmount']) {
        await page.goto(`${base}/${version}`, {waitUntil: 'load'})
        await page.locator('output[data-status="idle"]').waitFor()
        const reset = await fetch(`${base}/control/reset`, {method: 'POST', signal: AbortSignal.timeout(1000)})
        assert(reset.ok)
        if (scenario === 'rapid') {
          await page.evaluate(async () => {
            for (let id = 1; id <= 10; id++) {
              [...document.querySelectorAll('button')].find(button => button.textContent === `Post ${id}`).click()
              if (id < 10) await new Promise(resolve => setTimeout(resolve, 25))
            }
          })
          await page.locator('output[data-status="ready"][data-id="10"]').waitFor()
          assert.equal(await page.locator('article h2').textContent(), 'Readable post 10')
        } else {
          await page.getByRole('button', {name: 'Post 1', exact: true}).click()
          await page.locator('output[data-status="loading"][data-id="1"]').waitFor()
          await waitForStats(stats => stats.records.length === 1)
          await page.getByRole('button', {name: scenario === 'clear' ? 'Clear' : 'Unmount', exact: true}).click()
        }
        const stats = await waitForStats(stats => stats.records.length === (scenario === 'rapid' ? 10 : 1) && stats.activeWork === 0 && stats.activeSockets === 0)
        assert.equal(stats.records.length, scenario === 'rapid' ? 10 : 1)
        if (scenario === 'clear') assert.equal(await page.locator('output').getAttribute('data-status'), 'idle')
        if (scenario === 'unmount') assert.equal(await page.locator('#root').textContent(), '')
        assert(stats.records.every(record => record.workFinished), JSON.stringify(stats))
        const expectedDisconnects = version === 'before' ? 0 : scenario === 'rapid' ? 9 : 1
        assert.equal(stats.records.filter(record => record.disconnected).length, expectedDisconnects)
        assert.deepEqual(errors, [])
        report.cases.push({viewport, scenario, ...stats})
      }
    } finally { await context.close() }
  }
} finally { await browser.close() }
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({version, browser: report.browser, cases: report.cases.map(row => ({viewport: row.viewport.width, scenario: row.scenario,
  requests: row.records.length, disconnected: row.records.filter(record => record.disconnected).length, peakSockets: row.peakSockets, peakWork: row.peakWork}))}))
