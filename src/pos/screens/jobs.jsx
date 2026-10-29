import { Icon } from '../../ui/icons.jsx'
import { findMode } from '../../../shared/order.js'

export function ScreenBar({ title, sub, onBack, children }) {
  return (
    <header className="pos-bar">
      <button type="button" className="pos-sbtn" onClick={onBack}>
        <Icon name="chevronLeft" size={18} /> Back
      </button>
      <div className="pos-bar__titles">
        <h1 className="pos-bar__title">{title}</h1>
        {sub ? <p className="pos-bar__sub">{sub}</p> : null}
      </div>
      <div className="pos-bar__actions">{children}</div>
    </header>
  )
}

export const timeOf = (ts, locale) =>
  ts ? new Date(ts).toLocaleTimeString(locale || 'en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

export function jobTitle(config, job) {
  if (job.type === 'summary') return 'Daily summary'
  if (job.type === 'test') return 'Test print'
  const o = job.order || {}
  const mode = config.features.orderModes ? findMode(config, o.mode) : null
  return [o.number != null ? `#${o.number}` : null, mode?.label].filter(Boolean).join('  ') || 'Order'
}

// "2× Spring Rolls, Coke": enough to recognise an order at a glance.
export function jobItems(job) {
  const lines = job.order?.lines || []
  return lines.map(l => `${l.qty > 1 ? `${l.qty}× ` : ''}${l.name}${l.choice?.name ? ` ${l.choice.name}` : ''}`).join(', ')
}

export function jobCustomer(job) {
  const c = job.order?.customer || {}
  return [c.name, c.phone].filter(Boolean).join(' · ')
}

const STATUS = { pending: 'Waiting', printed: 'Printed', failed: 'Failed' }

export function StatusBadge({ status }) {
  return <span className={`pos-badge pos-badge--${status}`}>{STATUS[status] || status}</span>
}

export function errorMessage(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'This tablet is offline.'
  if (err?.status === 401) return 'This tablet is no longer connected.'
  if (err?.name === 'TimeoutError') return 'The server took too long to answer.'
  return err?.message || 'Could not reach the server.'
}

export function withTimeout(promise, ms = 15000) {
  let t
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => {
      const e = new Error('Timed out')
      e.name = 'TimeoutError'
      reject(e)
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}
