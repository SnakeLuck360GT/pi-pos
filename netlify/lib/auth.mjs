// Login tokens and role checks.
//
// Token = base64url(JSON{ role, exp }) + '.' + base64url(HMAC-SHA256(body)).
// exp is in ms. There's no session store: changing ADMIN_PASSWORD (or
// SESSION_SECRET) changes the signing key, which signs everyone out.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { HttpError } from './http.mjs'
import { getJSON, setJSON } from './store.mjs'

const DAY = 24 * 60 * 60 * 1000
export const TTL = { admin: 30 * DAY, device: 365 * DAY }
export const ROLES = Object.keys(TTL)

const env = k => (globalThis.Netlify?.env?.get(k) ?? process.env[k]) || ''

const ENV_HINT = 'Add it in Netlify under Site configuration > Environment variables, then redeploy.'

export function adminPassword() {
  const pw = env('ADMIN_PASSWORD')
  if (!pw) throw new HttpError(500, `ADMIN_PASSWORD is not set. ${ENV_HINT}`)
  return pw
}

// PRINTER_KEY from the environment wins. Without it, a key is generated on
// first need and kept in Blobs, so a fresh deploy only needs ADMIN_PASSWORD.
let storedKey = null
export async function printerKey() {
  const fromEnv = env('PRINTER_KEY')
  if (fromEnv) return fromEnv
  if (storedKey) return storedKey
  const secrets = (await getJSON('meta/secrets')) || {}
  if (!secrets.printerKey) {
    await setJSON('meta/secrets', { ...secrets, printerKey: randomBytes(16).toString('hex') })
    // Read back rather than trust our own value, in case two first requests raced.
    Object.assign(secrets, await getJSON('meta/secrets'))
  }
  storedKey = secrets.printerKey
  return storedKey
}

const sha256 = s => createHash('sha256').update(s).digest()

const secret = () => env('SESSION_SECRET') || sha256(`pipos:${adminPassword()}`).toString('hex')

const sign = body => createHmac('sha256', secret()).update(body).digest('base64url')

// Hash both sides first so the buffers are always the same length:
// timingSafeEqual would throw otherwise, and the length itself would leak.
export function safeEqual(a, b) {
  return timingSafeEqual(sha256(String(a)), sha256(String(b)))
}

export function signToken(role, now = Date.now()) {
  if (!TTL[role]) throw new HttpError(400, `Unknown role "${role}"`)
  const exp = now + TTL[role]
  const body = Buffer.from(JSON.stringify({ role, exp })).toString('base64url')
  return { token: `${body}.${sign(body)}`, role, exp }
}

export function verifyToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  if (!safeEqual(parts[1], sign(parts[0]))) return null
  let payload
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) } catch { return null }
  if (!TTL[payload?.role] || !(payload.exp > now)) return null
  return payload
}

// The caller's role: 'admin' | 'device' | 'printer', or throws 401.
// The Pi sends X-Printer-Key; browsers send a bearer token.
export async function identify(req) {
  const key = req.headers.get('x-printer-key')
  if (key) {
    if (safeEqual(key, await printerKey())) return 'printer'
    throw new HttpError(401, 'Wrong printer key. Pair the Pi again from /admin > Printer.')
  }
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '')
  if (!m) throw new HttpError(401, 'Sign in required')
  const payload = verifyToken(m[1])
  if (!payload) throw new HttpError(401, 'Session expired or invalid. Sign in again.')
  return payload.role
}

export async function requireRole(req, roles) {
  const role = await identify(req)
  if (!roles.includes(role)) throw new HttpError(403, `Not allowed for ${role}`)
  return role
}
