// GET /api/config -> { config | null, updatedAt }   (public: the POS reads it before login)
// PUT /api/config { config } -> { ok, updatedAt, config }   (admin)
// PUT also returns the stored config so the admin picks up a generated ntfy topic.
import { requireRole } from '../lib/auth.mjs'
import { loadSaved, saveConfig } from '../lib/config.mjs'
import { handle, json, MB, methodNotAllowed, readJson } from '../lib/http.mjs'

export default handle(async req => {
  if (req.method === 'GET') {
    const saved = await loadSaved()
    return json({ config: saved?.config ?? null, updatedAt: saved?.updatedAt ?? null })
  }

  if (req.method === 'PUT') {
    await requireRole(req, ['admin'])
    const body = await readJson(req, 4 * MB)
    const { config, updatedAt } = await saveConfig(body.config)
    return json({ ok: true, updatedAt, config })
  }

  throw methodNotAllowed(['GET', 'PUT'])
})

export const config = { path: '/api/config' }
