import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Empty, Icon, IconButton, Modal, PageHeader, Section, Segmented, Spinner } from '../../ui/index.jsx'
import { createJob, jobAction, listJobs, wakePrinter } from '../../lib/api.js'
import { findMode, itemCount, money } from '../../../shared/order.js'
import ReceiptPaper from '../../receipt/ReceiptPaper.jsx'
import { nameOf, startOfDay } from './util.jsx'

const DAY = 24 * 60 * 60 * 1000
const POLL_MS = 15000

const STATUS = {
  printed: { tone: 'success', label: 'Printed' },
  pending: { tone: 'warn', label: 'Waiting' },
  failed: { tone: 'danger', label: 'Failed' },
}

export function jobTitle(job, config) {
  if (job.type === 'summary') return 'Summary'
  if (job.type === 'test') return 'Test print'
  const mode = job.order?.mode ? findMode(config, job.order.mode) : null
  const label = mode ? mode.short || mode.label : 'Order'
  return job.order?.number != null ? `${label} #${job.order.number}` : label
}

function jobDetail(job) {
  if (job.type !== 'order' || !job.order) return ''
  const n = itemCount(job.order)
  const who = job.order.customer?.name
  return [`${n} ${n === 1 ? 'item' : 'items'}`, who].filter(Boolean).join(' · ')
}

function when(ms, locale, withDate) {
  const d = new Date(ms)
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (!withDate) return time
  return `${d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}

export default function Orders({ config, savedConfig }) {
  const [range, setRange] = useState('today')
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const locale = config.business.locale || undefined

  const load = useCallback(async () => {
    const since = range === 'today' ? startOfDay() : startOfDay() - 6 * DAY
    try {
      setJobs(await listJobs({ since, limit: 1000 }))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [range])

  useEffect(() => {
    setJobs(null)
    load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') load() }, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const orders = (jobs || []).filter(j => j.type === 'order' && j.status !== 'failed')
  const takings = orders.reduce((s, j) => s + (Number(j.total) || 0), 0)
  const open = openId && jobs?.find(j => j.id === openId)

  return (
    <>
      <PageHeader
        title="Orders" description="Everything sent to the printer. Jobs are kept for 30 days."
        actions={<>
          <Segmented
            value={range} onChange={setRange} size="sm"
            options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }]}
          />
          <IconButton icon="refresh" label="Refresh" variant="secondary" onClick={load} />
        </>}
      />

      {jobs && orders.length > 0 && (
        <div className="pg-stats">
          <span>{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span>
          <span className="pg-muted">·</span>
          <span className="pg-money-inline">{money(takings, config)}</span>
        </div>
      )}

      <Section className="pg-flush">
        {error && !jobs
          ? <Empty title="Could not load orders" action={<Button size="sm" onClick={load}>Try again</Button>}>{error}</Empty>
          : !jobs
            ? <div className="pg-loading"><Spinner /></div>
            : jobs.length === 0
              ? <Empty title={range === 'today' ? 'No orders today' : 'No orders in the last 7 days'} action={range === 'today' ? <Button size="sm" onClick={() => setRange('week')}>Show last 7 days</Button> : null} />
              : (
                <div className="ui-list">
                  {jobs.map(j => (
                    <div
                      key={j.id} className="ui-list__row pg-job pg-clickable" role="button" tabIndex={0}
                      onClick={() => setOpenId(j.id)}
                      onKeyDown={e => { if (e.key === 'Enter') setOpenId(j.id) }}
                    >
                      <span className={`pg-col-time${range !== 'today' ? ' is-long' : ''}`}>{when(j.createdAt, locale, range !== 'today')}</span>
                      <div className="pg-names">
                        <div className="pg-ellipsis">{jobTitle(j, config)}</div>
                        {jobDetail(j) && <div className="pg-sub pg-ellipsis">{jobDetail(j)}</div>}
                      </div>
                      <span className="pg-col-status" title={j.error || undefined}>
                        <Badge tone={STATUS[j.status]?.tone}>{STATUS[j.status]?.label || j.status}</Badge>
                      </span>
                      <span className="pg-money">{j.total != null && j.type === 'order' ? money(j.total, config) : ''}</span>
                      <Icon name="chevronRight" className="pg-chev" />
                    </div>
                  ))}
                </div>
              )}
      </Section>
      {error && jobs && <div className="pg-sub pg-danger pg-after">{error}</div>}

      {open && (
        <JobModal
          job={open} config={config} wake={savedConfig || config} locale={locale}
          onClose={() => setOpenId(null)} onChanged={load}
        />
      )}
    </>
  )
}

function JobModal({ job, config, wake, locale, onClose, onChanged }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(name, fn) {
    setBusy(name)
    setError('')
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const reprint = () => run('reprint', async () => {
    const { id } = await createJob({ type: job.type, order: job.order, summary: job.summary, total: job.total, copies: job.copies, doc: job.doc })
    wakePrinter(wake, id)
    onClose()
  })
  const retry = () => run('retry', async () => {
    await jobAction(job.id, 'retry')
    wakePrinter(wake, job.id)
  })
  const remove = () => run('delete', async () => {
    await jobAction(job.id, 'delete')
    onClose()
  })

  const st = STATUS[job.status]
  const mode = job.order?.mode ? findMode(config, job.order.mode) : null

  return (
    <Modal
      title={jobTitle(job, config)} onClose={onClose} width={560}
      footer={confirmDelete
        ? <>
          <span className="pg-sub pg-foot-note">Delete this job from the history?</span>
          <div className="ui-spacer" />
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove} disabled={!!busy}>Delete</Button>
        </>
        : <>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
          <div className="ui-spacer" />
          {job.status !== 'printed' && <Button onClick={retry} disabled={!!busy}>{busy === 'retry' ? <Spinner /> : 'Retry'}</Button>}
          <Button variant="primary" icon="printer" onClick={reprint} disabled={!!busy}>{busy === 'reprint' ? 'Sending…' : 'Reprint'}</Button>
        </>}
    >
      <dl className="pg-meta">
        <dt>Status</dt><dd><Badge tone={st?.tone}>{st?.label || job.status}</Badge></dd>
        <dt>Sent</dt><dd>{when(job.createdAt, locale, true)}</dd>
        {job.printedAt && <><dt>Printed</dt><dd>{when(job.printedAt, locale, true)}</dd></>}
        {mode && <><dt>Order type</dt><dd>{nameOf(mode)}</dd></>}
        {job.type === 'order' && job.total != null && <><dt>Total</dt><dd className="pg-money-inline">{money(job.total, config)}</dd></>}
        <dt>Copies</dt><dd>{job.copies}</dd>
        {job.error && <><dt>Error</dt><dd className="pg-danger">{job.error}</dd></>}
      </dl>
      {error && <div className="pg-sub pg-danger">{error}</div>}
      <div className="pg-paper">
        {job.doc ? <ReceiptPaper doc={job.doc} width={320} /> : <div className="pg-sub">No receipt stored for this job.</div>}
      </div>
    </Modal>
  )
}
