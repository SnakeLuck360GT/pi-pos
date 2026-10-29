// POST /api/pi/pair              (admin)  -> { code, expiresAt }
// GET  /api/pi/install?code=XXX  (anyone with a live code) -> bash script
//
// The admin shows `curl -fsSL '<origin>/api/pi/install?code=XXX' | bash`.
// The script carries the printer key, so the code is the only thing guarding
// it: short-lived, one active at a time, compared in constant time.
import { printerKey, requireRole, safeEqual } from '../lib/auth.mjs'
import { ensureConfig } from '../lib/config.mjs'
import { handle, HttpError, json, methodNotAllowed } from '../lib/http.mjs'
import { getJSON, setJSON } from '../lib/store.mjs'
import { randomBytes } from 'node:crypto'

const CODE_TTL = 15 * 60 * 1000
// No 0/O or 1/I, so a code read off a screen can't be mistyped. 32 letters,
// so `byte % 32` is unbiased.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEFAULT_REPO = 'https://github.com/SnakeLuck360GT/pi-pos'

const env = k => (globalThis.Netlify?.env?.get(k) ?? process.env[k]) || ''
const newCode = () => [...randomBytes(6)].map(b => ALPHABET[b % 32]).join('')

// Single-quote for bash: close the quote, add an escaped quote, reopen.
const q = v => `'${String(v ?? '').replace(/'/g, `'\\''`)}'`

const script = lines => new Response(['#!/usr/bin/env bash', ...lines, ''].join('\n'), {
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
})

// Served with 200 so `curl -f` passes it on to bash and the message shows.
const failScript = msg => script([`echo ${q(`PiPOS: ${msg}`)} >&2`, 'exit 1'])

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function pair(req) {
  if (req.method !== 'POST') throw methodNotAllowed(['POST'])
  await requireRole(req, ['admin'])
  // The installer needs a topic, which only exists once the config is saved.
  await ensureConfig()
  const code = newCode()
  const expiresAt = Date.now() + CODE_TTL
  await setJSON('meta/pair', { code, expiresAt })
  return json({ code, expiresAt })
}

async function install(req) {
  if (req.method !== 'GET') throw methodNotAllowed(['GET'])
  const code = (new URL(req.url).searchParams.get('code') || '').trim().toUpperCase()
  const pairing = await getJSON('meta/pair')
  const valid = pairing?.code && code && safeEqual(code, pairing.code)
  if (!valid) {
    await sleep(400)
    return failScript('this setup code is not valid. Open /admin > Printer and copy the command again.')
  }
  if (Date.now() > pairing.expiresAt) {
    return failScript('this setup code has expired. Open /admin > Printer and copy the new command.')
  }

  const [config, key] = await Promise.all([ensureConfig(), printerKey()])
  const repo = (env('PIPOS_REPO') || DEFAULT_REPO).replace(/\.git$/, '').replace(/\/+$/, '')
  return script([
    'set -e',
    `export PIPOS_API_BASE=${q(new URL(req.url).origin)}`,
    `export PIPOS_PRINTER_KEY=${q(key)}`,
    `export PIPOS_NTFY_URL=${q(config.printer.ntfyUrl)}`,
    `export PIPOS_NTFY_TOPIC=${q(config.printer.ntfyTopic)}`,
    `export PIPOS_REPO=${q(repo)}`,
    'curl -fsSL "${PIPOS_REPO/github.com/raw.githubusercontent.com}/main/pi-bridge/install.sh" | bash',
  ])
}

export default handle(async req => {
  const sub = new URL(req.url).pathname.replace(/\/+$/, '').split('/')[3]
  if (sub === 'pair') return pair(req)
  if (sub === 'install') return install(req)
  throw new HttpError(404, 'Not found')
})

export const config = { path: ['/api/pi/pair', '/api/pi/install'] }
