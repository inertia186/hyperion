import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'

const root = process.cwd()
const fixtures = JSON.parse(fs.readFileSync('benchmarks/baselines/2026-10-25-startup-fixtures.json'))
const monitor = fs.readFileSync('benchmarks/startup_browser.js', 'utf8')
const profiles = {desktop: {bytesPerSecond: 750 * 1024, latencyMs: 50}, mobile: {bytesPerSecond: 200 * 1024, latencyMs: 100}}
const servers = new Map()
const snapshots = {}
const sha = (data) => createHash('sha256').update(data).digest('hex')

function snapshot(version) {
  if (snapshots[version]) return snapshots[version]
  const directory = path.join(root, 'tmp', `hills-startup-${version}-build`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.vite/manifest.json')))
  const files = new Map()
  for (const file of fs.readdirSync(path.join(directory, 'assets'))) {
    if (!/\.(js|css)$/.test(file)) continue
    const raw = fs.readFileSync(path.join(directory, 'assets', file))
    files.set('/vite/assets/' + file, {raw, gzip: gzipSync(raw, {level: 9}), type: file.endsWith('.js') ? 'application/javascript' : 'text/css'})
  }
  const layout = fs.readFileSync(path.join(root, 'tmp', `hills-startup-${version}-layout.haml`), 'utf8')
  const includeHive = layout.includes('cdn.jsdelivr.net/npm/@hiveio/hive-js/dist/hive.min.js')
  if (includeHive) {
    const raw = fs.readFileSync('tmp/hills-startup-hive.min.js')
    files.set('/vendor/hive.min.js', {raw, gzip: gzipSync(raw, {level: 9}), type: 'application/javascript'})
  }
  const dependencies = new Set()
  function visit(key) { if (dependencies.has(key)) return; dependencies.add(key); (manifest[key].imports || []).forEach(visit) }
  visit('entrypoints/application.js')
  const scripts = [...dependencies].map((key) => '/vite/' + manifest[key].file)
  const styles = [...new Set([...dependencies].flatMap((key) => manifest[key].css || []))].map((file) => '/vite/' + file)
  const entry = '/vite/' + manifest['entrypoints/application.js'].file
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf-token" content="fixture"><meta name="hive-api-url" content="https://api.openhive.network"><title>Hyperion startup benchmark</title><script>${monitor}</script>
${includeHive ? '<script src="/vendor/hive.min.js" onload="window.__hiveLoadedAt=performance.now()"></script>' : ''}
${scripts.filter((s) => s !== entry).map((s) => `<link rel="modulepreload" href="${s}">`).join('')}
${styles.map((s) => `<link rel="stylesheet" href="${s}">`).join('')}<script type="module" src="${entry}" onload="window.__moduleLoadedAt=performance.now()"></script></head><body><div id="root"></div></body></html>`
  const initialScripts = [...scripts, ...(includeHive ? ['/vendor/hive.min.js'] : [])]
  const result = {files, html, manifest, includeHive, initialScripts,
    compressedJsBytes: initialScripts.reduce((sum, file) => sum + files.get(file).gzip.length, 0),
    fileMetadata: Object.fromEntries([...files].map(([name, file]) => [name, {rawBytes: file.raw.length, gzipBytes: file.gzip.length, sha256: sha(file.raw)}]))}
  snapshots[version] = result
  return result
}

function api(url) {
  const pathname = url.pathname
  if (pathname === '/api/v1/session') return fixtures.session
  if (pathname === '/api/v1/session/voting_power') return {status: 'ready', percent: 95}
  if (pathname === '/api/v1/posts/timeline') return fixtures.timeline
  if (pathname === '/api/v1/posts') return fixtures.posts
  if (pathname.startsWith('/api/v1/preferences/')) return fixtures.session.preferences
  const match = pathname.match(/^\/api\/v1\/posts\/(\d+)(?:\/(.*))?$/)
  if (!match) throw new Error('Unexpected API request ' + pathname)
  const id = match[1]
  if (!match[2]) return fixtures.details[id]
  if (match[2] === 'chain_stats') return {status: 'ready', votes: 2, replies: 1, payout: '1.234 HBD', current_vote: null}
  if (match[2] === 'payout') return {status: 'ready', payout: '1.234 HBD', payout_amount: '1.234', payout_currency: 'HBD'}
  if (match[2] === 'revisions') return {post_id: Number(id), revisions: [
    {index: 0, label: 'Previous', body: 'Previous fixture revision', body_html: '<p>Previous fixture revision</p>'},
    {index: 1, label: 'Current', body: 'Current fixture revision', body_html: '<p>Current fixture revision</p>'}
  ]}
  throw new Error('Unexpected API request ' + pathname)
}

async function createTrial(version, profileName) {
  const build = snapshot(version)
  const profile = profiles[profileName]
  if (!profile) throw new Error('Unknown profile')
  let nextByteTime = 0
  const requests = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const send = (data, type, cache = false, status = 200, encoded = null) => {
      const compressed = encoded || gzipSync(data, {level: 9})
      const start = Math.max(Date.now() + profile.latencyMs, nextByteTime)
      const finish = start + compressed.length / profile.bytesPerSecond * 1000
      nextByteTime = finish
      res.writeHead(status, {'Content-Type': type, 'Content-Encoding': 'gzip', 'Content-Length': compressed.length,
        'Cache-Control': cache ? 'public,max-age=3600,immutable' : 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:4177; frame-src 'self' about:"})
      requests.push({path: url.pathname, gzipBytes: compressed.length, status, requestedAt: Date.now()})
      setTimeout(() => res.end(compressed), Math.max(0, finish - Date.now()))
    }
    if (url.pathname === '/') return send(Buffer.from(build.html), 'text/html')
    if (url.pathname === '/service-worker.js') return send(Buffer.from('Service workers disabled for fixed-cache measurement'), 'text/plain', false, 404)
    if (url.pathname.startsWith('/api/v1/images/proxy')) return send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), 'image/svg+xml')
    if (url.pathname.startsWith('/api/')) {
      try { return send(Buffer.from(JSON.stringify(api(url))), 'application/json') }
      catch (error) { return send(Buffer.from(JSON.stringify({error: error.message})), 'application/json', false, 500) }
    }
    const file = build.files.get(url.pathname)
    if (file) return send(file.raw, file.type, true, 200, file.gzip)
    return send(Buffer.from('Not found'), 'text/plain', false, 404)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  servers.set(port, {server, requests, version, profileName})
  return {url: `http://127.0.0.1:${port}/`, port, profile, initialScripts: build.initialScripts, expectedCompressedJsBytes: build.compressedJsBytes}
}

const control = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname === '/control/new') return res.end(JSON.stringify(await createTrial(url.searchParams.get('version'), url.searchParams.get('profile'))))
    if (url.pathname === '/control/build') {
      const build = snapshot(url.searchParams.get('version'))
      return res.end(JSON.stringify({initialScripts: build.initialScripts, compressedJsBytes: build.compressedJsBytes, files: build.fileMetadata, manifest: build.manifest}))
    }
    if (url.pathname === '/control/close') {
      const trial = servers.get(Number(url.searchParams.get('port')))
      if (trial) { trial.server.closeAllConnections(); trial.server.close(); servers.delete(Number(url.searchParams.get('port'))) }
      return res.end(JSON.stringify({closed: true, requests: trial?.requests}))
    }
    if (url.pathname === '/control/shutdown') {
      for (const {server} of servers.values()) { server.closeAllConnections(); server.close() }
      res.end('{"stopped":true}'); control.close(); return
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Startup benchmark control</title>Startup benchmark control')
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({error: error.message})) }
})
control.listen(4177, '127.0.0.1', () => console.log('Startup benchmark control on http://127.0.0.1:4177'))
