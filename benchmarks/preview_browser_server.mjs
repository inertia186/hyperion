import http from 'node:http'
import fs from 'node:fs'

let records = []
let activeSockets = 0
let peakSockets = 0
let activeWork = 0
let peakWork = 0
const timers = new Set()
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const send = (value, type = 'application/json') => {
    res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store'})
    res.end(type === 'application/json' ? JSON.stringify(value) : value)
  }
  if (url.pathname === '/control/reset' && req.method === 'POST') {
    if (activeSockets || activeWork) { res.writeHead(409); return res.end('Pending requests') }
    records = []; peakSockets = 0; peakWork = 0
    return send({reset: true})
  }
  if (url.pathname === '/control/stats') return send({records, activeSockets, peakSockets, activeWork, peakWork})
  if (url.pathname === '/control/shutdown' && req.method === 'POST') {
    send({stopped: true})
    for (const timer of timers) clearTimeout(timer)
    return server.close()
  }
  const version = url.pathname.match(/^\/(before|after)\/?$/)?.[1]
  if (version) return send(`<!doctype html><meta charset="utf-8"><title>Preview transport fixture</title><div id="root"></div><script src="/assets/${version}.js"></script>`, 'text/html')
  const asset = url.pathname.match(/^\/assets\/(before|after)\.js$/)?.[1]
  if (asset) return send(fs.readFileSync(`tmp/hills-preview-browser-${asset}.js`, 'utf8'), 'text/javascript')
  const id = url.pathname.match(/^\/api\/v1\/posts\/(\d+)$/)?.[1]
  if (id) {
    const record = {id: Number(id), started: Date.now(), disconnected: false}
    records.push(record)
    activeSockets += 1; activeWork += 1
    peakSockets = Math.max(peakSockets, activeSockets)
    peakWork = Math.max(peakWork, activeWork)
    let socketFinished = false
    const finishSocket = () => {
      if (socketFinished) return
      socketFinished = true
      activeSockets -= 1
      record.disconnected = !res.writableEnded
      record.socketFinished = Date.now()
    }
    res.on('finish', finishSocket)
    res.on('close', finishSocket)
    // Deliberately finish simulated backend work even when the browser disconnects.
    const timer = setTimeout(() => {
      timers.delete(timer)
      activeWork -= 1
      record.workFinished = Date.now()
      send({id: Number(id), body_html: `<h2>Readable post ${id}</h2>`})
    }, 300)
    timers.add(timer)
    return
  }
  res.writeHead(404); res.end()
})
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({url: `http://127.0.0.1:${server.address().port}`})))
