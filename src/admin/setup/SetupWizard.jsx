// First-run setup. Opens after the first sign-in on a shop that has never
// saved, and again from "Setup" in the sidebar. Each Continue saves through
// the normal draft flow, so leaving halfway loses nothing.
import { useState } from 'react'
import { Button, Field, Icon, Input, NumberInput, Spinner, Toggle } from '../../ui/index.jsx'
import { setPath } from '../../lib/fields.js'
import { CopyButton, nameOf } from '../pages/util.jsx'
import PiConnect from './PiConnect.jsx'
import './setup.css'

const STEPS = [
  { key: 'shop', title: 'Your shop', desc: 'This goes at the top of the POS and on receipts.' },
  { key: 'modes', title: 'How you take orders', desc: 'Turn on the order types you use. You can add more later.' },
  { key: 'paper', title: 'Printer paper', desc: 'Pick the roll width your printer takes.' },
  { key: 'pi', title: 'Connect the printer', desc: 'The printer is driven by a Raspberry Pi next to it.', optional: true },
  { key: 'tablet', title: 'Open the POS on your tablet', desc: 'Any tablet with a browser works.', optional: true },
]

export default function SetupWizard({ config, update, save, saving, saveError, onClose }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const set = (path, v) => update(d => setPath(d, path, v))
  const canContinue = s.key !== 'shop' || !!config.business.name.trim()

  async function next() {
    if (!(await save())) return
    if (last) onClose()
    else setStep(step + 1)
  }

  return (
    <div className="su">
      <header className="su-top">
        <span className="su-top__app">PiPOS</span>
        <Button variant="ghost" size="sm" onClick={onClose}>Exit setup</Button>
      </header>

      <main className="su-body">
        <div className="su-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          <span className="su-progress__text">Step {step + 1} of {STEPS.length}</span>
          <div className="su-progress__bars">
            {STEPS.map((x, i) => <span key={x.key} className={i <= step ? 'is-on' : undefined} />)}
          </div>
        </div>

        <h1 className="su-title">{s.title}</h1>
        <p className="su-desc">{s.desc}</p>

        <div className="su-content">
          {s.key === 'shop' && <ShopStep config={config} set={set} />}
          {s.key === 'modes' && <ModesStep config={config} update={update} />}
          {s.key === 'paper' && <PaperStep config={config} set={set} />}
          {s.key === 'pi' && <PiConnect config={config} />}
          {s.key === 'tablet' && <TabletStep />}
        </div>

        <footer className="su-foot">
          {step > 0 && <Button onClick={() => setStep(step - 1)} disabled={saving}>Back</Button>}
          <div className="ui-spacer" />
          {s.optional && !last && <Button variant="ghost" onClick={() => setStep(step + 1)} disabled={saving}>Skip</Button>}
          <Button variant="primary" onClick={next} disabled={saving || !canContinue}>
            {saving ? <Spinner /> : last ? 'Finish' : 'Continue'}
          </Button>
        </footer>
        {saveError && <p className="su-error" role="alert">Could not save: {saveError}</p>}
      </main>
    </div>
  )
}

function ShopStep({ config, set }) {
  const b = config.business
  const alt = config.features.altNames
  return (
    <div className="ui-stack">
      <Field label="Shop name">
        <Input value={b.name} onChange={e => set('business.name', e.target.value)} autoFocus onFocus={e => b.name === 'My Shop' && e.target.select()} />
      </Field>
      <Field hint="Adds a second name to the shop, items and options, on screen and on paper." inline>
        <Toggle checked={alt} onChange={v => set('features.altNames', v)} label="Use a second language" />
      </Field>
      {alt && (
        <Field label="Second-language name">
          <Input value={b.nameAlt || ''} placeholder="Optional" onChange={e => set('business.nameAlt', e.target.value)} />
        </Field>
      )}
      <Field label="Currency symbol">
        <Input value={b.currency} onChange={e => set('business.currency', e.target.value)} maxLength={4} className="pg-input-short" />
      </Field>
    </div>
  )
}

function ModesStep({ config, update }) {
  const patchMode = (id, p) => update(d => {
    const modes = d.modes.map(m => (m.id === id ? { ...m, ...p } : m))
    // With every type off there's nothing to choose, so the POS skips the choice.
    return { ...d, modes, features: { ...d.features, orderModes: modes.some(m => m.enabled) } }
  })
  const setEta = (m, i, v) => patchMode(m.id, { eta: (m.eta?.length ? m.eta : [20]).map((x, j) => (j === i ? Math.max(0, v ?? 0) : x)) })
  const anyOn = config.modes.some(m => m.enabled)

  return (
    <div className="su-list">
      {config.modes.map(m => {
        const eta = m.eta?.length ? m.eta : [20]
        return (
          <div key={m.id} className="su-mode">
            <Toggle checked={m.enabled} onChange={enabled => patchMode(m.id, { enabled })} label={nameOf(m)} />
            {m.enabled && (
              <div className="su-mode__eta">
                <span className="pg-muted">Ready in</span>
                <NumberInput value={eta[0]} min={0} onChange={v => setEta(m, 0, v)} aria-label="Minutes" className="su-num" />
                {eta.length > 1 && <><span className="pg-muted">to</span><NumberInput value={eta[1]} min={0} onChange={v => setEta(m, 1, v)} aria-label="Minutes, upper" className="su-num" /></>}
                <span className="pg-muted">min</span>
              </div>
            )}
          </div>
        )
      })}
      {!anyOn && <p className="pg-sub su-pad">With both off, the POS goes straight to a plain order.</p>}
    </div>
  )
}

const PAPERS = [
  { cols: 48, title: '80 mm', desc: '48 characters per line. Most counter printers.' },
  { cols: 32, title: '58 mm', desc: '32 characters per line. Smaller and portable printers.' },
]

function PaperStep({ config, set }) {
  const cols = config.receipt.paperCols
  return (
    <div className="ui-stack">
      <div className="su-cards" role="radiogroup">
        {PAPERS.map(p => (
          <button
            key={p.cols} type="button" role="radio" aria-checked={cols === p.cols}
            className={`su-card${cols === p.cols ? ' is-on' : ''}`} onClick={() => set('receipt.paperCols', p.cols)}
          >
            <span className="su-card__title">{p.title}{cols === p.cols && <Icon name="check" />}</span>
            <span className="su-card__desc">{p.desc}</span>
          </button>
        ))}
      </div>
      <Field hint="Switches to GB2312, which many cheap 58 mm printers need." inline>
        <Toggle
          checked={config.printer.encoding === 'gb2312'} label="My printer prints Chinese as garbage"
          onChange={v => set('printer.encoding', v ? 'gb2312' : 'utf8')}
        />
      </Field>
    </div>
  )
}

function TabletStep() {
  const url = location.origin
  return (
    <div className="ui-stack">
      <div className="su-url">
        <span className="su-url__text">{url}</span>
        <CopyButton text={url} />
      </div>
      <p className="pg-sub">Open this on the tablet and enter your admin password once.</p>
      <div>
        <Button icon="external" onClick={() => window.open('/', '_blank', 'noopener')}>Open POS</Button>
      </div>
    </div>
  )
}
