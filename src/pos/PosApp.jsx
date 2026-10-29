import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig } from '../lib/useConfig.js'
import { AUTH_EVENT, createJob, hasToken, wakePrinter } from '../lib/api.js'
import { themeVars } from '../lib/theme.js'
import { Icon } from '../ui/icons.jsx'
import { DEFAULT_CONFIG } from '../../shared/defaults.js'
import { findMode, itemCount, money, orderTotals } from '../../shared/order.js'
import { renderReceipt } from '../../shared/receipt.js'
import { PosGrid } from './PosGrid.jsx'
import { finalOrder, peekNumber, takeNumber, useOrder } from './useOrder.js'
import { Sheet, ConfirmSheet } from './sheets/Sheet.jsx'
import { AmountSheet, ChoiceSheet, CustomerSheet, LineSheet, PinSheet } from './sheets/OrderSheets.jsx'
import { ConnectScreen } from './screens/Connect.jsx'
import { QueueScreen } from './screens/Queue.jsx'
import { SummaryScreen } from './screens/Summary.jsx'
import { errorMessage, withTimeout } from './screens/jobs.jsx'
import './pos.css'

const SCREEN_KEY = 'pipos.screen'
// The summary sits behind an optional PIN, so a refresh never lands on it.
const RESTORABLE = ['home', 'order', 'queue']

function loadScreen() {
  try {
    const s = sessionStorage.getItem(SCREEN_KEY)
    if (RESTORABLE.includes(s)) return s
  } catch { /* ignore */ }
  return 'home'
}

const DEFAULT_FIELDS = ['name', 'phone']

