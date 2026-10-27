import {chromium} from 'playwright'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

const version = process.env.HILLS_VERSION
assert(['before', 'after'].includes(version))
const samples = Number(process.env.HILLS_SAMPLES || 20)
const output = process.env.HILLS_OUTPUT
assert(output && !fs.existsSync(output))
const control = 'http://127.0.0.1:4177'
const sha = (data) => createHash('sha256').update(data).digest('hex')
const profiles = {desktop: {width: 1440, height: 900, cpuRate: 1}, mobile: {width: 390, height: 844, cpuRate: 4}}
const report = {
  recordedAt: new Date().toISOString(), version, profiles,
  harnessSha256: Object.fromEntries(['benchmarks/startup_run.mjs', 'benchmarks/startup_server.mjs', 'benchmarks/startup_browser.js', 'benchmarks/baselines/2026-10-25-startup-fixtures.json'].map((p) => [p, sha(fs.readFileSync(p))])),
  build: await fetch(`${control}/control/build?version=${version}`).then((r) => r.json()), runs: []
}
const browser = await chromium.launch({executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium', headless: true})
report.browser = browser.version()
try {
  for (const [profile, {width, height, cpuRate}] of Object.entries(profiles)) {
    for (let sample = 0; sample < samples; sample++) {
      const trial = await fetch(`${control}/control/new?version=${version}&profile=${profile}`).then((r) => r.json())
      assert(!trial.error, trial.error)
      const context = await browser.newContext({viewport: {width, height}, serviceWorkers: 'block', isMobile: profile === 'mobile', hasTouch: profile === 'mobile'})
      try {
        const page = await context.newPage()
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', {rate: cpuRate})
        await cdp.send('Performance.enable')
        for (const cache of ['cold', 'revisit']) {
          if (cache === 'cold') await page.goto(trial.url, {waitUntil: 'load'})
          else await page.reload({waitUntil: 'load'})
          await page.waitForFunction(() => window.__startup || window.__startupFailure)
          const data = await page.evaluate(() => ({startup: window.__startup, failure: window.__startupFailure}))
          assert(!data.failure, data.failure)
          assert.equal(data.startup.errors.length, 0, JSON.stringify(data.startup.errors))
          assert.deepEqual(data.startup.viewport, [width, height])
          assert.equal(data.startup.jsCompressedBytes, cache === 'cold' ? trial.expectedCompressedJsBytes : 0)
          assert.equal(data.startup.hasGlobalHive, version === 'before')
          const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({name, value}) => [name, value]))
          // Chromium resets these per-document counters on navigation.
          const cpu = Object.fromEntries(['ScriptDuration', 'V8CompileDuration', 'TaskDuration', 'RecalcStyleDuration', 'LayoutDuration'].filter((key) => key in metrics).map((key) => [key, metrics[key]]))
          const row = {profile, sample: sample + 1, cache, ...data.startup, cpu}
          if (cache === 'revisit') row.guards = await page.evaluate(() => window.runStartupGuards())
          report.runs.push(row)
        }
      } finally {
        await context.close()
        await fetch(`${control}/control/close?port=${trial.port}`)
      }
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
      console.log(`${version} ${profile} ${sample + 1}/${samples}`)
    }
  }
} finally { await browser.close() }
