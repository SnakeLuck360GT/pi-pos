import { useEffect, useMemo, useRef } from 'react'
import { Icon } from '../../ui/icons.jsx'
import { findMode, itemCount, lineTotal, orderTotals } from '../../../shared/order.js'
import { Names, Placeholder, altText, cx, lineChoiceText } from './shared.jsx'

// null means "first category", so a fresh order opens on something useful.
export const activeCategory = ctx => ctx.ui.category ?? ctx.config.categories?.[0]?.id ?? 'all'

export function searchItems(config, query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return (config.items || []).filter(i =>
    (i.name || '').toLowerCase().includes(q) || (i.nameAlt || '').toLowerCase().includes(q))
}

export function CategoriesBlock({ block, ctx }) {
  const { orientation, showAlt, showAll } = block.props
  const cats = ctx.config.categories || []
  const searching = !!ctx.ui.search.trim()
  const active = activeCategory(ctx)
  const pick = id => { ctx.ui.setSearch(''); ctx.ui.setCategory(id) }
  if (!cats.length) return <Placeholder ctx={ctx} label="No categories" />
  const list = showAll ? [{ id: 'all', name: 'All', nameAlt: '' }, ...cats] : cats
  return (
    <div className={cx('pos-b pos-surface pos-cats', orientation === 'horizontal' ? 'pos-cats--h' : 'pos-cats--v')}>
      {list.map(c => (
        <button
          key={c.id} type="button"
          className={cx('pos-cat', !searching && active === c.id && 'is-active')}
          onClick={() => pick(c.id)}
        >
          <Names name={c.name} alt={altText(ctx, c.nameAlt, showAlt)} />
        </button>
      ))}
    </div>
  )
}

