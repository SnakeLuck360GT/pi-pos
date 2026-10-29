// "Connect a Pi": the one-line installer, live connection status and a test
// print. Used by the setup wizard and the Printer page.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Icon, Spinner } from '../../ui/index.jsx'
import { getPrinter, installCommand, isConnected, pairPi } from '../../lib/api.js'
import { CodeBox, timeAgo } from '../pages/util.jsx'
import { sendTestPrint, waitForJob } from './testPrint.js'

export const DOCS_PI = 'https://snakeluck360gt.github.io/pi-pos/#raspberry-pi'

// Polls GET /api/printer. Shared so the Printer page can show the same status.
export function usePrinterStatus(every = 3000) {
  const [printer, setPrinter] = useState(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try {
      setPrinter(await getPrinter())
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [])
  useEffect(() => {
    refresh()
    if (!every) return
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') refresh() }, every)
    return () => clearInterval(t)
  }, [refresh, every])
  return { printer, error, refresh }
}

// A pairing code that renews itself shortly before it expires.
function usePairCode() {
  const [pair, setPair] = useState(null)
  const [error, setError] = useState('')
  const timer = useRef()
  const seq = useRef(0)
  const renew = useCallback(async () => {
    clearTimeout(timer.current)
    // Only one code is live on the server, so the newest request must win
    // even if an older one answers later.
    const n = ++seq.current
    try {
      const p = await pairPi()
      if (n !== seq.current) return
      setPair(p)
      setError('')
      timer.current = setTimeout(renew, Math.max(5000, p.expiresAt - Date.now() - 30000))
    } catch (e) {
      if (n === seq.current) setError(e.message)
    }
  }, [])
  useEffect(() => {
    // Deferred so StrictMode's mount-unmount-mount sends one request, not two
    // that could land on the server in the wrong order.
    timer.current = setTimeout(renew, 0)
    return () => { seq.current++; clearTimeout(timer.current) }
  }, [renew])
  return { pair, error, renew }
}

export function PrinterStatus({ printer, error }) {
  if (error) return <div className="pi-status is-error">{error}</div>
  if (!printer) return <div className="pi-status"><Spinner /> Checking…</div>
  const b = printer.bridge
  if (!isConnected(printer)) {
    return (
      <div className="pi-status">
        <Spinner />
        <span>Waiting for the Pi…{printer.lastSeen ? <span className="pg-muted"> Last seen {timeAgo(printer.lastSeen)}.</span> : null}</span>
      </div>
    )
  }
  return (
    <div className="pi-status">
      <Icon name="check" className="pi-status__ok" />
      <span>
        Connected: {b?.hostname || 'Raspberry Pi'}
        <span className="pg-muted"> · seen {timeAgo(printer.lastSeen)}</span>
        {b?.ok === false && <span className="pi-status__warn"> · Printer problem: {b.error || 'unknown'}</span>}
      </span>
    </div>
  )
}

// `testAlways`: offer the test print before the Pi is connected (it waits in the queue).
export default function PiConnect({ config, poll = 3000, testAlways = false }) {
  const { pair, error: pairError, renew } = usePairCode()
  const { printer, error } = usePrinterStatus(poll)
  const [test, setTest] = useState(null) // { state: 'sending'|'waiting'|'printed'|'failed'|'timeout', error }

  async function testPrint() {
    setTest({ state: 'sending' })
    try {
      const id = await sendTestPrint(config, { printer: { ntfyUrl: printer?.ntfyUrl, ntfyTopic: printer?.ntfyTopic } })
      setTest({ state: 'waiting' })
      const job = await waitForJob(id)
      if (!job) setTest({ state: 'timeout' })
      else setTest({ state: job.status, error: job.error })
    } catch (e) {
      setTest({ state: 'failed', error: e.message })
    }
  }

  const connected = isConnected(printer)
  const busy = test?.state === 'sending' || test?.state === 'waiting'

  return (
    <div className="pi-connect">
      {pairError
        ? <div className="pi-status is-error">{pairError} <Button size="sm" onClick={renew}>Try again</Button></div>
        : pair
          ? <CodeBox text={installCommand(pair.code)} />
          : <div className="pi-status"><Spinner /> Making a setup code…</div>}
      <p className="pg-sub">
        Run this on the Raspberry Pi with the printer plugged in. The code works for 15 minutes and renews while this page is open.
        {' '}<a href={DOCS_PI} target="_blank" rel="noopener">Setting up the Pi for the first time?</a>
      </p>

      <div className="pi-connect__row">
        <PrinterStatus printer={printer} error={error} />
        {(connected || testAlways) && (
          <Button size="sm" icon="printer" onClick={testPrint} disabled={busy}>Send test print</Button>
        )}
      </div>
      {test && (
        <div className={`pg-sub${test.state === 'failed' ? ' pg-danger' : ''}`}>
          {{
            sending: 'Sending…',
            waiting: 'Waiting for the printer…',
            printed: 'Printed.',
            failed: `Failed: ${test.error || 'unknown error'}`,
            timeout: 'Not printed yet. It stays in the queue; check Orders.',
          }[test.state]}
        </div>
      )}
    </div>
  )
}
