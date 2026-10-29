// Loads the shop config and keeps it fresh. The last good copy is cached in
// localStorage, so the POS starts instantly and keeps working offline.
import { useCallback, useEffect, useRef, useState } from 'react'
import { withDefaults } from '../../shared/defaults.js'
import { getConfig } from './api.js'

const CACHE_KEY = 'pipos.config'

export function readCachedConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (!c?.config) return null
    return { config: withDefaults(c.config), updatedAt: c.updatedAt ?? null, saved: !!c.saved }
  } catch {
    return null
  }
}

// The admin calls this after saving so a POS open in another tab of the same
// browser updates straight away (via the storage event).
export function cacheConfig({ config, updatedAt, saved = true }) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ config, updatedAt, saved })) } catch {}
}

export function useConfig({ poll = 0 } = {}) {
  const [state, setState] = useState(() => {
    const c = readCachedConfig()
    return { config: c?.config ?? null, updatedAt: c?.updatedAt ?? null, saved: c?.saved ?? false, loading: !c, error: null }
  })
  const busy = useRef(false)
  const alive = useRef(true)

  // Keeps the same config object when nothing changed, so a poll doesn't
  // re-render the whole POS.
  const apply = useCallback(r => setState(s =>
    s.config && s.updatedAt === r.updatedAt && s.saved === r.saved
      ? (s.loading || s.error ? { ...s, loading: false, error: null } : s)
      : { ...r, loading: false, error: null }), [])

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const r = await getConfig()
      cacheConfig(r)
      if (alive.current) apply(r)
    } catch (e) {
      if (alive.current) setState(s => ({ ...s, loading: false, error: e.message || String(e) }))
    } finally {
      busy.current = false
    }
  }, [apply])

  useEffect(() => {
    alive.current = true
    refresh()
    return () => { alive.current = false }
  }, [refresh])

  useEffect(() => {
    if (!poll) return
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') refresh() }, poll)
    return () => clearInterval(t)
  }, [poll, refresh])

  useEffect(() => {
    const onFocus = () => refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const onStorage = e => {
      if (e.key !== CACHE_KEY) return
      const c = readCachedConfig()
      if (c) apply(c)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh, apply])

  const { config, loading, error, updatedAt, saved } = state
  return { config, loading, error, refresh, updatedAt, saved }
}
