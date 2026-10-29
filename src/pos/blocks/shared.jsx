// Small helpers every block uses.

export const cx = (...c) => c.filter(Boolean).join(' ')

// Second-language text, or '' when the feature or the block turns it off.
export const altText = (ctx, value, show = true) =>
  (show && ctx.config.features?.altNames && value) ? value : ''

// A hidden block still shows something faint in the designer so it can be
// found and selected; on the tablet it renders nothing.
export function Placeholder({ ctx, label }) {
  if (!ctx.editing) return null
  return <div className="pos-placeholder"><span>{label}</span></div>
}

export function Names({ name, alt, className }) {
  return (
    <span className={cx('pos-names', className)}>
      <span className="pos-name">{name}</span>
      {alt ? <span className="pos-alt">{alt}</span> : null}
    </span>
  )
}

// "20 min" or "40-60 min" from a mode's eta minutes.
export const etaLabel = mode => (mode?.eta?.length ? `${mode.eta.join('–')} min` : '')

export const lineChoiceText = (ctx, line, showAlt) => {
  if (!line.choice) return ''
  return line.choice.name || altText(ctx, line.choice.nameAlt, showAlt)
}
