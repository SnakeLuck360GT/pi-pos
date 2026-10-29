// Small pieces shared by the receipt designer panels.
import { useEffect, useRef, useState } from 'react'
import { Button, Field, Fields, Icon, Input, Segmented, Textarea, Toggle } from '../../ui/index.jsx'
import { RECEIPT_STYLE_FIELDS } from '../../lib/fields.js'

// Anchored menu that closes on outside press or Escape.
export function Popover({ open, onClose, children, align = 'left', className = '' }) {
  const ref = useRef()
  useEffect(() => {
    if (!open) return
    const down = e => { if (ref.current && !ref.current.parentNode.contains(e.target)) onClose() }
    const key = e => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [open, onClose])
  if (!open) return null
  return <div ref={ref} className={`rd-pop rd-pop--${align} ${className}`}>{children}</div>
}

export function TokenPicker({ tokens, onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rd-anchor">
      <Button size="sm" variant="ghost" icon="plus" onClick={() => setOpen(o => !o)}>Token</Button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="rd-tokens">
        {tokens.map(t => (
          <button key={t.token} type="button" className="rd-menu__item" onClick={() => { onPick(t.token); setOpen(false) }}>
            <span>{t.label}</span>
            <span className="rd-menu__hint ui-mono">{t.token}</span>
          </button>
        ))}
      </Popover>
    </div>
  )
}

// Text or textarea with a token picker that inserts at the cursor.
export function TemplateField({ label, value, onChange, tokens, multiline, rows = 3, placeholder, hint }) {
  const wrap = useRef()
  const v = value ?? ''
  function insert(token) {
    const el = wrap.current?.querySelector('textarea, input')
    const start = el?.selectionStart ?? v.length
    const end = el?.selectionEnd ?? v.length
    onChange(v.slice(0, start) + token + v.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }
  return (
    <div className="ui-field">
      <div className="rd-field-head">
        {label && <span className="ui-field__label">{label}</span>}
        {tokens?.length > 0 && <TokenPicker tokens={tokens} onPick={insert} />}
      </div>
      <div ref={wrap}>
        {multiline
          ? <Textarea className="rd-mono" rows={rows} value={v} placeholder={placeholder} spellCheck={false} onChange={e => onChange(e.target.value)} />
          : <Input className="rd-mono" value={v} placeholder={placeholder} spellCheck={false} onChange={e => onChange(e.target.value)} />}
      </div>
      {hint && <div className="ui-field__hint">{hint}</div>}
    </div>
  )
}

const SIZE_KEYS = ['w', 'h']
const STYLE_DEFAULTS = { w: 1, h: 1, bold: false, underline: false, invert: false, align: 'left' }

// ESC/POS line style: size, align, bold, underline, white on black.
export function StyleFields({ value, onChange, noAlign }) {
  const v = { ...STYLE_DEFAULTS, ...(value || {}) }
  const size = RECEIPT_STYLE_FIELDS.filter(f => SIZE_KEYS.includes(f.key))
  const rest = RECEIPT_STYLE_FIELDS.filter(f => !SIZE_KEYS.includes(f.key) && !(noAlign && f.key === 'align'))
  return (
    <>
      <div className="ui-grid-2"><Fields fields={size} value={v} onChange={onChange} /></div>
      <Fields fields={rest.filter(f => f.type !== 'toggle')} value={v} onChange={onChange} />
      <div className="ui-stack rd-tight"><Fields fields={rest.filter(f => f.type === 'toggle')} value={v} onChange={onChange} /></div>
    </>
  )
}

// Collapsible titled group inside the inspector.
export function Group({ title, children, defaultOpen = true, aside }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rd-group">
      <header className="rd-group__head">
        <button type="button" className="rd-group__toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
          <span>{title}</span>
        </button>
        {aside}
      </header>
      {open && <div className="rd-group__body">{children}</div>}
    </section>
  )
}

// "Show for": all orders, or only some order types.
export function ShowFor({ value, onChange, modes }) {
  const all = !Array.isArray(value)
  const list = all ? [] : value
  return (
    <Field label="Show for">
      <div className="ui-stack rd-tight">
        <Toggle label="All orders" checked={all} onChange={on => onChange(on ? 'always' : modes.map(m => m.id))} />
        {!all && modes.map(m => (
          <Toggle key={m.id} label={m.label} checked={list.includes(m.id)}
            onChange={on => onChange(on ? [...list, m.id] : list.filter(id => id !== m.id))} />
        ))}
        {!all && !list.length && <div className="ui-field__hint">Prints on no orders.</div>}
      </div>
    </Field>
  )
}

export function Choice({ label, value, options, onChange, hint }) {
  return <Field label={label} hint={hint}><Segmented size="sm" value={value} options={options} onChange={onChange} /></Field>
}
