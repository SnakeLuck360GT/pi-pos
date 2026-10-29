// PiPOS printer bridge. Waits on an ntfy stream for "job queued" pings, then
// fetches pending jobs from the site, prints each job's PrintDoc and marks it
// printed or failed. Receipts are rendered in the browser, so a redesign
// never needs a Pi update.
//
//   node index.js          run the bridge
//   node index.js --test   print a test page and exit
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { encodeDoc } from './escpos.js'

const here = dirname(fileURLToPath(import.meta.url))
loadEnv(join(here, '.env'))
const pkg = JSON.parse(fs.readFileSync(join(here, 'package.json'), 'utf8'))

const env = process.env
const API_BASE = (env.API_BASE || '').replace(/\/$/, '')
const PRINTER_KEY = env.PRINTER_KEY || ''
const NTFY_URL = (env.NTFY_URL || 'https://ntfy.sh').replace(/\/$/, '')
const NTFY_TOPIC = env.NTFY_TOPIC || ''
const PRINTER = env.PRINTER || '/dev/usb/lp0'
const ENCODING = env.ENCODING || ''               // empty = use the job's encoding
const FALLBACK_POLL_MS = num(env.FALLBACK_POLL_MS, 5 * 60 * 1000)
const CUT = ['partial', 'full', 'none'].includes(env.CUT) ? env.CUT : 'partial'
const PAPER_COLS = num(env.PAPER_COLS, 48)       // test page only; jobs carry their own width
const HEARTBEAT_MS = 5 * 60 * 1000
const STALL_MS = 2 * 60 * 1000                    // ntfy keepalives come every ~45s
const COPY_GAP_MS = 600                           // let the cutter finish between copies

function num(v, d) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : d
}

// KEY=value lines; real environment variables win (systemd sets them too).
function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || m[1] in process.env) continue
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (tag, ...a) => console.log(`[${tag}]`, ...a)


function tcpTarget() {
  const m = PRINTER.match(/^tcp:\/\/([^:/]+)(?::(\d+))?/)
  return m ? { host: m[1], port: Number(m[2] || 9100) } : null
}

async function printerReady() {
  const tcp = tcpTarget()
  if (!tcp) {
    if (!PRINTER.startsWith('/dev/')) return { ok: true }
    if (!fs.existsSync(PRINTER)) return { ok: false, error: `No printer at ${PRINTER}` }
    try { fs.accessSync(PRINTER, fs.constants.W_OK); return { ok: true } } catch { return { ok: false, error: `No permission to write ${PRINTER}` } }
  }
  return new Promise(resolve => {
    const s = net.connect(tcp, () => { s.end(); resolve({ ok: true }) })
    s.setTimeout(3000, () => { s.destroy(); resolve({ ok: false, error: `No answer from ${tcp.host}:${tcp.port}` }) })
    s.on('error', e => resolve({ ok: false, error: e.message }))
  })
}

function send(buf) {
  const tcp = tcpTarget()
  if (!tcp) {
    if (PRINTER.startsWith('/dev/') && !fs.existsSync(PRINTER)) throw new Error(`Printer not connected at ${PRINTER}`)
    const fd = fs.openSync(PRINTER, 'w')
    try { fs.writeSync(fd, buf) } finally { fs.closeSync(fd) }
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const s = net.connect(tcp)
    s.setTimeout(10000, () => { s.destroy(); reject(new Error(`Printer at ${tcp.host}:${tcp.port} timed out`)) })
    s.on('error', reject)
    s.on('close', err => (err ? null : resolve()))
    s.end(buf)
  })
}

async function printDoc(doc, copies = 1) {
  const buf = encodeDoc(doc, { encoding: ENCODING, cut: CUT })
  const n = Math.max(1, Math.min(10, copies || 1))
  for (let i = 0; i < n; i++) {
    await send(buf)
    if (i < n - 1) await sleep(COPY_GAP_MS)
  }
  return { bytes: buf.length, copies: n }
}


async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'X-Printer-Key': PRINTER_KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    let msg = `${res.status}`
    try { msg += ` ${(await res.json()).error || ''}` } catch {}
    throw new Error(`API ${method} ${path}: ${msg.trim()}`)
  }
  return res.json().catch(() => ({}))
}

let heartbeatFailed = false
async function heartbeat() {
  const p = await printerReady()
  try {
    await api('/api/printer/heartbeat', { method: 'POST', body: { version: pkg.version, printer: PRINTER, ok: p.ok, error: p.error || null, hostname: os.hostname() } })
    if (heartbeatFailed) log('BEAT', 'Heartbeat working again')
    heartbeatFailed = false
  } catch (e) {
    // Once per outage, not every five minutes.
    if (!heartbeatFailed) log('BEAT', `Heartbeat failed: ${e.message}`)
    heartbeatFailed = true
  }
}


// Jobs printed but not yet marked complete (e.g. the network dropped). Kept
// so a retry marks them done instead of printing them again.
const printed = new Map()
let busy = false
let again = false

async function poll() {
  if (busy) { again = true; return }
  busy = true
  try {
    do {
      again = false
      const { jobs = [] } = await api('/api/jobs?status=pending')
      // The API returns newest first; print in the order they were placed.
      for (const job of jobs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) await handle(job)
    } while (again)
  } catch (e) {
    log('POLL', e.message)
  } finally {
    busy = false
  }
}

