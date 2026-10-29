// Browser client for /api. Tokens live in localStorage, one per role, so an
// admin signing in on the shop tablet doesn't disconnect the POS.
import { withDefaults } from '../../shared/defaults.js'

const TOKEN_KEYS = { admin: 'pipos.adminToken', device: 'pipos.deviceToken' }

// Fired on window when a request comes back 401, with { role } as detail.
// The admin listens for it to send the user back to the login screen.
export const AUTH_EVENT = 'pipos:unauthorized'

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
}

function tokenExp(token) {
  try {
    const body = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(body)).exp || 0
  } catch {
    return 0
  }
}

// A stored token that hasn't expired yet. The server still has the final say
// (a password change invalidates every token).
export function getToken(role) {
  const t = store.get(TOKEN_KEYS[role])
  return t && tokenExp(t) > Date.now() ? t : null
}

export const hasToken = role => !!getToken(role)

export function logout(role) {
  for (const r of role ? [role] : Object.keys(TOKEN_KEYS)) store.del(TOKEN_KEYS[r])
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const role = !auth ? null : getToken('admin') ? 'admin' : getToken('device') ? 'device' : null
  const headers = {}
  if (role) headers.authorization = `Bearer ${getToken(role)}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  let res
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError('Could not reach the server. Check the connection.', 0)
  }

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Plain `vite` serves index.html for /api/*; say so instead of failing oddly.
    throw new ApiError(res.ok ? 'The API is not running. Start the app with `npx netlify dev`.' : `Request failed (${res.status})`, res.status)
  }

  if (!res.ok) {
    if (res.status === 401 && role) {
      // The token was rejected, so it's no use keeping it.
      logout(role)
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { role } }))
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data)
  }
  return data
}

export async function login(password, role = 'admin') {
  const data = await request('/api/login', { method: 'POST', body: { password, role }, auth: false })
  store.set(TOKEN_KEYS[role], data.token)
  return data
}

// `saved` is false until the shop saves for the first time; the config is
// then the defaults.
export async function getConfig() {
  const data = await request('/api/config', { auth: false })
  return { config: withDefaults(data?.config), updatedAt: data?.updatedAt ?? null, saved: !!data?.config }
}

// Returns the stored config too: the server fills in printer.ntfyTopic.
export async function saveConfig(config) {
  const data = await request('/api/config', { method: 'PUT', body: { config } })
  return { updatedAt: data.updatedAt, config: withDefaults(data.config) }
}

export const createJob = job => request('/api/jobs', { method: 'POST', body: job })

// Nudges the Pi through ntfy so it fetches pending jobs now instead of at
// its next fallback poll. Fire and forget: the job is already queued.
export function wakePrinter(config, id) {
  const { ntfyUrl, ntfyTopic } = config?.printer || {}
  if (!ntfyUrl || !ntfyTopic) return
  fetch(`${ntfyUrl.replace(/\/+$/, '')}/${encodeURIComponent(ntfyTopic)}`, {
    method: 'POST', body: String(id || 'job'), keepalive: true,
  }).catch(() => {})
}

// Resolves to the jobs array, newest first. The array also has a `.jobs`
// property pointing at itself, so `const { jobs } = await listJobs()` works too.
export async function listJobs({ status, since, limit } = {}) {
  const q = new URLSearchParams()
  if (status) q.set('status', status)
  if (since != null) q.set('since', String(since))
  if (limit != null) q.set('limit', String(limit))
  const qs = q.toString()
  const data = await request(`/api/jobs${qs ? `?${qs}` : ''}`)
  const jobs = data.jobs || []
  Object.defineProperty(jobs, 'jobs', { value: jobs })
  Object.defineProperty(jobs, 'truncated', { value: !!data.truncated })
  return jobs
}

export async function getJob(id) {
  return (await request(`/api/jobs/${encodeURIComponent(id)}`)).job
}

// action: 'complete' | 'fail' | 'retry' | 'delete'. `body` is { error } for fail.
export function jobAction(id, action, body) {
  const path = `/api/jobs/${encodeURIComponent(id)}`
  if (action === 'delete') return request(path, { method: 'DELETE' })
  return request(`${path}/${action}`, { method: 'POST', body: body || {} })
}

// Admin only. { printerKey, ntfyUrl, ntfyTopic, lastSeen, bridge }
export const getPrinter = () => request('/api/printer')

// Admin only. { code, expiresAt } for the one-line Pi installer.
export const pairPi = () => request('/api/pi/pair', { method: 'POST', body: {} })

export const installCommand = code =>
  `curl -fsSL '${location.origin}/api/pi/install?code=${code}' | bash`

// The bridge heartbeats every 5 minutes, so 10 allows one missed beat.
export const isConnected = printer => !!printer?.lastSeen && Date.now() - printer.lastSeen < 10 * 60 * 1000