export default function PosApp() {
  // useConfig already applies withDefaults.
  const { config, error: configError, refresh } = useConfig({ poll: 60000 })
  const [connected, setConnected] = useState(() => hasToken('device') || hasToken('admin'))
  const [expired, setExpired] = useState(false)
  const [order, dispatch] = useOrder()
  const [screen, setScreen] = useState(loadScreen)
  const [sheet, setSheet] = useState(null)
  const [category, setCategory] = useState(null)
  const [search, setSearch] = useState('')
  const [printing, setPrinting] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    try { sessionStorage.setItem(SCREEN_KEY, screen) } catch { /* ignore */ }
  }, [screen])

  const go = useCallback(next => {
    // Home is the natural pause between orders: pick up menu edits there.
    if (next === 'home') { refresh?.(); setSearch('') }
    setScreen(next)
  }, [refresh])

  // api.js drops a rejected token. Only disconnect once none is left: an
  // expired admin token on the shop tablet falls back to the device token.
  const authError = useCallback(() => {
    if (hasToken('device') || hasToken('admin')) return
    setExpired(true)
    setConnected(false)
  }, [])

  useEffect(() => {
    window.addEventListener(AUTH_EVENT, authError)
    return () => window.removeEventListener(AUTH_EVENT, authError)
  }, [authError])

  const features = config?.features || DEFAULT_CONFIG.features

  // Screens that the config switched off fall back to home.
  useEffect(() => {
    if ((screen === 'queue' && !features.queue) || (screen === 'summary' && !features.summary)) setScreen('home')
  }, [screen, features.queue, features.summary])

  const theme = (config || DEFAULT_CONFIG).theme
  const rootStyle = themeVars(theme)

  if (!connected) {
    return (
      <div className="pos-root pos-theme" style={rootStyle}>
        <ConnectScreen config={config} expired={expired} onConnected={() => { setConnected(true); setExpired(false); refresh?.() }} />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="pos-root pos-theme" style={rootStyle}>
        {configError ? (
          <div className="pos-connect">
            <div className="pos-connect__card">
              <h1 className="pos-connect__title">Could not load the menu</h1>
              <p className="pos-connect__text">Check the connection and try again.</p>
              <button type="button" className="pos-sbtn pos-sbtn--primary pos-sbtn--block" onClick={() => refresh?.()}>Try again</button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const close = () => setSheet(null)
  const mode = findMode(config, order.mode)

  const beginMode = (m, keep) => {
    if (keep) dispatch({ type: 'setMode', mode: m?.id ?? null, fee: m?.fee })
    else dispatch({ type: 'reset', mode: m?.id ?? null, fee: m?.fee })
    setCategory(null)
    setSearch('')
    if (features.orderModes && m?.fields?.length) {
      setSheet({ type: 'customer', mode: m, fresh: true, initial: keep ? order.customer : null })
    } else {
      setSheet(null)
      go('order')
    }
  }

  // Starting something new while a ticket has lines asks first, so a tap on
  // the wrong home button never throws an order away.
  const start = m => {
    if (order.lines.length) setSheet({ type: 'resume', mode: m })
    else beginMode(m, false)
  }

  async function print() {
    if (printing || !order.lines.length) return
    setPrinting(true)
    setSheet(null)
    const now = Date.now()
    // A retry keeps the number the first attempt took.
    const number = order.number ?? takeNumber()
    if (order.number == null) dispatch({ type: 'number', number })
    const final = finalOrder(order, number, now)
    const m = findMode(config, final.mode)
    try {
      const doc = renderReceipt(config, final, { now })
      const { total } = orderTotals(final)
      const copies = Math.max(1, Number(m?.copies) || 1)
      const { id } = await withTimeout(createJob({ type: 'order', order: final, total, copies, doc }))
      Promise.resolve().then(() => wakePrinter(config, id)).catch(() => {})
      setNotice({ key: id, number, total, copies, mode: m })
      dispatch({ type: 'reset' })
      setCategory(null)
      go('home')
    } catch (err) {
      if (err?.status === 401) authError()
      setSheet({ type: 'printError', message: errorMessage(err) })
    } finally {
      setPrinting(false)
    }
  }

  const actions = {
    go,
    startMode: id => {
      if (!features.orderModes) return start(null)
      const m = findMode(config, id)
      if (m && m.enabled !== false) start(m)
    },
    newOrder: () => start(null),
    addItem: item => {
      if (item.choices?.length) setSheet({ type: 'choice', item })
      else dispatch({ type: 'add', item })
    },
    openLine: lineId => setSheet({ type: 'line', lineId }),
    inc: lineId => dispatch({ type: 'inc', lineId }),
    dec: lineId => dispatch({ type: 'dec', lineId }),
    clear: () => { if (order.lines.length) setSheet({ type: 'clear' }) },
    setDiscount: n => dispatch({ type: 'discount', amount: n }),
    setFee: n => dispatch({ type: 'fee', amount: n }),
    openDiscount: () => setSheet({ type: 'discount' }),
    openFee: () => setSheet({ type: 'fee' }),
    editCustomer: () => setSheet({ type: 'customer', mode, fresh: false, initial: order.customer }),
    print,
    openQueue: () => { if (features.queue) go('queue') },
    openSummary: () => {
      if (!features.summary) return
      const pin = String(config.security?.summaryPin || '')
      if (pin) setSheet({ type: 'pin', pin })
      else go('summary')
    },
    openAdmin: () => { location.href = '/admin' },
  }

  const ctx = {
    config,
    screen,
    editing: false,
    order,
    actions,
    ui: { category, setCategory, search, setSearch, printing, nextNumber: order.number ?? peekNumber() },
    money: n => money(n, config),
  }

  return (
    <div className="pos-root pos-theme" style={rootStyle}>
      {screen === 'home' ? <PosGrid layout={config.layouts.home} ctx={ctx} /> : null}
      {screen === 'order' ? <PosGrid layout={config.layouts.order} ctx={ctx} /> : null}
      {screen === 'queue' ? <QueueScreen config={config} onBack={() => go('home')} onAuthError={authError} /> : null}
      {screen === 'summary' ? <SummaryScreen config={config} onBack={() => go('home')} onAuthError={authError} /> : null}
      {renderSheet()}
      {notice ? <PrintNotice key={notice.key} notice={notice} config={config} onDone={() => setNotice(null)} /> : null}
    </div>
  )

  function renderSheet() {
    if (!sheet) return null
    switch (sheet.type) {
      case 'customer': {
        const fields = features.orderModes && sheet.mode?.fields?.length ? sheet.mode.fields : DEFAULT_FIELDS
        const save = values => {
          dispatch({ type: 'customer', customer: values })
          close()
          if (sheet.fresh) go('order')
        }
        return (
          <CustomerSheet
            key="customer" ctx={ctx} mode={features.orderModes ? sheet.mode : null} fields={fields}
            initial={sheet.initial} fresh={sheet.fresh}
            onSave={save} onSkip={() => { close(); go('order') }} onClose={close}
          />
        )
      }
      case 'resume': {
        const count = itemCount(order)
        const label = sheet.mode ? sheet.mode.label : 'this order'
        return (
          <Sheet
            title="An order is in progress" size="sm" onClose={close}
            footer={(
              <>
                <button type="button" className="pos-sbtn pos-sbtn--danger-text" onClick={() => beginMode(sheet.mode, false)}>Start new</button>
                <span className="pos-sheet__spacer" />
                <button
                  type="button" className="pos-sbtn pos-sbtn--primary"
                  onClick={() => (sheet.mode ? beginMode(sheet.mode, true) : (close(), go('order')))}
                >
                  Continue order
                </button>
              </>
            )}
          >
            <p className="pos-sheet__text">
              {count} item{count === 1 ? '' : 's'}, {ctx.money(orderTotals(order).total)}.
              {sheet.mode ? ` Continue it as ${label}, or start a new one and discard it.` : ' Continue it, or start a new one and discard it.'}
            </p>
          </Sheet>
        )
      }
      case 'choice':
        return (
          <ChoiceSheet
            ctx={ctx} item={sheet.item} onClose={close}
            onPick={choice => { dispatch({ type: 'add', item: sheet.item, choice }); close() }}
          />
        )
      case 'line': {
        const line = order.lines.find(l => l.id === sheet.lineId)
        if (!line) return null
        return (
          <LineSheet
            key={line.id} ctx={ctx} line={line} onClose={close}
            onSave={patch => { dispatch({ type: 'updateLine', lineId: line.id, patch }); close() }}
            onRemove={() => { dispatch({ type: 'remove', lineId: line.id }); close() }}
          />
        )
      }
      case 'discount':
      case 'fee':
        return (
          <AmountSheet
            key={sheet.type} ctx={ctx} kind={sheet.type} onClose={close}
            onApply={v => { dispatch({ type: sheet.type, ...v }); close() }}
          />
        )
      case 'clear': {
        const count = itemCount(order)
        return (
          <ConfirmSheet
            title="Clear this order?"
            body={`Removes ${count} item${count === 1 ? '' : 's'} and any discount. The order type and customer stay.`}
            confirmLabel="Clear" danger
            onConfirm={() => { dispatch({ type: 'clear' }); close() }} onCancel={close}
          />
        )
      }
      case 'pin':
        return <PinSheet pin={sheet.pin} onClose={close} onOk={() => { close(); go('summary') }} />
      case 'printError':
        return (
          <Sheet
            title="Order not sent" size="sm" onClose={close}
            footer={(
              <>
                <button type="button" className="pos-sbtn" onClick={close}>Back to order</button>
                <span className="pos-sheet__spacer" />
                <button type="button" className="pos-sbtn pos-sbtn--primary" onClick={print}>Try again</button>
              </>
            )}
          >
            <p className="pos-sheet__text">{sheet.message} The order is kept, nothing was printed.</p>
          </Sheet>
        )
      default:
        return null
    }
  }
}

function PrintNotice({ notice, config, onDone }) {
  // Through a ref, so taps on the next order don't keep restarting the timer.
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setTimeout(() => done.current(), 2600)
    return () => clearTimeout(t)
  }, [])
  const meta = [
    config.features.orderModes ? notice.mode?.label : null,
    money(notice.total, config),
    `${notice.copies} cop${notice.copies === 1 ? 'y' : 'ies'}`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="pos-notice" role="status">
      <button type="button" className="pos-notice__card" onClick={onDone}>
        <span className="pos-notice__icon"><Icon name="check" size={18} /></span>
        <span className="pos-notice__text">
          <span className="pos-notice__title">Order #{notice.number} sent to the printer</span>
          <span className="pos-notice__sub pos-num">{meta}</span>
        </span>
      </button>
    </div>
  )
}