export function ItemsBlock({ block, ctx }) {
  const { columns, showPrice, showAlt, tileHeight } = block.props
  const { config, order, ui } = ctx
  const query = ui.search.trim()
  const cat = activeCategory(ctx)

  const items = useMemo(() => {
    if (query) return searchItems(config, query)
    const all = config.items || []
    return cat === 'all' ? all : all.filter(i => i.categoryId === cat)
  }, [config, query, cat])

  // Quantity already on the ticket, shown on the tile so staff see what's in.
  const counts = useMemo(() => {
    const m = {}
    for (const l of order.lines || []) m[l.itemId] = (m[l.itemId] || 0) + (Number(l.qty) || 0)
    return m
  }, [order.lines])

  const style = {
    gridTemplateColumns: `repeat(${Math.max(1, Number(columns) || 3)}, minmax(0, 1fr))`,
    gridAutoRows: `minmax(${Math.max(44, Number(tileHeight) || 96)}px, auto)`,
  }

  return (
    <div className="pos-b pos-items pos-scroll">
      {items.length ? (
        <div className="pos-items__grid" style={style}>
          {items.map(item => (
            <button
              key={item.id} type="button" className="pos-tile"
              style={item.color ? { '--item-color': item.color } : undefined}
              onClick={() => ctx.actions.addItem(item)}
            >
              <Names name={item.name} alt={altText(ctx, item.nameAlt, showAlt)} />
              {showPrice ? (
                <span className="pos-tile__price pos-num">
                  {ctx.money(item.price)}{item.choices?.length ? <span className="pos-tile__more"> · {item.choices.length} options</span> : null}
                </span>
              ) : null}
              {counts[item.id] ? <span className="pos-tile__count pos-num">{counts[item.id]}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="pos-empty">{query ? `Nothing matches "${query}"` : 'No items in this category'}</p>
      )}
    </div>
  )
}

export function TotalsRows({ order, money }) {
  const t = orderTotals(order)
  const extra = t.fee > 0 || t.discount > 0
  return (
    <div className="pos-totals">
      {extra ? <Row label="Subtotal" value={money(t.subtotal)} /> : null}
      {t.fee > 0 ? <Row label={order.feeRate != null ? `Fee ${order.feeRate}%` : 'Fee'} value={money(t.fee)} /> : null}
      {t.discount > 0 ? <Row label={order.discountRate != null ? `Discount ${order.discountRate}%` : 'Discount'} value={money(-t.discount)} /> : null}
      <Row label="Total" value={money(t.total)} strong />
    </div>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className={cx('pos-totals__row', strong && 'is-total')}>
      <span>{label}</span>
      <span className="pos-num">{value}</span>
    </div>
  )
}

export function TicketLine({ line, ctx, showAlt, showModifiers, onClick }) {
  const alt = [altText(ctx, line.nameAlt, showAlt), line.choice ? altText(ctx, line.choice.nameAlt, showAlt) : '']
    .filter(Boolean).join(' ')
  const choice = lineChoiceText(ctx, line, showAlt)
  const mods = showModifiers && line.modifiers?.length ? line.modifiers.map(m => m.name).join(', ') : ''
  return (
    <button type="button" className="pos-line" onClick={onClick}>
      <span className="pos-line__qty pos-num">{line.qty}</span>
      <span className="pos-line__main">
        <span className="pos-name">{line.name}{choice ? <span className="pos-line__choice"> · {choice}</span> : null}</span>
        {alt ? <span className="pos-alt">{alt}</span> : null}
        {mods ? <span className="pos-line__meta">{mods}</span> : null}
        {showModifiers && line.note ? <span className="pos-line__meta">Note: {line.note}</span> : null}
      </span>
      <span className="pos-line__price pos-num">{ctx.money(lineTotal(line))}</span>
    </button>
  )
}

export function TicketBlock({ block, ctx }) {
  const { showAlt, showModifiers, showTotals } = block.props
  const lines = ctx.order.lines || []
  const listRef = useRef(null)
  const prevCount = useRef(lines.length)

  // Keep the newest line in view as items are added.
  useEffect(() => {
    if (lines.length > prevCount.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
    prevCount.current = lines.length
  }, [lines.length])

  const count = itemCount(ctx.order)
  return (
    <div className="pos-b pos-surface pos-ticket">
      <div className="pos-ticket__head">
        <span>Order</span>
        <span className="pos-num">{count ? `${count} item${count === 1 ? '' : 's'}` : ''}</span>
      </div>
      <div className="pos-ticket__list pos-scroll" ref={listRef}>
        {lines.length ? lines.map(l => (
          <TicketLine
            key={l.id} line={l} ctx={ctx} showAlt={showAlt} showModifiers={showModifiers}
            onClick={() => ctx.actions.openLine(l.id)}
          />
        )) : <p className="pos-empty">No items yet</p>}
      </div>
      {showTotals !== false ? <div className="pos-ticket__foot"><TotalsRows order={ctx.order} money={ctx.money} /></div> : null}
    </div>
  )
}

export function TotalBlock({ block, ctx }) {
  const { total } = orderTotals(ctx.order)
  const count = itemCount(ctx.order)
  return (
    <div className="pos-b pos-surface pos-total">
      <span className="pos-total__label">
        {block.props.label || 'Total'}
        {block.props.showCount && count ? <span className="pos-total__count pos-num"> · {count} item{count === 1 ? '' : 's'}</span> : null}
      </span>
      <span className="pos-total__value pos-num">{ctx.money(total)}</span>
    </div>
  )
}

export function PrintButtonBlock({ block, ctx }) {
  const empty = !ctx.order.lines?.length
  const busy = !!ctx.ui.printing
  const { total } = orderTotals(ctx.order)
  return (
    <button
      type="button"
      className={cx('pos-b pos-btn pos-btn--primary pos-print', block.props.showTotal && 'has-total')}
      disabled={empty || busy}
      onClick={() => ctx.actions.print()}
    >
      <span>{busy ? 'Sending…' : (block.props.label || 'Print')}</span>
      {block.props.showTotal ? <span className="pos-num">{ctx.money(total)}</span> : null}
    </button>
  )
}

export function BackButtonBlock({ block, ctx }) {
  return (
    <button type="button" className="pos-b pos-btn" onClick={() => ctx.actions.go('home')}>
      <Icon name="chevronLeft" size={18} />
      <span>{block.props.label || 'Back'}</span>
    </button>
  )
}

export function CustomerBlock({ block, ctx }) {
  const { config, order } = ctx
  const mode = config.features.orderModes ? findMode(config, order.mode) : null
  const c = order.customer || {}
  const detail = [c.name, c.phone].filter(Boolean).join(' · ')
  const number = order.number ?? ctx.ui.nextNumber
  return (
    <button type="button" className="pos-b pos-btn pos-customer" onClick={() => ctx.actions.editCustomer()}>
      <span className="pos-customer__main">
        <span className="pos-customer__mode">
          {mode ? mode.label : 'Order'}
          {mode && altText(ctx, mode.labelAlt, block.props.showAlt) ? <span className="pos-alt"> {mode.labelAlt}</span> : null}
        </span>
        <span className={cx('pos-customer__detail', !detail && 'is-empty')}>{detail || 'Add customer'}</span>
        {c.address ? <span className="pos-customer__address">{c.address}</span> : null}
      </span>
      {block.props.showNumber !== false && number ? <span className="pos-customer__no pos-num">#{number}</span> : null}
    </button>
  )
}

export function SearchBlock({ block, ctx }) {
  const { search, setSearch } = ctx.ui
  const onKeyDown = e => {
    if (e.key !== 'Enter') return
    // One match on Enter adds it: quick for staff who type a dish name.
    const hits = searchItems(ctx.config, search)
    if (hits.length === 1) { ctx.actions.addItem(hits[0]); setSearch('') }
    e.currentTarget.blur()
  }
  return (
    <label className="pos-b pos-surface pos-search">
      <Icon name="search" size={18} />
      <input
        type="search" value={search} placeholder={block.props.placeholder || 'Search'}
        onChange={e => setSearch(e.target.value)} onKeyDown={onKeyDown}
        readOnly={ctx.editing} tabIndex={ctx.editing ? -1 : 0}
        enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck="false"
      />
      {search ? (
        <button type="button" className="pos-search__clear" aria-label="Clear search" onClick={() => setSearch('')}>
          <Icon name="x" size={18} />
        </button>
      ) : null}
    </label>
  )
}

function AmountButton({ label, value, onClick }) {
  return (
    <button type="button" className="pos-b pos-btn pos-amount-btn" onClick={onClick}>
      <span>{label}</span>
      {value ? <span className="pos-amount-btn__value pos-num">{value}</span> : null}
    </button>
  )
}

export function DiscountButtonBlock({ block, ctx }) {
  const d = Number(ctx.order.discount) || 0
  return <AmountButton label={block.props.label || 'Discount'} value={d > 0 ? ctx.money(-d) : ''} onClick={() => ctx.actions.openDiscount?.()} />
}

export function FeeButtonBlock({ block, ctx }) {
  const f = Number(ctx.order.fee) || 0
  return <AmountButton label={block.props.label || 'Fee'} value={f > 0 ? ctx.money(f) : ''} onClick={() => ctx.actions.openFee?.()} />
}

export function ClearButtonBlock({ block, ctx }) {
  return (
    <button type="button" className="pos-b pos-btn" disabled={!ctx.order.lines?.length} onClick={() => ctx.actions.clear()}>
      <span>{block.props.label || 'Clear'}</span>
    </button>
  )
}
