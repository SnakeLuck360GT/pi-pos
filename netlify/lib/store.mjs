// Netlify Blobs access. Everything lives in one site-wide store, 'pipos':
//   config          { config, updatedAt }
//   config-backup   the previous `config` value
//   jobs/<id>       print job
//   pending/<id>    empty marker, so the Pi can list pending jobs cheaply
//   meta/pruned     { at } last time old jobs were removed
import { randomBytes } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { HttpError } from './http.mjs'

// Strong reads so the Pi sees a job the moment the tablet posts it. Older
// `netlify dev` builds don't provide the uncached URL that needs, so fall
// back to eventual consistency there instead of failing.
let strong = true
const open = () => getStore({ name: 'pipos', consistency: strong ? 'strong' : 'eventual' })

async function run(fn) {
  try {
    return await fn(open())
  } catch (e) {
    if (strong && e?.name === 'BlobsConsistencyError') {
      strong = false
      return fn(open())
    }
    if (e?.name === 'MissingBlobsEnvironmentError') {
      throw new HttpError(500, 'Netlify Blobs is not available. Deploy to Netlify, or run locally with `npx netlify dev`.')
    }
    throw e
  }
}

export const getJSON = key => run(s => s.get(key, { type: 'json' }))
export const setJSON = (key, value) => run(s => s.setJSON(key, value))
export const setText = (key, value) => run(s => s.set(key, value))
export const remove = key => run(s => s.delete(key))

// Keys under a prefix. `list` without paginate follows every page.
export const listKeys = prefix => run(async s => (await s.list({ prefix })).blobs.map(b => b.key))

// Runs `fn` over `items` with limited concurrency, keeping order.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// Lowercase base36 characters. 252 = 36 * 7, so rejecting bytes above it
// keeps every character equally likely.
export function randomChars(n) {
  let out = ''
  while (out.length < n) {
    for (const b of randomBytes(n * 2)) {
      if (b < 252 && out.length < n) out += (b % 36).toString(36)
    }
  }
  return out
}
