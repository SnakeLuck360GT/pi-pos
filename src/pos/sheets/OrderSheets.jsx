import { useMemo, useState } from 'react'
import { Icon } from '../../ui/icons.jsx'
import { lineUnit, modifiersFor, orderTotals } from '../../../shared/order.js'
import { Names, altText } from '../blocks/shared.jsx'
import { Keypad } from './Keypad.jsx'
import { Sheet } from './Sheet.jsx'

const FIELD_META = {
  name:    { label: 'Name',    type: 'text', inputMode: 'text', autoComplete: 'off' },
  phone:   { label: 'Phone',   type: 'tel',  inputMode: 'tel',  autoComplete: 'off' },
  address: { label: 'Address', multiline: true },
}

// `fresh`: asked before the order starts (Continue / Skip); otherwise editing.
export function CustomerSheet({ ctx, mode, fields, initial, fresh, onSave, onSkip, onClose }) {
  const [values, setValues] = useState(() => ({ name: '', phone: '', address: '', ...initial }))
  const set = (k, v) => setValues(s => ({ ...s, [k]: v }))
  const submit = e => { e?.preventDefault(); onSave(values) }
  const alt = mode ? altText(ctx, mode.labelAlt) : ''
  return (
    <Sheet
      title={mode ? mode.label : 'Customer'} subtitle={alt || (fresh ? null : 'Customer details')}
      position="top" onClose={onClose}
      footer={(
        <>
          {fresh
            ? <button type="button" className="pos-sbtn" onClick={onSkip}>Skip</button>
            : <button type="button" className="pos-sbtn" onClick={onClose}>Cancel</button>}
          <button type="submit" form="pos-customer-form" className="pos-sbtn pos-sbtn--primary">{fresh ? 'Continue' : 'Save'}</button>
        </>
      )}
    >
      <form id="pos-customer-form" className="pos-form" onSubmit={submit}>
        {fields.map((f, i) => {
          const m = FIELD_META[f]
          if (!m) return null
          return (
            <label key={f} className="pos-field">
              <span className="pos-field__label">{m.label}</span>
              {m.multiline ? (
                <textarea className="pos-input pos-input--area" rows={2} value={values[f]} onChange={e => set(f, e.target.value)} autoFocus={i === 0} />
              ) : (
                <input
                  className="pos-input" type={m.type} inputMode={m.inputMode} autoComplete={m.autoComplete}
                  autoCorrect="off" value={values[f]} onChange={e => set(f, e.target.value)} autoFocus={i === 0}
                  enterKeyHint={i === fields.length - 1 ? 'done' : 'next'}
                />
              )}
            </label>
          )
        })}
      </form>
    </Sheet>
  )
}

