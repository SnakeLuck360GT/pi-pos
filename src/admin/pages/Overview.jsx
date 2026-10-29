import { useEffect, useState } from 'react'
import { Button, Empty, Icon, PageHeader, Section } from '../../ui/index.jsx'
import { isConnected, listJobs } from '../../lib/api.js'
import { DEFAULT_CONFIG } from '../../../shared/defaults.js'
import { money } from '../../../shared/order.js'
import { hrefFor } from '../shell/routes.js'
import { usePrinterStatus } from '../setup/PiConnect.jsx'
import { startOfDay } from './util.jsx'

const DISMISS_KEY = 'pipos.gettingStarted.dismissed'
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }

// Every check reads the saved config or the server, never the draft, so a
// row only ticks once the change is live.
function checklist(saved, printer, anyJob) {
  const D = DEFAULT_CONFIG
  return [
    { key: 'name', path: 'business', title: 'Name your shop', hint: 'Shown on the POS and on receipts.',
      done: !!saved.business.name?.trim() && saved.business.name !== D.business.name },
    { key: 'menu', path: 'menu', title: 'Add your menu', hint: 'Categories, items and prices.',
      done: !same(saved.items, D.items) || !same(saved.categories, D.categories) },
    { key: 'layout', path: 'layout', title: 'Arrange the POS screens', hint: 'Move and resize the blocks the tablet shows.',
      done: !same(saved.layouts, D.layouts) || !same(saved.theme, D.theme) },
    { key: 'receipt', path: 'receipt', title: 'Design the receipt', hint: 'Choose what prints, and how big.',
      done: !same(saved.receipt.blocks, D.receipt.blocks) || !same(saved.summary.blocks, D.summary.blocks) },
    { key: 'printer', path: 'printer', title: 'Connect the printer', hint: 'Run one command on the Raspberry Pi.',
      done: isConnected(printer) },
    { key: 'order', href: '/', title: 'Print the first order', hint: 'Take an order on the tablet and print it.',
      done: anyJob },
  ]
}

export default function Overview({ config, savedConfig, navigate }) {
  const saved = savedConfig || config
  const { printer } = usePrinterStatus(30000)
  const [jobs, setJobs] = useState(null) // { any, today: [] }
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    let alive = true
    Promise.all([listJobs({ limit: 1 }), listJobs({ since: startOfDay() })])
      .then(([latest, today]) => alive && setJobs({ any: latest.length > 0, today }))
      .catch(() => alive && setJobs({ any: false, today: [] }))
    return () => { alive = false }
  }, [])

  const rows = checklist(saved, printer, !!jobs?.any)
  const done = rows.filter(r => r.done).length
  const allDone = done === rows.length
  const showList = !(allDone && dismissed)

  const todays = (jobs?.today || []).filter(j => j.type === 'order' && j.status !== 'failed')
  const takings = todays.reduce((s, j) => s + (Number(j.total) || 0), 0)

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setDismissed(true)
  }

  return (
    <>
      <PageHeader title="Overview" description={saved.business.name} />

      {showList && (
        <Section
          title="Getting started" description={`${done} of ${rows.length} done`} className="pg-flush"
          actions={allDone ? <Button size="sm" variant="ghost" onClick={dismiss}>Dismiss</Button> : null}
        >
          <div className="ui-list">
            {rows.map(r => {
              const external = !!r.href
              return (
                <a
                  key={r.key} className="ui-list__row pg-step" href={r.href || hrefFor(r.path)}
                  target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined}
                  onClick={e => {
                    if (external || e.metaKey || e.ctrlKey || e.shiftKey) return
                    e.preventDefault()
                    navigate(r.path)
                  }}
                >
                  <span className={`pg-step__mark${r.done ? ' is-done' : ''}`} aria-label={r.done ? 'Done' : 'Not done'}>
                    {r.done && <Icon name="check" size={12} />}
                  </span>
                  <div className="pg-names">
                    <div className={r.done ? 'pg-step__done' : undefined}>{r.title}</div>
                    <div className="pg-sub">{r.hint}</div>
                  </div>
                  <Icon name={external ? 'external' : 'chevronRight'} className="pg-chev" />
                </a>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Today">
        {todays.length > 0
          ? (
            <div className="pg-today">
              <div>
                <div className="pg-today__label">Orders</div>
                <div className="pg-today__value">{todays.length}</div>
              </div>
              <div>
                <div className="pg-today__label">Takings</div>
                <div className="pg-today__value">{money(takings, saved)}</div>
              </div>
            </div>
          )
          : (
            <Empty
              title={jobs ? 'No orders yet today' : ' '}
              action={jobs ? <Button size="sm" icon="external" onClick={() => window.open('/', '_blank', 'noopener')}>Open POS</Button> : null}
            />
          )}
      </Section>
    </>
  )
}
