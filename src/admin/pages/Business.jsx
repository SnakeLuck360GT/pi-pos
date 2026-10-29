import { Field, Input, PageHeader, Section, Textarea, Toggle } from '../../ui/index.jsx'
import { setPath } from '../../lib/fields.js'

const FEATURES = [
  { key: 'orderModes', label: 'Order types', desc: 'Takeaway, delivery and so on. Off gives one plain order flow.' },
  { key: 'modifiers', label: 'Modifiers', desc: 'Add and remove options on order lines, like "No onion".' },
  { key: 'altNames', label: 'Second language', desc: 'Show a second name for the shop, items and options, on screen and on paper.' },
  { key: 'queue', label: 'Print queue', desc: 'A POS screen listing today\'s print jobs, with retry and reprint.' },
  { key: 'summary', label: 'End-of-day summary', desc: 'Totals by order type, printable from the POS.' },
]

function localeExample(locale) {
  try {
    const now = new Date()
    const date = now.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    return `Dates print as ${date} ${time}.`
  } catch {
    return 'Not a locale this browser knows. Try en-GB or zh-HK.'
  }
}

export default function Business({ config, update }) {
  const b = config.business
  const f = config.features
  const set = (path, v) => update(d => setPath(d, path, v))
  const bind = key => ({ value: b[key] ?? '', onChange: e => set(`business.${key}`, e.target.value) })

  return (
    <>
      <PageHeader title="Business" description="Shown on the POS and on receipts." />

      <Section title="Details">
        <div className="ui-grid-2">
          <Field label="Shop name"><Input {...bind('name')} /></Field>
          {f.altNames
            ? <Field label="Second-language name"><Input {...bind('nameAlt')} placeholder="Optional" /></Field>
            : <div />}
          <Field label="Phone"><Input {...bind('phone')} inputMode="tel" placeholder="Optional" /></Field>
          <Field label="Currency symbol"><Input {...bind('currency')} className="pg-input-short" maxLength={4} /></Field>
        </div>
        <Field label="Address">
          <Textarea {...bind('address')} rows={2} placeholder="Optional" />
        </Field>
        <Field label="Locale" hint={localeExample(b.locale || undefined)}>
          <Input {...bind('locale')} className="pg-input-short" placeholder="en-GB" spellCheck={false} />
        </Field>
      </Section>

      <Section title="Features" description="Anything turned off is hidden on the POS and in these settings." className="pg-flush">
        <div className="ui-list">
          {FEATURES.map(x => (
            <div key={x.key} className="ui-list__row pg-feature">
              <div className="pg-feature__text">
                <div>{x.label}</div>
                <div className="pg-sub">{x.desc}</div>
              </div>
              <Toggle checked={f[x.key]} onChange={v => set(`features.${x.key}`, v)} />
            </div>
          ))}
        </div>
      </Section>

      {f.summary && (
        <Section title="Summary PIN">
          <Field label="PIN" hint="Asked on the POS before the summary opens. Leave empty for none.">
            <Input
              value={config.security.summaryPin ?? ''} onChange={e => set('security.summaryPin', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric" maxLength={8} placeholder="None" className="pg-input-short" autoComplete="off"
            />
          </Field>
        </Section>
      )}
    </>
  )
}
