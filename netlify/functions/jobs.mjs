// Print jobs.
//   POST   /api/jobs                 device, admin            { type, order?, summary?, total?, copies, doc } -> { id }
//   GET    /api/jobs                 device, admin, printer   ?status=pending|printed|failed|all&since=<ms>&limit=
//   GET    /api/jobs/:id             device, admin, printer
//   POST   /api/jobs/:id/complete    printer, device, admin
//   POST   /api/jobs/:id/fail        printer, device, admin   { error }
//   POST   /api/jobs/:id/retry       device, admin
//   DELETE /api/jobs/:id             device, admin
import { requireRole } from '../lib/auth.mjs'
import { handle, HttpError, json, KB, MB, methodNotAllowed, readJson } from '../lib/http.mjs'
import { getJSON, listKeys, mapLimit, randomChars, remove, setJSON, setText } from '../lib/store.mjs'

const HOUR = 60 * 60 * 1000
const KEEP_MS = 30 * 24 * HOUR
const TYPES = ['order', 'summary', 'test']
const STATUSES = ['pending', 'printed', 'failed', 'all']
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000
// Synchronous functions can return about 6 MB; stop well short of that.
const MAX_RESPONSE = 4.5 * MB

const ID_RE = /^[0-9a-z]{9}-[0-9a-z]{4}$/
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v)

// Ids start with the creation time, so key order is time order and old jobs
// can be found without reading them.
const newJobId = now => `${now.toString(36).padStart(9, '0')}-${randomChars(4)}`
const idTime = id => parseInt(id.slice(0, 9), 36)
const jobKey = id => `jobs/${id}`
const pendingKey = id => `pending/${id}`

function validateJob(b) {
  if (!TYPES.includes(b.type)) throw new HttpError(400, `type must be one of: ${TYPES.join(', ')}`)
  if (b.type === 'order' && !isObj(b.order)) throw new HttpError(400, 'An order job needs an order')
  if (b.order != null && !isObj(b.order)) throw new HttpError(400, 'order must be an object')
  if (b.summary != null && !isObj(b.summary)) throw new HttpError(400, 'summary must be an object')
  if (b.total != null && !Number.isFinite(b.total)) throw new HttpError(400, 'total must be a number')
  if (b.copies != null && !(Number.isInteger(b.copies) && b.copies >= 1 && b.copies <= 20)) {
    throw new HttpError(400, 'copies must be a whole number from 1 to 20')
  }
  const doc = b.doc
  if (!isObj(doc) || !Array.isArray(doc.ops)) throw new HttpError(400, 'doc must be a PrintDoc with an ops array')
  if (!doc.ops.length) throw new HttpError(400, 'doc.ops is empty')
  if (doc.ops.some(op => !isObj(op) || typeof op.op !== 'string')) throw new HttpError(400, 'Every doc op needs an "op" name')
  if (doc.cols != null && !(Number.isInteger(doc.cols) && doc.cols > 0 && doc.cols <= 256)) {
    throw new HttpError(400, 'doc.cols must be a positive whole number')
  }
}

async function loadJob(id) {
  if (!ID_RE.test(id || '')) throw new HttpError(404, 'Job not found')
  const job = await getJSON(jobKey(id))
  if (!job) throw new HttpError(404, 'Job not found')
  return job
}

// Removes jobs older than 30 days. Runs at most once an hour, from job
// creation, so there's no scheduled function to set up.
async function prune(now) {
  const meta = await getJSON('meta/pruned')
  if (meta?.at && now - meta.at < HOUR) return 0
  await setJSON('meta/pruned', { at: now })
  const cutoff = now - KEEP_MS
  const old = (await listKeys('jobs/'))
    .map(k => k.slice(5))
    .filter(id => ID_RE.test(id) && idTime(id) < cutoff)
  await mapLimit(old, 10, id => Promise.all([remove(jobKey(id)), remove(pendingKey(id))]))
  return old.length
}

async function create(req, context) {
  await requireRole(req, ['device', 'admin'])
  const b = await readJson(req, 1 * MB)
  validateJob(b)

  const now = Date.now()
  const id = newJobId(now)
  const job = {
    id,
    type: b.type,
    order: b.order ?? null,
    summary: b.summary ?? null,
    total: b.total ?? null,
    copies: b.copies ?? 1,
    doc: b.doc,
    status: 'pending',
    createdAt: now,
    printedAt: null,
    error: null,
  }
  // Job first, then the marker: the Pi only looks at markers, so it never
  // finds one without its job.
  await setJSON(jobKey(id), job)
  await setText(pendingKey(id), '')

  const pruning = prune(now).catch(e => console.error('prune failed', e))
  if (context?.waitUntil) context.waitUntil(pruning)
  else await pruning

  return json({ id }, 201)
}

