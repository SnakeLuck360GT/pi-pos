import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../ui/icons.jsx'
import { createJob, listJobs, wakePrinter } from '../../lib/api.js'
import { buildSummary, renderSummary } from '../../../shared/receipt.js'
import { money } from '../../../shared/order.js'
import { startOfDay } from '../useOrder.js'
import { altText } from '../blocks/shared.jsx'
import { Sheet } from '../sheets/Sheet.jsx'
import { Paper } from './Paper.jsx'
import { ScreenBar, StatusBadge, errorMessage, jobCustomer, jobItems, jobTitle, timeOf, withTimeout } from './jobs.jsx'

// Same rule as buildSummary: printed and waiting orders count, failed ones don't.
const counts = j => j.type === 'order' && (j.status === 'printed' || j.status === 'pending')

export function SummaryScreen({ config, onBack, onAuthError }) {
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState(false)
  const [sent, setSent] = useState(false)
  const [preview, setPreview] = useState(false)
  const locale = config.business.locale
  const fmt = n => money(n, config)
  const ctxLike = { config }

  const load = useCallback(async () => {
    try {
      const res = await withTimeout(listJobs({ status: 'all', since: startOfDay(), limit: 500 }))
      setJobs(res?.jobs || [])
      setError('')
    } catch (err) {
      if (err?.status === 401) return onAuthError()
      setError(errorMessage(err))
    }
  }, [onAuthError])

  useEffect(() => { load() }, [load])

  // Stats come from buildSummary so the screen and the printed paper agree.
  const summary = useMemo(() => (jobs ? buildSummary(config, jobs, Date.now()) : null), [config, jobs])
  const doc = useMemo(() => {
    if (!summary) return null
    try { return renderSummary(config, summary, { now: Date.now() }) } catch { return null }
  }, [config, summary])

  const orders = useMemo(() => (jobs || []).filter(counts).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), [jobs])
  const failed = (jobs || []).filter(j => j.type === 'order' && j.status === 'failed').length

  const print = async () => {
    if (!jobs || printing) return
    setPrinting(true)
    setError('')
    try {
      const now = Date.now()
      const fresh = buildSummary(config, jobs, now)
      const paper = renderSummary(config, fresh, { now })
      const { id } = await withTimeout(createJob({ type: 'summary', summary: fresh, total: fresh.total, copies: 1, doc: paper }))
      Promise.resolve().then(() => wakePrinter(config, id)).catch(() => {})
      setSent(true)
      setTimeout(() => setSent(false), 2500)
    } catch (err) {
      if (err?.status === 401) return onAuthError()
      setError(`Summary not sent. ${errorMessage(err)}`)
    } finally {
      setPrinting(false)
    }
  }

  const date = new Date().toLocaleDateString(locale || 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="pos-screen">
      <ScreenBar title="Today" sub={date} onBack={onBack}>
        <button type="button" className="pos-sbtn" disabled={!doc} onClick={() => setPreview(true)}>
          <Icon name="eye" size={18} /> Preview
        </button>
        <button type="button" className="pos-sbtn pos-sbtn--primary" disabled={!jobs || printing} onClick={print}>
          {sent ? <><Icon name="check" size={18} /> Sent</> : printing ? 'Sending…' : <><Icon name="printer" size={18} /> Print summary</>}
        </button>
      </ScreenBar>
      <div className="pos-screen__body pos-scroll">
        <div className="pos-screen__inner">
          {error ? <p className="pos-banner">{error}</p> : null}
          {jobs == null && !error ? <p className="pos-empty">Loading…</p> : null}
          {summary ? (
            <>
              <div className="pos-stats">
                <div className="pos-stat pos-stat--main">
                  <span className="pos-stat__label">Total</span>
                  <span className="pos-stat__value pos-num">{fmt(summary.total)}</span>
                  <span className="pos-stat__sub pos-num">{summary.count} order{summary.count === 1 ? '' : 's'}{failed ? ` · ${failed} failed, not counted` : ''}</span>
                </div>
                {(config.features.orderModes ? summary.modes : []).map(r => (
                  <div key={r.id ?? 'none'} className="pos-stat">
                    <span className="pos-stat__label">
                      {r.label || 'Orders'}
                      {altText(ctxLike, r.labelAlt) ? <span className="pos-alt"> {r.labelAlt}</span> : null}
                    </span>
                    <span className="pos-stat__value pos-num">{fmt(r.total)}</span>
                    <span className="pos-stat__sub pos-num">{r.count} order{r.count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>

              <h2 className="pos-section-title">Orders</h2>
              {orders.length ? (
                <ul className="pos-list">
                  {orders.map(j => (
                    <li key={j.id} className="pos-job pos-job--static">
                      <div className="pos-job__open">
                        <span className="pos-job__time pos-num">{timeOf(j.createdAt, locale)}</span>
                        <span className="pos-job__main">
                          <span className="pos-job__title">{jobTitle(config, j)}</span>
                          <span className="pos-job__items">{[jobCustomer(j), jobItems(j)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="pos-job__total pos-num">{fmt(j.total)}</span>
                        {j.status === 'pending' ? <StatusBadge status="pending" /> : <span />}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="pos-empty">No orders yet today</p>}
            </>
          ) : null}
        </div>
      </div>

      {preview && doc ? (
        <Sheet title="Summary preview" size="sm" onClose={() => setPreview(false)}>
          <div className="pos-paper-wrap"><Paper doc={doc} width={320} /></div>
        </Sheet>
      ) : null}
    </div>
  )
}
