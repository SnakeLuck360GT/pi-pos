// Admin panel at /admin: login, then the shell (sidebar, top bar, page).
// Holds the one draft config every page edits; Save sends it to the server.
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Modal, Spinner, Tour } from '../ui/index.jsx'
import { AUTH_EVENT, getConfig, hasToken, logout, saveConfig } from '../lib/api.js'
import { cacheConfig } from '../lib/useConfig.js'
import { withDefaults } from '../../shared/defaults.js'
import { useDraft } from './shell/useDraft.js'
import { currentPath, findRoute, hrefFor } from './shell/routes.js'
import Login from './shell/Login.jsx'
import Sidebar from './shell/Sidebar.jsx'
import TopBar from './shell/TopBar.jsx'
import ErrorBoundary from './shell/ErrorBoundary.jsx'
import SetupWizard from './setup/SetupWizard.jsx'
import Overview from './pages/Overview.jsx'
import Business from './pages/Business.jsx'
import Menu from './pages/Menu.jsx'
import Modifiers from './pages/Modifiers.jsx'
import OrderTypes from './pages/OrderTypes.jsx'
import Orders from './pages/Orders.jsx'
import Printer from './pages/Printer.jsx'
import './admin.css'
import './pages/pages.css'

const PosDesigner = lazy(() => import('./designer/PosDesigner.jsx'))
const ReceiptDesigner = lazy(() => import('./receipt/ReceiptDesigner.jsx'))

const PAGES = {
  '': Overview,
  business: Business,
  menu: Menu,
  modifiers: Modifiers,
  'order-types': OrderTypes,
  layout: PosDesigner,
  receipt: ReceiptDesigner,
  orders: Orders,
  printer: Printer,
}

// Where an unsaved draft waits while the user signs in again.
const STASH_KEY = 'pipos.adminDraft'

const TOUR = [
  { target: '[data-tour="nav-shop"]', title: 'Shop', body: 'Your menu, modifiers and order types live here.' },
  { target: '[data-tour="nav-design"]', title: 'Design', body: 'Drag and drop the tablet screens, and lay out the receipt.' },
  { target: '[data-tour="nav-ops"]', title: 'Operations', body: 'Past orders, reprints and the printer connection.' },
  { target: '[data-tour="save"]', title: 'Save', body: 'Nothing goes live until you save. Tablets pick up changes within a minute.' },
  { target: '[data-tour="open-pos"]', title: 'Open POS', body: 'Opens the tablet screen in a new tab.' },
  { target: '[data-tour="setup"]', title: 'Setup', body: 'Run the setup steps again at any time.' },
]

