// GET  /api/printer            (admin)    -> { printerKey, ntfyUrl, ntfyTopic, lastSeen, bridge }
// POST /api/printer/heartbeat  (printer)  { version, printer, ok, error, hostname } -> { ok }
// The bridge sends a heartbeat on start, every few minutes and after jobs.
// lastSeen is what the admin uses to say "Connected".
import { printerKey, requireRole } from '../lib/auth.mjs'
import { loadSaved } from '../lib/config.mjs'
import { handle, HttpError, json, KB, methodNotAllowed, readJson } from '../lib/http.mjs'
import { getJSON, setJSON } from '../lib/store.mjs'
import { DEFAULT_CONFIG } from '../../shared/defaults.js'

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null)

export default handle(async req => {
  const sub = new URL(req.url).pathname.replace(/\/+$/, '').split('/')[3]

  if (sub === 'heartbeat') {
    if (req.method !== 'POST') throw methodNotAllowed(['POST'])
    await requireRole(req, ['printer'])
    const b = await readJson(req, 16 * KB)
    const bridge = {
      version: str(b.version, 40),
      printer: str(b.printer),
      ok: b.ok !== false,
      error: str(b.error, 500),
      hostname: str(b.hostname, 100),
    }
    const lastSeen = Date.now()
    await setJSON('meta/printer', { ...bridge, lastSeen })
    return json({ ok: true, lastSeen })
  }

  if (sub) throw new HttpError(404, 'Not found')
  if (req.method !== 'GET') throw methodNotAllowed(['GET'])
  await requireRole(req, ['admin'])

  const [key, saved, beat] = await Promise.all([printerKey(), loadSaved(), getJSON('meta/printer')])
  const p = saved?.config?.printer || {}
  const { lastSeen = null, ...bridge } = beat || {}
  return json({
    printerKey: key,
    ntfyUrl: p.ntfyUrl || DEFAULT_CONFIG.printer.ntfyUrl,
    ntfyTopic: p.ntfyTopic || '',
    lastSeen,
    bridge: beat ? bridge : null,
  })
})

export const config = { path: ['/api/printer', '/api/printer/:sub'] }
