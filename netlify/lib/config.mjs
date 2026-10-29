// Reading and writing the shop config blob. Used by PUT /api/config and by
// pairing, which has to make sure an ntfy topic exists before the Pi gets it.
import { DEFAULT_CONFIG, withDefaults } from '../../shared/defaults.js'
import { HttpError } from './http.mjs'
import { getJSON, randomChars, setJSON } from './store.mjs'

const OBJECT_KEYS = ['business', 'features', 'theme', 'layouts', 'receipt', 'summary', 'printer', 'security']
const ARRAY_KEYS = ['modes', 'categories', 'items', 'modifiers']
const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v)

// Shape checks only. Values are the admin's business; the clients read
// everything through withDefaults anyway.
export function validateConfig(c) {
  if (!isObj(c)) throw new HttpError(400, 'config must be an object')
  for (const k of OBJECT_KEYS) {
    if (k in c && !isObj(c[k])) throw new HttpError(400, `config.${k} must be an object`)
  }
  for (const k of ARRAY_KEYS) {
    if (!(k in c)) continue
    if (!Array.isArray(c[k])) throw new HttpError(400, `config.${k} must be an array`)
    const seen = new Set()
    c[k].forEach((row, i) => {
      if (!isObj(row) || typeof row.id !== 'string' || !row.id) throw new HttpError(400, `config.${k}[${i}] needs a string id`)
      if (seen.has(row.id)) throw new HttpError(400, `config.${k} has a duplicate id "${row.id}"`)
      seen.add(row.id)
    })
  }
  const p = c.printer || {}
  if (p.ntfyUrl != null && p.ntfyUrl !== '' && !/^https?:\/\/\S+$/.test(p.ntfyUrl)) {
    throw new HttpError(400, 'printer.ntfyUrl must be an http(s) URL')
  }
  if (p.ntfyTopic && (typeof p.ntfyTopic !== 'string' || !TOPIC_RE.test(p.ntfyTopic))) {
    throw new HttpError(400, 'printer.ntfyTopic may only use letters, digits, - and _ (max 64)')
  }
}

// { config, updatedAt } or null when the shop has never saved.
export const loadSaved = () => getJSON('config')

export async function saveConfig(config) {
  validateConfig(config)
  const prev = await loadSaved()
  // The Pi has to be told the topic, so it must not change by accident: an
  // empty topic keeps the saved one, and only a brand new shop gets a fresh one.
  const topic = config.printer?.ntfyTopic || prev?.config?.printer?.ntfyTopic || `pipos-${randomChars(16)}`
  const next = { ...config, printer: { ...(config.printer || {}), ntfyTopic: topic } }
  const updatedAt = Date.now()
  if (prev) await setJSON('config-backup', prev)
  await setJSON('config', { config: next, updatedAt })
  return { config: next, updatedAt }
}

// The saved config with defaults filled in, saving the defaults first if the
// shop has never saved (that's what creates the ntfy topic).
export async function ensureConfig() {
  const saved = await loadSaved()
  if (saved?.config?.printer?.ntfyTopic) return withDefaults(saved.config)
  const { config } = await saveConfig(saved?.config || structuredClone(DEFAULT_CONFIG))
  return withDefaults(config)
}
