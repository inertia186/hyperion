window.__startupErrors = []
window.addEventListener('error', (event) => window.__startupErrors.push(event.message))
window.addEventListener('unhandledrejection', (event) => window.__startupErrors.push(String(event.reason)))
window.__startupLongTasks = []
if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
  new PerformanceObserver((list) => window.__startupLongTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration})))).observe({type: 'longtask', buffered: true})
}
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const visible = (element) => element && element.getClientRects().length > 0
const until = async (condition) => {
  const deadline = performance.now() + 10000
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('Benchmark condition timed out: ' + condition.toString())
    await frame()
  }
}
const buttons = () => [...document.querySelectorAll('button')].filter(visible)
const button = (name) => buttons().find((b) => b.getAttribute('aria-label') === name || b.textContent.trim() === name)
const dialog = (name) => [...document.querySelectorAll('[role="dialog"]')].find((d) => visible(d) && d.getAttribute('aria-label') === name)
const bodyFor = (id) => [...document.querySelectorAll('.post-body')].find((b) => visible(b) && b.textContent.includes('Benchmark body ' + id))

;(async () => {
  await until(() => document.querySelectorAll('[data-post-list-row]').length >= 2 && !document.querySelector('button[aria-label="Search"]')?.disabled && document.querySelector('.post-body')?.textContent.includes('Readable post content.'))
  await frame()
  const readyMs = performance.now()
  const resources = performance.getEntriesByType('resource').map((r) => ({name: r.name, startTime: r.startTime, responseEnd: r.responseEnd, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize}))
  const scripts = resources.filter((r) => new URL(r.name).pathname.endsWith('.js'))
  window.__startup = {
    readyMs, resources, jsCompressedBytes: scripts.reduce((sum, r) => sum + (r.transferSize ? r.encodedBodySize : 0), 0),
    modulePostDownloadMs: Math.max(0, (window.__moduleLoadedAt || readyMs) - Math.max(...scripts.filter((r) => !r.name.includes('/vendor/')).map((r) => r.responseEnd))),
    hivePostDownloadMs: window.__hiveLoadedAt ? window.__hiveLoadedAt - scripts.find((r) => r.name.includes('/vendor/')).responseEnd : 0,
    longTasks: window.__startupLongTasks.slice(), errors: window.__startupErrors.slice(),
    hasGlobalHive: typeof window.hive !== 'undefined', userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight]
  }
})().catch((error) => { window.__startupFailure = String(error) })

window.runStartupGuards = async () => {
  const timings = {}
  const timed = async (name, action) => { const start = performance.now(); await action(); await frame(); timings[name] = performance.now() - start }
  const rows = [...document.querySelectorAll('[data-post-list-row]')]
  const id = rows[1].getAttribute('data-post-list-row')
  const openPreview = async () => { rows[1].querySelector('button.block').click(); await until(() => bodyFor(id)) }
  await timed('preview', openPreview)
  if (innerWidth < 1280) { button('Close preview').click(); await frame() }
  const headerAction = async (name) => {
    if (!button(name) && !(name === 'Settings' && button('Open settings'))) {
      button('Account menu').click(); await frame()
    }
    const target = button(name) || (name === 'Settings' && button('Open settings'))
    if (!target) throw new Error('Missing header action ' + name)
    target.click()
  }
  await timed('settings', async () => { await headerAction('Settings'); await until(() => dialog('Settings')) })
  button('Close settings').click(); await frame()
  await timed('timeline', async () => { await headerAction('This Week'); await until(() => dialog('This Week on Hive')?.querySelector('.timeline-chart') || dialog('This Week on Hive')?.textContent.includes('All posts')) })
  button('Close timeline').click(); await frame()
  if (innerWidth < 1280) await openPreview()
  await timed('revision', async () => {
    button('Open post actions').click(); await frame()
    button('Diff').click()
    await until(() => dialog('Revision diff')?.textContent.includes('Current fixture revision'))
  })
  button('Close revision diff').click(); await frame()
  await until(() => buttons().some((b) => b.textContent.includes('Votes: 2')))
  await timed('walletApproval', async () => {
    buttons().find((b) => b.textContent.includes('Votes: 2')).click(); await frame()
    button('Vote').click()
    await until(() => dialog('Hivesigner vote'))
    const href = dialog('Hivesigner vote').querySelector('a').href
    if (!href.includes('hivesigner.com/sign/vote?') || !href.includes('weight=10000')) throw new Error('Missing per-vote signing approval')
  })
  button('Close Hivesigner vote').click(); await frame()
  const jump = bodyFor(id)?.querySelector('a[href^="#"]')
  if (!jump) throw new Error('Heading navigation missing')
  jump.click()
  if (window.unsafePostScript) throw new Error('Unsafe post script executed')
  if (window.__startupErrors.length) throw new Error(window.__startupErrors.join('\n'))
  return {timings, sanitized: true, headingLink: true, signingApproval: true, hasGlobalHive: typeof window.hive !== 'undefined'}
}
