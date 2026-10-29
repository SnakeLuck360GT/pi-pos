import { useEffect, useState } from 'react'
import { Button, Field, Input, NumberInput, PageHeader, Section, Segmented, Select } from '../../ui/index.jsx'
import { listJobs } from '../../lib/api.js'
import { setPath } from '../../lib/fields.js'
import { DEFAULT_CONFIG } from '../../../shared/defaults.js'
import PiConnect, { usePrinterStatus } from '../setup/PiConnect.jsx'
import { CodeBox, timeAgo } from './util.jsx'

const PAPER = [
  { value: 48, label: '80 mm' },
  { value: 32, label: '58 mm' },
]

const ENCODINGS = [
  { value: 'utf8', label: 'UTF-8' },
  { value: 'gb2312', label: 'GB2312' },
]

const randomTopic = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `pipos-${[...bytes].map(b => (b % 36).toString(36)).join('')}`
}

function LastPrinted() {
  const [text, setText] = useState('')
  useEffect(() => {
    let alive = true
    Promise.all([listJobs({ status: 'printed', limit: 1 }), listJobs({ status: 'pending', limit: 50 })])
      .then(([printed, pending]) => {
        if (!alive) return
        const last = printed[0]
        const parts = [last ? `Last job printed ${timeAgo(last.printedAt || last.createdAt)}.` : 'Nothing printed yet.']
        if (pending.length) parts.push(`${pending.length} waiting in the queue.`)
        setText(parts.join(' '))
      })
      .catch(e => alive && setText(e.message))
    return () => { alive = false }
  }, [])
  return <div className="pg-sub">{text || ' '}</div>
}

export default function Printer({ config, savedConfig, update }) {
  const set = (path, v) => update(d => setPath(d, path, v))
  const p = config.printer
  const cols = config.receipt.paperCols
  const { printer } = usePrinterStatus(0)
  const topicChanged = (p.ntfyTopic || '') !== (savedConfig?.printer?.ntfyTopic || '')

  const env = [
    `API_BASE=${location.origin}`,
    `PRINTER_KEY=${printer?.printerKey || ''}`,
    `NTFY_URL=${savedConfig?.printer?.ntfyUrl || DEFAULT_CONFIG.printer.ntfyUrl}`,
    `NTFY_TOPIC=${savedConfig?.printer?.ntfyTopic || ''}`,
    'PRINTER=/dev/usb/lp0',
  ].join('\n')

  return (
    <>
      <PageHeader title="Printer" description="Paper, encoding and the Raspberry Pi that drives the printer." />

      <Section title="Connect a Pi" description="Orders print through a Raspberry Pi next to the printer.">
        <PiConnect config={config} testAlways />
        <LastPrinted />
      </Section>

      <Section title="Paper">
        <div className="ui-grid-2">
          <Field label="Paper width" hint={`${PAPER.some(x => x.value === cols) ? cols : `${cols} (custom)`} characters per line at normal size.`}>
            <Segmented value={cols} options={PAPER} onChange={v => set('receipt.paperCols', v)} />
          </Field>
          <Field label="Encoding" hint="Use GB2312 if Chinese prints as garbage. Common on cheap 58 mm printers.">
            <Select value={p.encoding} options={ENCODINGS} onChange={v => set('printer.encoding', v)} />
          </Field>
          <Field label="Line spacing" hint="Dots per line at normal height. 0 uses the printer default.">
            <NumberInput value={config.receipt.lineSpacing} min={0} max={255} onChange={v => set('receipt.lineSpacing', v ?? 0)} className="pg-input-short" />
          </Field>
        </div>
      </Section>

      <Section title="Wake-up" description="The tablet pings this ntfy topic after each order so the Pi prints straight away.">
        <div className="ui-grid-2">
          <Field label="ntfy server">
            <Input value={p.ntfyUrl} onChange={e => set('printer.ntfyUrl', e.target.value.trim())} spellCheck={false} placeholder="https://ntfy.sh" />
          </Field>
          <Field
            label="Topic"
            hint={topicChanged
              ? 'Changed. After saving, pair the Pi again so it listens on the new topic.'
              : p.ntfyTopic ? 'Anyone with the topic can wake the printer, but not read orders.' : 'Made for you when you save.'}
          >
            <div className="ui-row">
              <Input value={p.ntfyTopic} onChange={e => set('printer.ntfyTopic', e.target.value.trim())} spellCheck={false} className="ui-mono" placeholder="Generated on save" />
              <Button onClick={() => set('printer.ntfyTopic', randomTopic())}>Regenerate</Button>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Manual setup" description="If you'd rather not use the installer, put this in pi-bridge/.env on the Pi.">
        <CodeBox text={env} multiline />
      </Section>
    </>
  )
}