async function list(req) {
  await requireRole(req, ['device', 'admin', 'printer'])
  const q = new URL(req.url).searchParams
  const status = q.get('status') || 'all'
  if (!STATUSES.includes(status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}`)
  const since = q.has('since') ? Number(q.get('since')) : 0
  if (!Number.isFinite(since)) throw new HttpError(400, 'since must be a timestamp in ms')
  const limit = q.has('limit') ? Number(q.get('limit')) : DEFAULT_LIMIT
  if (!(Number.isInteger(limit) && limit > 0)) throw new HttpError(400, 'limit must be a positive whole number')

  // Pending reads only the small `pending/` prefix: that's what the Pi polls.
  const prefix = status === 'pending' ? 'pending/' : 'jobs/'
  const ids = (await listKeys(prefix))
    .map(k => k.slice(prefix.length))
    .filter(id => ID_RE.test(id) && idTime(id) >= since)
    .sort()
    .reverse()

  const max = Math.min(limit, MAX_LIMIT)
  const jobs = []
  let bytes = 0
  let truncated = false

  // Read newest first in small batches and stop once the limit is reached,
  // so a filtered query doesn't load the whole month.
  for (let i = 0; i < ids.length && jobs.length < max && !truncated; i += 25) {
    const batch = ids.slice(i, i + 25)
    const loaded = await mapLimit(batch, 25, id => getJSON(jobKey(id)))
    for (let j = 0; j < batch.length; j++) {
      const job = loaded[j]
      if (status === 'pending' && job?.status !== 'pending') {
        // Marker left behind by a crash between two writes: clean it up.
        await remove(pendingKey(batch[j]))
        continue
      }
      if (!job || (status !== 'all' && job.status !== status)) continue
      bytes += JSON.stringify(job).length
      if (bytes > MAX_RESPONSE && jobs.length) { truncated = true; break }
      jobs.push(job)
      if (jobs.length >= max) break
    }
  }
  return json(truncated ? { jobs, truncated: true } : { jobs })
}

async function act(req, id, action) {
  const roles = action === 'retry' ? ['device', 'admin'] : ['printer', 'device', 'admin']
  await requireRole(req, roles)
  const body = action === 'fail' ? await readJson(req, 16 * KB) : {}
  const job = await loadJob(id)
  const now = Date.now()

  if (action === 'complete') {
    Object.assign(job, { status: 'printed', printedAt: now, error: null })
    await setJSON(jobKey(id), job)
    await remove(pendingKey(id))
  } else if (action === 'fail') {
    const msg = typeof body.error === 'string' && body.error.trim() ? body.error.trim().slice(0, 500) : 'Print failed'
    Object.assign(job, { status: 'failed', failedAt: now, error: msg })
    await setJSON(jobKey(id), job)
    await remove(pendingKey(id))
  } else {
    Object.assign(job, { status: 'pending', printedAt: null, error: null })
    await setJSON(jobKey(id), job)
    await setText(pendingKey(id), '')
  }
  return json({ ok: true, job })
}

export default handle(async (req, context) => {
  // /api/jobs[/:id[/:action]]
  const [id, action, extra] = new URL(req.url).pathname.replace(/\/+$/, '').split('/').slice(3)
  if (extra !== undefined) throw new HttpError(404, 'Not found')

  if (!id) {
    if (req.method === 'POST') return create(req, context)
    if (req.method === 'GET') return list(req)
    throw methodNotAllowed(['GET', 'POST'])
  }

  if (!action) {
    if (req.method === 'GET') {
      await requireRole(req, ['device', 'admin', 'printer'])
      return json({ job: await loadJob(id) })
    }
    if (req.method === 'DELETE') {
      await requireRole(req, ['device', 'admin'])
      await loadJob(id)
      await remove(pendingKey(id))
      await remove(jobKey(id))
      return json({ ok: true })
    }
    throw methodNotAllowed(['GET', 'DELETE'])
  }

  if (!['complete', 'fail', 'retry'].includes(action)) throw new HttpError(404, `Unknown job action "${action}"`)
  if (req.method !== 'POST') throw methodNotAllowed(['POST'])
  return act(req, id, action)
})

export const config = { path: ['/api/jobs', '/api/jobs/:id', '/api/jobs/:id/:action'] }