async function handle(job) {
  if (!printed.has(job.id)) {
    try {
      if (!job.doc?.ops) throw new Error('Job has no print data')
      const r = await printDoc(job.doc, job.copies)
      printed.set(job.id, Date.now())
      log('PRINT', `${job.id} (${job.type || 'order'}) ${r.copies}x ${r.bytes} bytes`)
    } catch (e) {
      log('FAIL', `${job.id}: ${e.message}`)
      await api(`/api/jobs/${encodeURIComponent(job.id)}/fail`, { method: 'POST', body: { error: e.message } }).catch(err => log('FAIL', err.message))
      heartbeat()
      return
    }
  }
  try {
    await api(`/api/jobs/${encodeURIComponent(job.id)}/complete`, { method: 'POST' })
    printed.delete(job.id)
  } catch (e) {
    log('DONE', `${job.id} printed but not marked: ${e.message}`)
  }
  for (const [id, t] of printed) if (Date.now() - t > 24 * 3600e3) printed.delete(id)
  heartbeat()
  await sleep(300)
}

// One long-lived ntfy stream. The site publishes to the topic after queueing
// a job, so the Pi only calls the site when there is something to print.
async function listen() {
  let retry = 1000
  for (;;) {
    const ctrl = new AbortController()
    let stall
    const alive = () => { clearTimeout(stall); stall = setTimeout(() => ctrl.abort(), STALL_MS) }
    try {
      alive()
      const res = await fetch(`${NTFY_URL}/${NTFY_TOPIC}/json`, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`ntfy returned ${res.status}`)
      const dec = new TextDecoder()
      let buf = ''
      for await (const chunk of res.body) {
        alive()
        buf += dec.decode(chunk, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let msg
          try { msg = JSON.parse(line) } catch { continue }
          if (msg.event === 'open') {
            log('PUSH', 'Connected, waiting for jobs')
            retry = 1000
            poll()   // anything queued while we were away
          } else if (msg.event === 'message') {
            poll()
          }
        }
      }
      throw new Error('stream closed')
    } catch (e) {
      log('PUSH', 'Disconnected:', ctrl.signal.aborted ? 'no keepalive' : e.message)
    } finally {
      clearTimeout(stall)
    }
    await sleep(retry)
    retry = Math.min(retry * 2, 60000)
  }
}


function testDoc() {
  const now = new Date()
  const t = (text, o = {}) => ({ op: 'text', text, w: 1, h: 1, bold: false, underline: false, invert: false, align: 'left', ...o })
  const inner = PAPER_COLS - 1
  const band = s => ' '.repeat(Math.floor((inner - s.length) / 2)) + s + ' '.repeat(Math.ceil((inner - s.length) / 2))
  return {
    cols: PAPER_COLS, lineSpacing: 24, encoding: ENCODING || 'utf8',
    ops: [
      t('PiPOS', { w: 2, h: 2, bold: true, align: 'center' }),
      t('Test page', { align: 'center' }),
      t(now.toLocaleString('en-GB'), { align: 'center' }),
      { op: 'rule', thickness: 4, pad: 3 },
      t(`Printer   ${PRINTER}`.slice(0, inner)),
      t(`Encoding  ${ENCODING || 'utf8 (jobs choose)'}`.slice(0, inner)),
      t(`Paper     ${PAPER_COLS} columns`),
      t(`Host      ${os.hostname()}`.slice(0, inner)),
      { op: 'rule', thickness: 1, pad: 3 },
      t('Normal 1x1'),
      t('Bold', { bold: true }),
      t('Underline', { underline: true }),
      t(band('White on black'), { invert: true }),
      t('Wide 2x1', { w: 2 }),
      t('Big 2x2', { w: 2, h: 2 }),
      t('3x3', { w: 3, h: 3 }),
      t('中文 自取 外送', { w: 2, h: 2 }),
      t('Right', { align: 'right' }),
      t('0123456789'.repeat(10).slice(0, inner)),
      { op: 'rule', thickness: 2, pad: 3 },
      { op: 'qr', data: 'PiPOS test page', size: 6, align: 'center' },
      t('If this prints, the bridge works.', { align: 'center' }),
      { op: 'cut' },
    ],
  }
}


if (process.argv.includes('--test')) {
  try {
    const r = await printDoc(testDoc())
    log('TEST', `Sent test page to ${PRINTER} (${r.bytes} bytes)`)
    process.exit(0)
  } catch (e) {
    log('TEST', `Could not print: ${e.message}`)
    process.exit(1)
  }
}

const missing = [['API_BASE', API_BASE], ['PRINTER_KEY', PRINTER_KEY], ['NTFY_TOPIC', NTFY_TOPIC]].filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}. Set them in ${join(here, '.env')}.`)
  process.exit(1)
}

console.log(`PiPOS bridge ${pkg.version}`)
console.log(`  site     ${API_BASE}`)
console.log(`  printer  ${PRINTER}`)
console.log(`  encoding ${ENCODING || 'from each job'}, cut ${CUT}`)
console.log(`  push     ${NTFY_URL}/${NTFY_TOPIC}`)
console.log(`  fallback ${FALLBACK_POLL_MS > 0 ? `poll every ${Math.round(FALLBACK_POLL_MS / 60000)} min` : 'off'}`)

heartbeat()
setInterval(heartbeat, HEARTBEAT_MS)
listen()
if (FALLBACK_POLL_MS > 0) setInterval(poll, FALLBACK_POLL_MS)
