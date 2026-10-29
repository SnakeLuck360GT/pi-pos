import { Icon } from '../../ui/icons.jsx'
import { findMode } from '../../../shared/order.js'
import { Names, Placeholder, altText, etaLabel } from './shared.jsx'

// With order modes off, a home layout built around mode buttons would be a
// dead end. The first mode button then stands in as "New order", unless the
// layout already has a real new-order button.
function standsInForNewOrder(block, ctx) {
  const blocks = ctx.config.layouts?.home?.blocks || []
  if (blocks.some(b => b.type === 'new-order-button' && !b.style?.hidden)) return false
  const first = blocks.find(b => b.type === 'mode-button')
  return first?.id === block.id
}

export function ModeButtonBlock({ block, ctx }) {
  const { features } = ctx.config
  const { modeId, showAlt, showEta } = block.props
  if (!features.orderModes) {
    if (standsInForNewOrder(block, ctx)) return <BigButton label="New order" onClick={() => ctx.actions.newOrder()} />
    return <Placeholder ctx={ctx} label="Order types are off" />
  }
  const mode = findMode(ctx.config, modeId)
  if (!mode) return <Placeholder ctx={ctx} label="Pick an order type" />
  if (mode.enabled === false) return <Placeholder ctx={ctx} label={`${mode.label} is off`} />
  return (
    <BigButton
      label={mode.label}
      alt={altText(ctx, mode.labelAlt, showAlt)}
      hint={showEta ? etaLabel(mode) : ''}
      onClick={() => ctx.actions.startMode(mode.id)}
    />
  )
}

export function NewOrderButtonBlock({ block, ctx }) {
  return <BigButton label={block.props.label || 'New order'} onClick={() => ctx.actions.newOrder()} />
}

function BigButton({ label, alt, hint, onClick }) {
  return (
    <button type="button" className="pos-b pos-btn pos-btn--primary pos-mode" onClick={onClick}>
      {hint ? <span className="pos-mode__hint pos-num">{hint}</span> : null}
      <Names name={label} alt={alt} />
    </button>
  )
}

const NAV = {
  queue:   { label: 'Print queue', icon: 'list',     feature: 'queue',   run: a => a.openQueue() },
  summary: { label: 'Today',       icon: 'receipt',  feature: 'summary', run: a => a.openSummary() },
  admin:   { label: 'Admin',       icon: 'sliders',  feature: null,      run: a => a.openAdmin() },
}

export function NavButtonBlock({ block, ctx }) {
  const nav = NAV[block.props.target] || NAV.queue
  if (nav.feature && !ctx.config.features[nav.feature]) {
    return <Placeholder ctx={ctx} label={`${nav.label} is off`} />
  }
  return (
    <button type="button" className="pos-b pos-btn pos-nav" onClick={() => nav.run(ctx.actions)}>
      {block.props.showIcon !== false ? <Icon name={nav.icon} size={18} /> : null}
      <span className="pos-nav__label">{block.props.label || nav.label}</span>
    </button>
  )
}