const stash = draft => { try { sessionStorage.setItem(STASH_KEY, JSON.stringify(draft)) } catch {} }
const unstash = () => {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    sessionStorage.removeItem(STASH_KEY)
    return raw ? withDefaults(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function useRoute() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onPop = () => setPath(currentPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // Unknown paths fall back to the overview without adding a history entry.
  useEffect(() => {
    if (!findRoute(path)) {
      history.replaceState(null, '', hrefFor(''))
      setPath('')
    }
  }, [path])
  const navigate = useCallback(p => {
    if (hrefFor(p) !== location.pathname) history.pushState(null, '', hrefFor(p))
    setPath(p)
  }, [])
  return [findRoute(path) ? path : '', navigate]
}

// Text fields keep their own ⌘Z; ours only applies elsewhere.
const isTextField = el =>
  el?.isContentEditable || el?.tagName === 'TEXTAREA' ||
  (el?.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'color', 'file'].includes(el.type))

export default function AdminApp() {
  const [authed, setAuthed] = useState(() => hasToken('admin'))
  const [notice, setNotice] = useState('')
  const [loadState, setLoadState] = useState({ status: 'idle', error: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [path, navigate] = useRoute()
  const d = useDraft()
  const mainRef = useRef()

  // Handlers registered once read the latest state through this ref.
  const live = useRef()
  live.current = { d, saving }

  const load = useCallback(async () => {
    setLoadState({ status: 'loading', error: '' })
    try {
      const r = await getConfig()
      d.load(r.config, unstash())
      if (!r.saved) setSetupOpen(true)
      setLoadState({ status: 'ready', error: '' })
    } catch (e) {
      setLoadState({ status: 'error', error: e.message })
    }
  }, [d.load])

  useEffect(() => { if (authed) load() }, [authed, load])

  // Any request that comes back 401 (expired token, changed password) lands
  // here. Keep the draft for after the next sign-in.
  const expire = useCallback(() => {
    const { d } = live.current
    if (d.dirty) stash(d.draft)
    logout('admin')
    setAuthed(false)
    setNotice('Your session has expired. Sign in again; unsaved changes are kept.')
  }, [])

  useEffect(() => {
    const on = e => { if (e.detail?.role === 'admin') expire() }
    window.addEventListener(AUTH_EVENT, on)
    return () => window.removeEventListener(AUTH_EVENT, on)
  }, [expire])

  // Resolves true when the draft is on the server.
  const save = useCallback(async () => {
    const { d, saving } = live.current
    if (saving) return false
    if (!d.dirty) return true
    const sent = d.draft
    setSaving(true)
    setSaveError('')
    try {
      const r = await saveConfig(sent)
      cacheConfig({ config: r.config, updatedAt: r.updatedAt, saved: true })
      d.markSaved(r.config, sent)
      return true
    } catch (e) {
      if (e.status === 401) expire()
      else setSaveError(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }, [expire])

  useEffect(() => {
    const onKey = e => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      const { d } = live.current
      if (k === 's') {
        e.preventDefault()
        save()
      } else if ((k === 'z' || k === 'y') && !isTextField(e.target)) {
        e.preventDefault()
        if (k === 'y' || e.shiftKey) d.redo()
        else d.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  useEffect(() => {
    if (!d.dirty) return
    const onUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [d.dirty])

  // Errors belong to the save that failed; editing again clears them.
  useEffect(() => { setSaveError('') }, [d.draft])

  const go = useCallback(p => {
    navigate(p)
    setSideOpen(false)
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [navigate])

  function signOut() {
    sessionStorage.removeItem(STASH_KEY)
    logout('admin')
    setConfirmSignOut(false)
    setNotice('')
    setAuthed(false)
  }

  if (!authed) return <Login notice={notice} onDone={() => { setNotice(''); setAuthed(true) }} />

  if (loadState.status === 'error') {
    return (
      <div className="adm-center">
        <div className="adm-crash">
          <div className="adm-crash__title">Could not load the shop settings</div>
          <div className="adm-crash__msg">{loadState.error}</div>
          <Button onClick={load}>Try again</Button>
        </div>
      </div>
    )
  }
  if (!d.draft) return <div className="adm-center"><Spinner /></div>

  const pageProps = {
    config: d.draft, update: d.update, savedConfig: d.saved,
    undo: d.undo, redo: d.redo, canUndo: d.canUndo, canRedo: d.canRedo,
    navigate: go, save,
  }

  if (setupOpen) {
    return (
      <SetupWizard
        {...pageProps} saving={saving} saveError={saveError}
        onClose={() => setSetupOpen(false)}
      />
    )
  }

  const route = findRoute(path)
  const Page = PAGES[route.path]

  return (
    <div className="adm">
      <Sidebar
        path={route.path} navigate={go} shopName={d.saved?.business?.name}
        open={sideOpen} onClose={() => setSideOpen(false)}
        onSetup={() => { setSideOpen(false); setSetupOpen(true) }}
        onSignOut={() => (d.dirty ? setConfirmSignOut(true) : signOut())}
      />
      <div className="adm-main">
        <TopBar
          route={route} dirty={d.dirty} saving={saving} error={saveError}
          onSave={save} onDiscard={d.discard} onMenu={() => setSideOpen(true)}
          history={route.full ? null : d}
        />
        <main ref={mainRef} className={`adm-content${route.full ? ' adm-content--full' : ''}`}>
          <ErrorBoundary key={route.path}>
            <Suspense fallback={<div className="adm-center"><Spinner /></div>}>
              {route.full
                ? <Page {...pageProps} />
                : <div className="adm-page"><Page {...pageProps} /></div>}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <Tour id="admin" steps={TOUR} />

      {confirmSignOut && (
        <Modal
          title="Sign out with unsaved changes?" onClose={() => setConfirmSignOut(false)}
          footer={<>
            <Button onClick={() => setConfirmSignOut(false)}>Cancel</Button>
            <Button variant="danger" onClick={signOut}>Discard and sign out</Button>
          </>}
        >
          <p>Your changes since the last save will be lost.</p>
        </Modal>
      )}
    </div>
  )
}
