import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../ui/icons.jsx'
import { createJob, jobAction, listJobs, wakePrinter } from '../../lib/api.js'
import { money } from '../../../shared/order.js'
import { startOfDay } from '../useOrder.js'
import { Sheet } from '../sheets/Sheet.jsx'
import { Paper } from './Paper.jsx'
import { ScreenBar, StatusBadge, errorMessage, jobCustomer, jobItems, jobTitle, timeOf, withTimeout } from './jobs.jsx'

const REFRESH_MS = 8000

const wake = (config, id) => Promise.resolve().then(() => wakePrinter(config, id)).catch(() => {})

export function QueueScreen({ config, onBack, onAuthError }) {
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const locale = config.business.locale

  const load = useCallback(async () => {
    try {
      const res = await withTimeout(listJobs({ status: 'all', since: startOfDay(), limit: 200 }))
      setJobs(res?.jobs || [])
      setError('')
    } catch (err) {
      if (err?.status === 401) return onAuthError()
      setError(errorMessage(err))
    }
  }, [onAuthError])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const run = async (job, fn) => {
    setBusyId(job.id)
    try {
      await withTimeout(fn())
      await load()
    } catch (err) {
      if (err?.status === 401) return onAuthError()
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const retry = job => run(job, async () => {
    await jobAction(job.id, 'retry')
    wake(config, job.id)
  })

  // A reprint is a new job with the same paper, one copy: usually one ticket went missing.
  const reprint = job => run(job, async () => {
    const { id } = await createJob({
      type: job.type, order: job.order, summary: job.summary, total: job.total, copies: 1, doc: job.doc,
    })
    wake(config, id)
  })

  const open = jobs?.find(j => j.id === openId) || null
  const counts = (jobs || []).reduce((c, j) => ({ ...c, [j.status]: (c[j.status] || 0) + 1 }), {})
  const sub = jobs ? [`${jobs.length} today`, counts.pending ? `${counts.pending} waiting` : null, counts.failed ? `${counts.failed} failed` : null].filter(Boolean).join(' · ') : ''

  return (
    <div className="pos-screen">
      <ScreenBar title="Print queue" sub={sub} onBack={onBack}>
        <button type="button" className="pos-sbtn" onClick={load} aria-label="Refresh">
          <Icon name="refresh" size={18} /> Refresh
        </button>
      </ScreenBar>
      <div className="pos-screen__body pos-scroll">
        <div className="pos-screen__inner">
          {error ? <p className="pos-banner">{error}</p> : null}
          {jobs == null && !error ? <p className="pos-empty">Loading…</p> : null}
          {jobs && !jobs.length ? <p className="pos-empty">No prints yet today</p> : null}
          {jobs && jobs.length ? (
            <ul className="pos-list">
              {jobs.map(job => (
                <li key={job.id} className="pos-job">
                  <button type="button" className="pos-job__open" onClick={() => setOpenId(job.id)}>
                    <span className="pos-job__time pos-num">{timeOf(job.createdAt, locale)}</span>
                    <span className="pos-job__main">
                      <span className="pos-job__title">{jobTitle(config, job)}</span>
                      <span className="pos-job__items">
                        {job.status === 'failed' && job.error ? job.error : [jobCustomer(job), jobItems(job)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {job.total != null ? <span className="pos-job__total pos-num">{money(job.total, config)}</span> : <span />}
                    <StatusBadge status={job.status} />
                  </button>
                  <JobAction job={job} busy={busyId === job.id} onRetry={retry} onReprint={reprint} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {open ? (
        <Sheet
          title={jobTitle(config, open)} subtitle={`${timeOf(open.createdAt, locale)} · ${open.copies || 1} cop${(open.copies || 1) === 1 ? 'y' : 'ies'}`}
          size="sm" onClose={() => setOpenId(null)}
          footer={(
            <>
              <StatusBadge status={open.status} />
              <span className="pos-sheet__spacer" />
              <JobAction job={open} busy={busyId === open.id} onRetry={retry} onReprint={reprint} primary />
            </>
          )}
        >
          {open.status === 'failed' && open.error ? <p className="pos-banner">{open.error}</p> : null}
          <div className="pos-paper-wrap"><Paper doc={open.doc} width={320} /></div>
        </Sheet>
      ) : null}
    </div>
  )
}

function JobAction({ job, busy, onRetry, onReprint, primary }) {
  const cls = `pos-sbtn${primary ? ' pos-sbtn--primary' : ''}`
  if (busy) return <button type="button" className={cls} disabled>Sending…</button>
  // Pending jobs can be nudged too: a Pi that missed its wake-up picks them up again.
  if (job.status === 'failed' || job.status === 'pending') {
    return <button type="button" className={cls} onClick={() => onRetry(job)}>Retry</button>
  }
  if (!job.doc) return <span />
  return <button type="button" className={cls} onClick={() => onReprint(job)}>Reprint</button>
}