// Picking a choice adds the line straight away: one tap, no confirm step.
export function ChoiceSheet({ ctx, item, onPick, onClose }) {
  return (
    <Sheet title={item.name} subtitle={altText(ctx, item.nameAlt) || 'Choose one'} onClose={onClose}>
      <div className="pos-choices">
        {item.choices.map(c => (
          <button key={c.id} type="button" className="pos-choice" onClick={() => onPick(c)}>
            <Names name={c.name} alt={altText(ctx, c.nameAlt)} />
            <span className="pos-choice__price pos-num">{ctx.money((Number(item.price) || 0) + (Number(c.price) || 0))}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function LineSheet({ ctx, line, onSave, onRemove, onClose }) {
  const { config } = ctx
  const item = (config.items || []).find(i => i.id === line.itemId)
  // Modifiers on the line stay listed even if the menu no longer offers them.
  const options = useMemo(() => {
    const offered = item ? modifiersFor(config, item) : []
    const extra = (line.modifiers || []).filter(m => !offered.some(o => o.id === m.id))
    return [...offered, ...extra]
  }, [config, item, line.modifiers])

  const [qty, setQty] = useState(line.qty)
  const [mods, setMods] = useState(() => (line.modifiers || []).map(m => m.id))
  const [note, setNote] = useState(line.note || '')

  const toggle = id => setMods(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  const picked = options.filter(o => mods.includes(o.id))
    .map(({ id, name, nameAlt, kind, price }) => ({ id, name, nameAlt: nameAlt || '', kind, price: Number(price) || 0 }))
  const unit = lineUnit({ price: line.price, modifiers: picked })

  const groups = [
    { key: 'remove', label: 'Remove', list: options.filter(o => o.kind === 'remove') },
    { key: 'add', label: 'Add', list: options.filter(o => o.kind !== 'remove') },
  ].filter(g => g.list.length)

  const save = () => onSave({ qty, modifiers: picked, note: note.trim() })
  const sub = [line.choice?.name, altText(ctx, [line.nameAlt, line.choice?.nameAlt].filter(Boolean).join(' '))].filter(Boolean).join(' · ')

  return (
    <Sheet
      title={line.name} subtitle={sub || null} size="md" onClose={onClose}
      footer={(
        <>
          <button type="button" className="pos-sbtn pos-sbtn--danger-text" onClick={onRemove}>
            <Icon name="trash" size={18} /> Remove
          </button>
          <span className="pos-sheet__spacer" />
          <button type="button" className="pos-sbtn pos-sbtn--primary pos-sbtn--wide" onClick={save}>
            <span>Done</span>
            <span className="pos-num">{ctx.money(unit * qty)}</span>
          </button>
        </>
      )}
    >
      <div className="pos-qty">
        <button type="button" className="pos-qty__btn" aria-label="Fewer" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}>
          <Icon name="minus" size={22} />
        </button>
        <span className="pos-qty__value pos-num">{qty}</span>
        <button type="button" className="pos-qty__btn" aria-label="More" onClick={() => setQty(q => q + 1)}>
          <Icon name="plus" size={22} />
        </button>
        <span className="pos-qty__unit pos-num">{ctx.money(unit)} each</span>
      </div>

      {groups.map(g => (
        <section key={g.key} className="pos-sheet__section">
          <h3 className="pos-sheet__label">{g.label}</h3>
          <div className="pos-chips">
            {g.list.map(m => (
              <button
                key={m.id} type="button" aria-pressed={mods.includes(m.id)}
                className={`pos-chip${mods.includes(m.id) ? ' is-on' : ''}`}
                onClick={() => toggle(m.id)}
              >
                <span className="pos-chip__name">{m.name}</span>
                {altText(ctx, m.nameAlt) ? <span className="pos-chip__alt">{m.nameAlt}</span> : null}
                {Number(m.price) ? <span className="pos-chip__price pos-num">+{ctx.money(m.price)}</span> : null}
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="pos-sheet__section">
        <h3 className="pos-sheet__label">Note</h3>
        <input
          className="pos-input" value={note} onChange={e => setNote(e.target.value)}
          placeholder="For the kitchen" autoComplete="off" enterKeyHint="done"
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
      </section>
    </Sheet>
  )
}

const RATE_PRESETS = [5, 10, 15, 20]

// Discount or fee entry: a fixed amount, or a percent of the subtotal that
// keeps following the subtotal as lines change.
export function AmountSheet({ ctx, kind, onApply, onClose }) {
  const { order } = ctx
  const isDiscount = kind === 'discount'
  const rate = isDiscount ? order.discountRate : order.feeRate
  const amount = Number(isDiscount ? order.discount : order.fee) || 0
  const currency = ctx.config.business.currency || '£'

  const [unit, setUnit] = useState(rate != null ? '%' : 'amount')
  const [value, setValue] = useState(() => (rate != null ? String(rate) : amount ? String(amount) : ''))
  const { subtotal } = orderTotals({ ...order, fee: 0, discount: 0 })

  const n = Number(value) || 0
  const tooBig = unit === '%' && isDiscount && n > 100
  const result = unit === '%' ? Math.round(subtotal * n) / 100 : n
  const has = amount > 0 || rate != null

  const switchUnit = u => { if (u !== unit) { setUnit(u); setValue('') } }
  const apply = () => onApply(unit === '%' ? { rate: n } : { amount: n })

  return (
    <Sheet
      title={isDiscount ? 'Discount' : 'Fee'} size="sm" onClose={onClose}
      footer={(
        <>
          {has
            ? <button type="button" className="pos-sbtn pos-sbtn--danger-text" onClick={() => onApply({ amount: 0 })}>Remove</button>
            : <button type="button" className="pos-sbtn" onClick={onClose}>Cancel</button>}
          <span className="pos-sheet__spacer" />
          <button type="button" className="pos-sbtn pos-sbtn--primary" disabled={tooBig} onClick={apply}>Apply</button>
        </>
      )}
    >
      <div className="pos-seg" role="group">
        <button type="button" className={unit === 'amount' ? 'is-on' : ''} onClick={() => switchUnit('amount')}>Amount ({currency})</button>
        <button type="button" className={unit === '%' ? 'is-on' : ''} onClick={() => switchUnit('%')}>Percent</button>
      </div>
      <div className="pos-amount">
        <span className={`pos-amount__value pos-num${value ? '' : ' is-empty'}`}>
          {unit === '%' ? `${value || '0'}%` : `${currency}${value || '0.00'}`}
        </span>
        <span className={`pos-amount__hint pos-num${tooBig ? ' is-error' : ''}`}>
          {tooBig ? 'At most 100%' : unit === '%'
            ? `${isDiscount ? '−' : '+'}${ctx.money(result)} on ${ctx.money(subtotal)}`
            : `Subtotal ${ctx.money(subtotal)}`}
        </span>
      </div>
      {unit === '%' ? (
        <div className="pos-presets">
          {RATE_PRESETS.map(p => (
            <button key={p} type="button" className={`pos-chip pos-chip--sm${n === p ? ' is-on' : ''}`} onClick={() => setValue(String(p))}>{p}%</button>
          ))}
        </div>
      ) : null}
      <Keypad value={value} onChange={setValue} decimals maxLength={unit === '%' ? 5 : 7} />
    </Sheet>
  )
}

export function PinSheet({ pin, onOk, onClose }) {
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  const change = v => {
    setWrong(false)
    if (v.length < pin.length) return setValue(v)
    if (v === pin) return onOk()
    setValue('')
    setWrong(true)
  }
  return (
    <Sheet title="Enter PIN" size="sm" onClose={onClose}>
      <div className="pos-pin" aria-live="polite">
        <div className="pos-pin__dots">
          {Array.from({ length: pin.length }, (_, i) => <span key={i} className={`pos-pin__dot${i < value.length ? ' is-on' : ''}`} />)}
        </div>
        <p className={`pos-pin__msg${wrong ? ' is-error' : ''}`}>{wrong ? 'Wrong PIN, try again' : 'The daily summary is protected'}</p>
      </div>
      <Keypad value={value} onChange={change} decimals={false} maxLength={pin.length} />
    </Sheet>
  )
}
