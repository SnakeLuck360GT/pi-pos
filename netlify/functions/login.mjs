// POST /api/login { password, role } -> { token, role, exp }
// 'admin' signs into /admin; 'device' connects a POS tablet. Both use the
// admin password.
import { adminPassword, ROLES, safeEqual, signToken } from '../lib/auth.mjs'
import { handle, HttpError, json, KB, methodNotAllowed, readJson } from '../lib/http.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default handle(async req => {
  if (req.method !== 'POST') throw methodNotAllowed(['POST'])

  const pw = adminPassword()
  const { password, role = 'admin' } = await readJson(req, 4 * KB)
  if (!ROLES.includes(role)) throw new HttpError(400, `role must be one of: ${ROLES.join(', ')}`)
  if (typeof password !== 'string' || !password) throw new HttpError(400, 'Password is required')

  if (!safeEqual(password, pw)) {
    // Slows down guessing a little; there's no lockout store to do better.
    await sleep(400)
    throw new HttpError(401, 'Wrong password')
  }
  return json(signToken(role))
})

export const config = { path: '/api/login' }
