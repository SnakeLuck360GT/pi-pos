// Response helpers shared by the functions. Every error goes out as
// `{ error: 'message' }` so the browser and the Pi can show it as is.

export class HttpError extends Error {
  constructor(status, message, headers) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

const BASE = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...BASE, ...headers } })

export const error = (status, message, headers) => json({ error: message }, status, headers)

export const KB = 1024
export const MB = 1024 * KB
const size = n => (n >= MB ? `${n / MB} MB` : `${n / KB} KB`)

// Reads the body as a stream and stops at `maxBytes`, because Content-Length
// can be missing or wrong.
export async function readJson(req, maxBytes = 64 * KB) {
  const tooBig = () => new HttpError(413, `Request body is too large (max ${size(maxBytes)})`)
  if (Number(req.headers.get('content-length')) > maxBytes) throw tooBig()

  let text = ''
  if (req.body) {
    const reader = req.body.getReader()
    const chunks = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        reader.cancel().catch(() => {})
        throw tooBig()
      }
      chunks.push(value)
    }
    text = new TextDecoder().decode(Buffer.concat(chunks))
  }
  if (!text.trim()) return {}

  let data
  try { data = JSON.parse(text) } catch { throw new HttpError(400, 'Request body is not valid JSON') }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Request body must be a JSON object')
  return data
}

export const methodNotAllowed = allow =>
  new HttpError(405, 'Method not allowed', { allow: allow.join(', ') })

// Wraps a handler so thrown HttpErrors become JSON responses and anything
// unexpected becomes a 500 that still says what went wrong.
export function handle(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context)
    } catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message, e.headers)
      console.error(e)
      return error(500, `Server error: ${e?.message || e}`)
    }
  }
}
