// Admin UI kit. Every admin screen is built from these, so the panel keeps one
// look: neutral greys, hairline borders, 13px text, no shadows except overlays.
// Styles live in ./ui.css (classes prefixed `ui-`).
import { useEffect, useId, useRef } from 'react'
import { Icon } from './icons.jsx'
import { getPath, setPath } from '../lib/fields.js'

export { Icon }

const cx = (...c) => c.filter(Boolean).join(' ')

export function Button({ variant = 'secondary', size = 'md', icon, children, className, ...rest }) {
  return (
    <button type="button" className={cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, !children && 'ui-btn--icon', className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

// Square icon-only button. `label` is required for accessibility and the tooltip.
export function IconButton({ icon, label, variant = 'ghost', size = 'md', className, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, 'ui-btn--icon', className)} {...rest}>
      <Icon name={icon} />
    </button>
  )
}

export function Input({ className, ...rest }) {
  return <input className={cx('ui-input', className)} {...rest} />
}

export function Textarea({ className, rows = 3, ...rest }) {
  return <textarea className={cx('ui-input', 'ui-textarea', className)} rows={rows} {...rest} />
}

// Number input that allows an empty value (-> null) so "inherit" is possible.
export function NumberInput({ value, onChange, min, max, step = 1, placeholder, className, ...rest }) {
  return (
    <input
      type="number" inputMode="decimal" className={cx('ui-input', 'ui-input--num', className)}
      value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      {...rest}
    />
  )
}

// Money: shows 2dp, stores a number.
export function MoneyInput({ value, onChange, currency = '£', ...rest }) {
  return (
    <div className="ui-affix">
      <span className="ui-affix__pre">{currency}</span>
      <NumberInput value={value} onChange={v => onChange(v ?? 0)} step={0.01} {...rest} />
    </div>
  )
}

export function Select({ value, onChange, options, className, ...rest }) {
  return (
    <div className={cx('ui-select', className)}>
      <select value={value ?? ''} onChange={e => {
        const opt = options.find(o => String(o.value) === e.target.value)
        onChange(opt ? opt.value : e.target.value)
      }} {...rest}>
        {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      <Icon name="chevronDown" size={14} />
    </div>
  )
}

export function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className={cx('ui-seg', `ui-seg--${size}`)} role="radiogroup">
      {options.map(o => (
        <button
          key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
          className={cx('ui-seg__opt', value === o.value && 'is-on')}
          onClick={() => onChange(o.value)} title={o.title}
        >
          {o.icon ? <Icon name={o.icon} /> : o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={cx('ui-toggle', disabled && 'is-disabled')}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="ui-toggle__track"><span className="ui-toggle__thumb" /></span>
      {label && <span className="ui-toggle__label">{label}</span>}
    </label>
  )
}

// Swatch + hex field. Empty string = inherit.
export function ColorInput({ value, onChange, placeholder = 'Theme' }) {
  return (
    <div className="ui-color">
      <label className="ui-color__swatch" style={{ background: value || 'transparent' }}>
        <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} />
      </label>
      <input className="ui-input" value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} spellCheck={false} />
      {value && <IconButton icon="x" label="Clear" size="sm" onClick={() => onChange('')} />}
    </div>
  )
}

// File picker -> data URL.
export function ImageInput({ value, onChange, accept = 'image/*' }) {
  const ref = useRef()
  function pick(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => onChange(r.result)
    r.readAsDataURL(f)
    e.target.value = ''
  }
  return (
    <div className="ui-image">
      {value ? <img src={value} alt="" /> : <div className="ui-image__empty"><Icon name="image" /></div>}
      <div className="ui-row">
        <Button size="sm" onClick={() => ref.current.click()}>{value ? 'Replace' : 'Upload'}</Button>
        {value && <Button size="sm" variant="ghost" onClick={() => onChange('')}>Remove</Button>}
      </div>
      <input ref={ref} type="file" accept={accept} hidden onChange={pick} />
    </div>
  )
}

export function Field({ label, hint, children, inline }) {
  const id = useId()
  return (
    <div className={cx('ui-field', inline && 'ui-field--inline')}>
      {label && <label className="ui-field__label" htmlFor={id}>{label}</label>}
      <div className="ui-field__control" id={id}>{children}</div>
      {hint && <div className="ui-field__hint">{hint}</div>}
    </div>
  )
}

// Render a list of field definitions (src/lib/fields.js) against `value`.
// onChange receives the whole updated object.
export function Fields({ fields, value, onChange, currency }) {
  return fields.map(f => {
    const v = getPath(value, f.key)
    const set = nv => onChange(setPath(value, f.key, nv))
    let control
    switch (f.type) {
      case 'textarea':  control = <Textarea value={v ?? ''} placeholder={f.placeholder} rows={f.rows} onChange={e => set(e.target.value)} />; break
      case 'number':    control = <NumberInput value={v} min={f.min} max={f.max} step={f.step} placeholder={f.placeholder} onChange={set} />; break
      case 'money':     control = <MoneyInput value={v} currency={currency} onChange={set} />; break
      case 'select':    control = <Select value={v ?? ''} options={f.options} onChange={set} />; break
      case 'segmented': control = <Segmented value={v} options={f.options} onChange={set} size="sm" />; break
      case 'toggle':    return <Field key={f.key} hint={f.hint} inline><Toggle checked={v} onChange={set} label={f.label} /></Field>
      case 'color':     control = <ColorInput value={v} onChange={set} placeholder={f.placeholder} />; break
      case 'image':     control = <ImageInput value={v} onChange={set} />; break
      default:          control = <Input value={v ?? ''} placeholder={f.placeholder} onChange={e => set(e.target.value)} />
    }
    return <Field key={f.key} label={f.label} hint={f.hint}>{control}</Field>
  })
}

// A titled group inside a page or inspector.
export function Section({ title, description, actions, children, className }) {
  return (
    <section className={cx('ui-section', className)}>
      {(title || actions) && (
        <header className="ui-section__head">
          <div>
            {title && <h3 className="ui-section__title">{title}</h3>}
            {description && <p className="ui-section__desc">{description}</p>}
          </div>
          {actions && <div className="ui-row">{actions}</div>}
        </header>
      )}
      <div className="ui-section__body">{children}</div>
    </section>
  )
}

// Top of an admin page.
export function PageHeader({ title, description, actions }) {
  return (
    <header className="ui-page-head">
      <div>
        <h1 className="ui-page-head__title">{title}</h1>
        {description && <p className="ui-page-head__desc">{description}</p>}
      </div>
      {actions && <div className="ui-row">{actions}</div>}
    </header>
  )
}

export function Modal({ title, onClose, children, footer, width = 440 }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="ui-overlay" onPointerDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className="ui-modal" style={{ width }} role="dialog" aria-label={title}>
        {title && (
          <header className="ui-modal__head">
            <h2>{title}</h2>
            {onClose && <IconButton icon="x" label="Close" size="sm" onClick={onClose} />}
          </header>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__title">{title}</div>
      {children && <div className="ui-empty__body">{children}</div>}
      {action}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`)}>{children}</span>
}

export function Spinner() {
  return <span className="ui-spinner" aria-label="Loading" />
}

export { Tour, resetTours, tourSeen } from './Tour.jsx'
