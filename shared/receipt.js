// Receipt templates -> print ops (docs/SPEC.md §4). Runs in the browser at
// order time; the job carries the finished PrintDoc and the Pi only turns ops
// into bytes, so the preview and the paper come from the same ops.
import { withDefaults } from './defaults.js'
import { orderTotals, money, findMode, etaText, itemCount, lineTotal } from './order.js'
import { colWidth, wrap, wrapWidths, truncate, twoCol, align as alignTo, printable } from './text.js'

// For the designer's token picker. scope: where the token resolves.
export const TOKENS = [
  { token: '{business.name}',    label: 'Business name',        scope: 'both' },
  { token: '{business.nameAlt}', label: 'Business second name', scope: 'both' },
  { token: '{business.phone}',   label: 'Business phone',       scope: 'both' },
  { token: '{business.address}', label: 'Business address',     scope: 'both' },
  { token: '{mode.label}',       label: 'Order type',           scope: 'order' },
  { token: '{mode.labelAlt}',    label: 'Order type, second language', scope: 'order' },
  { token: '{mode.short}',       label: 'Order type short code', scope: 'order' },
  { token: '{eta}',              label: 'Ready time',           scope: 'order' },
  { token: '{date}',             label: 'Date (dd/mm)',         scope: 'both' },
  { token: '{dateLong}',         label: 'Date (dd/mm/yyyy)',    scope: 'both' },
  { token: '{time}',             label: 'Time (HH:MM)',         scope: 'both' },
  { token: '{order.number}',     label: 'Order number',         scope: 'order' },
  { token: '{order.id}',         label: 'Order id',             scope: 'order' },
  { token: '{customer.name}',    label: 'Customer name',        scope: 'order' },
  { token: '{customer.phone}',   label: 'Customer phone',       scope: 'order' },
  { token: '{customer.address}', label: 'Customer address',     scope: 'order' },
  { token: '{items.count}',      label: 'Number of items',      scope: 'order' },
  { token: '{total}',            label: 'Order total',          scope: 'order' },
  { token: '{summary.date}',     label: 'Summary date',         scope: 'summary' },
  { token: '{summary.count}',    label: 'Number of orders',     scope: 'summary' },
  { token: '{summary.total}',    label: 'Day total',            scope: 'summary' },
]

// Tokens inside the per-line formats of items and summary blocks.
export const LINE_TOKENS = {
  item: [
    { token: '{qty}',       label: 'Quantity' },
    { token: '{name}',      label: 'Name' },
    { token: '{nameAlt}',   label: 'Second-language name' },
    { token: '{choice}',    label: 'Choice, e.g. " Beef"' },
    { token: '{choiceAlt}', label: 'Choice, second language' },
    { token: '{mods}',      label: 'Modifiers in brackets (beside)' },
    { token: '{modsAlt}',   label: 'Modifiers, second language' },
    { token: '{price}',     label: 'Line price' },
  ],
  mod: [
    { token: '{sign}',    label: '+ or -' },
    { token: '{name}',    label: 'Name' },
    { token: '{nameAlt}', label: 'Second-language name' },
    { token: '{price}',   label: 'Price' },
  ],
  note: [{ token: '{note}', label: 'Note text' }],
  summaryMode: [
    { token: '{label}',    label: 'Order type' },
    { token: '{labelAlt}', label: 'Order type, second language' },
    { token: '{short}',    label: 'Short code' },
    { token: '{count}',    label: 'Number of orders' },
    { token: '{total}',    label: 'Total' },
  ],
  summaryOrder: [
    { token: '{time}',   label: 'Time' },
    { token: '{short}',  label: 'Order type short code' },
    { token: '{number}', label: 'Order number' },
    { token: '{label}',  label: 'Order type' },
    { token: '{total}',  label: 'Order total' },
  ],
  summaryItems: [{ token: '{items}', label: 'Items, e.g. "2× Spring Rolls, Coke"' }],
}

const S = (o = {}) => ({ w: 1, h: 1, bold: false, underline: false, invert: false, align: 'left', ...o })

// Block types for the designer. `templates`: where the block may be added.
export const RECEIPT_BLOCK_TYPES = {
  text: {
    label: 'Text', icon: 'type', templates: ['receipt', 'summary'],
    defaults: { show: 'always', text: 'Thank you', hideIfEmpty: true, style: S({ align: 'center' }) },
  },
  items: {
    label: 'Items', icon: 'list', templates: ['receipt'],
    defaults: {
      show: 'always',
      altLine:  { show: true, format: '{qty}× {nameAlt}{choiceAlt}{modsAlt}', style: S({ w: 2, h: 2 }) },
      mainLine: { show: true, format: '  {qty}× {name}{choice}{mods}', price: true, style: S() },
      modsPosition: 'beside',
      modLine:  { format: '{sign} {nameAlt|name}', style: S({ w: 2, h: 2 }) },
      noteLine: { format: '* {note}', style: S({ w: 2, h: 2 }) },
      gap: 0,
    },
  },
  totals: {
    label: 'Totals', icon: 'tag', templates: ['receipt'],
    defaults: {
      show: 'always',
      subtotal: { show: 'auto', label: 'SUBTOTAL', style: S({ bold: true }) },
      fee:      { show: 'auto', label: 'DELIVERY', style: S({ bold: true }) },
      discount: { show: 'auto', label: 'DISCOUNT', style: S({ bold: true }) },
      total:    { show: 'always', label: 'TOTAL', style: S({ w: 2, h: 1, bold: true }) },
    },
  },
  divider: {
    label: 'Divider', icon: 'divider', templates: ['receipt', 'summary'],
    defaults: { show: 'always', thickness: 2, pad: 3 },
  },
  feed: {
    label: 'Blank space', icon: 'arrowDown', templates: ['receipt', 'summary'],
    defaults: { show: 'always', lines: 1 },
  },
  image: {
    label: 'Image', icon: 'image', templates: ['receipt', 'summary'],
    defaults: { show: 'always', src: '', data: '', width: 0, height: 0, maxWidth: 288, threshold: 128, dither: true, align: 'center' },
  },
  qr: {
    label: 'QR code', icon: 'qr', templates: ['receipt', 'summary'],
    defaults: { show: 'always', text: '', size: 6, align: 'center' },
  },
  'summary-modes': {
    label: 'Totals by order type', icon: 'sliders', templates: ['summary'],
    defaults: { show: 'always', format: '{label}  {count} orders', style: S({ bold: true }) },
  },
  'summary-orders': {
    label: 'Order list', icon: 'list', templates: ['summary'],
    defaults: {
      show: 'always',
      rowLine:   { format: '{time}  [{short}]  #{number}', style: S({ bold: true }) },
      itemsLine: { show: true, format: '  {items}', style: S() },
    },
  },
}

// A fresh block of `type` with a new id.
export function createBlock(type, template = 'receipt') {
  const t = RECEIPT_BLOCK_TYPES[type]
  if (!t) throw new Error(`Unknown receipt block type: ${type}`)
  const id = `${template === 'summary' ? 's' : 'r'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return { id, type, ...structuredClone(t.defaults) }
}


const TOKEN_RE = /\{([\w.]+(?:\|[\w.]+)*)\}/g

// Fill `{a|b}` tokens. lookup(key) -> string, or undefined for unknown keys.
// Unknown tokens stay as typed so a typo is visible in the preview. Returns
// the text plus whether it had tokens that all came out empty.
function fill(template, lookup) {
  let tokens = 0, filled = 0
  const one = expr => {
    let known = false
    for (const key of expr.split('|')) {
      const v = lookup(key)
      if (v === undefined) continue
      known = true
      const s = String(v ?? '')
      if (s !== '') return s
    }
    return known ? '' : null
  }
  // "[{short}]" with an empty token drops the brackets as well.
  let text = String(template ?? '').replace(/([[(])\{([\w.|]+)\}([\])])/g, (m, a, expr, b) => {
    const v = one(expr)
    if (v === null) return m
    tokens++
    if (v === '') return ''
    filled++
    return a + v + b
  })
  text = text.replace(TOKEN_RE, (m, expr) => {
    const v = one(expr)
    if (v === null) return m
    tokens++
    if (v !== '') filled++
    return v
  })
  return { text, empty: tokens > 0 && filled === 0 }
}

const fmtDate = (ts, locale, long) => {
  try {
    return new Date(ts).toLocaleDateString(locale, long ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit' })
  } catch { return new Date(ts).toLocaleDateString('en-GB') }
}
const fmtTime = (ts, locale) => {
  try { return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) } catch { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }
}

// Lookup for the global tokens. With altNames off every *Alt key is empty.
function globalLookup(config, { order, summary, now }) {
  const b = config.business || {}
  const alt = !!config.features?.altNames
  const locale = b.locale || 'en-GB'
  const mode = order && config.features?.orderModes !== false ? findMode(config, order.mode) : null
  const ts = order?.createdAt || now
  const vals = {
    'business.name': b.name, 'business.nameAlt': alt ? b.nameAlt : '', 'business.phone': b.phone, 'business.address': b.address,
    date: fmtDate(ts, locale), dateLong: fmtDate(ts, locale, true), time: fmtTime(ts, locale),
  }
  if (order) Object.assign(vals, {
    'mode.label': mode?.label, 'mode.labelAlt': alt ? mode?.labelAlt : '', 'mode.short': mode?.short,
    eta: mode ? etaText(mode, ts, locale) : '',
    'order.number': order.number, 'order.id': order.id,
    'customer.name': order.customer?.name, 'customer.phone': order.customer?.phone, 'customer.address': order.customer?.address,
    'items.count': itemCount(order), total: money(orderTotals(order).total, config),
  })
  if (summary) Object.assign(vals, {
    'summary.date': fmtDate(summary.date ?? now, locale, true), 'summary.count': summary.count, 'summary.total': money(summary.total, config),
  })
  return key => (key in vals ? (vals[key] ?? '') : undefined)
}

const chain = (local, next) => key => (key in local ? (local[key] ?? '') : next(key))


// Lines are laid out one column short of the paper: a line that fills the
// paper exactly makes many printers wrap on their own and then feed a blank
// line for our LF (same as the Fortune House bridge).
const usable = cols => Math.max(8, cols - 1)

const style = s => ({ ...S(), ...(s || {}), w: clamp(s?.w, 1, 8, 1), h: clamp(s?.h, 1, 8, 1) })
function clamp(v, lo, hi, d) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d
}

function textOp(text, st, blockId, extra) {
  return { op: 'text', text, w: st.w, h: st.h, bold: !!st.bold, underline: !!st.underline, invert: !!st.invert, align: st.align || 'left', blockId, ...extra }
}

function makeCtx(config, kind, data, now) {
  const cols = clamp(config.receipt?.paperCols, 16, 96, 48)
  const encoding = config.printer?.encoding || 'utf8'
  const tw = { ambiguousWide: encoding === 'gb2312' }
  return {
    config, kind, cols, encoding, tw, now,
    alt: !!config.features?.altNames,
    avail: st => Math.max(1, Math.floor(usable(cols) / st.w)),
    norm: s => printable(s, encoding),
    lookup: globalLookup(config, { ...data, now }),
    money: n => money(n, config),
  }
}

// Plain wrapped lines in one style. Inverted lines are padded to the full
// width so the black band spans the paper.
function emitLines(ops, ctx, text, st, blockId) {
  const avail = ctx.avail(st)
  let lines = wrap(ctx.norm(text), avail, ctx.tw)
  // A two-word line (e.g. "外送 19:00-19:20") one space too long: drop the
  // space instead of wrapping the second word.
  if (lines.length === 2) {
    const one = lines.join('')
    if (colWidth(one, ctx.tw) <= avail && !/\s/.test(lines[0].trim()) && !/\s/.test(lines[1].trim())) lines = [one]
  }
  for (const line of lines) {
    ops.push(st.invert ? textOp(alignTo(line, avail, st.align, ctx.tw), st, blockId) : textOp(line, st, blockId))
  }
}

// "  2× Sweet & Sour Chicken      £8.50": the price stays on the first line,
// a long name wraps underneath, indented under the name (after "2×").
export function priceLines(text, price, avail, tw) {
  const indent = text.match(/^ */)[0]
  const body = text.slice(indent.length)
  const first = body.split(' ')[0]
  let cont = indent + ' '.repeat(colWidth(first, tw) + 1)
  if (colWidth(cont, tw) > avail / 2) cont = indent
  const pw = colWidth(price, tw)
  const iw = colWidth(indent, tw), cw = colWidth(cont, tw)
  const parts = wrapWidths(body, i => (i === 0 ? avail - iw - pw - 1 : avail - cw), tw)
  return parts.map((p, i) => (i === 0 ? twoCol(indent + p, price, avail, tw) : cont + p))
}

function emitPriced(ops, ctx, text, price, st, blockId) {
  const avail = ctx.avail(st)
  const lines = priceLines(ctx.norm(text), ctx.norm(price), avail, ctx.tw)
  lines.forEach(l => ops.push(textOp(st.invert ? alignTo(l, avail, 'left', ctx.tw) : l, { ...st, align: 'left' }, blockId)))
}

function emitRow(ops, ctx, label, amount, st, blockId) {
  const avail = ctx.avail(st)
  ops.push(textOp(twoCol(ctx.norm(label), ctx.norm(amount), avail, ctx.tw), { ...st, align: 'left' }, blockId))
}


function renderText(ops, ctx, b) {
  const st = style(b.style)
  for (const raw of String(b.text ?? '').split('\n')) {
    const { text, empty } = fill(raw, ctx.lookup)
    if (empty && b.hideIfEmpty) continue
    emitLines(ops, ctx, text.trimEnd(), st, b.id)
  }
}

function renderCommon(ops, ctx, b) {
  switch (b.type) {
    case 'text':
      renderText(ops, ctx, b)
      return true
    case 'divider':
      ops.push({ op: 'rule', thickness: clamp(b.thickness, 1, 8, 2), pad: clamp(b.pad, 0, 48, 3), blockId: b.id })
      return true
    case 'feed': {
      const lines = clamp(b.lines, 0, 20, 1)
      if (lines) ops.push({ op: 'feed', lines, blockId: b.id })
      return true
    }
    case 'image':
      if (b.data && b.width && b.height) ops.push({ op: 'image', width: b.width, height: b.height, data: b.data, align: b.align || 'center', blockId: b.id })
      return true
    case 'qr': {
      const { text } = fill(b.text, ctx.lookup)
      if (text.trim()) ops.push({ op: 'qr', data: text.trim(), size: clamp(b.size, 1, 16, 6), align: b.align || 'center', blockId: b.id })
      return true
    }
  }
  return false
}

function renderItems(ops, ctx, b, order) {
  const altLine = b.altLine || {}, mainLine = b.mainLine || {}, modLine = b.modLine || {}, noteLine = b.noteLine || {}
  const beside = (b.modsPosition || 'beside') === 'beside'
  const lines = order.lines || []
  const gap = clamp(b.gap, 0, 10, 0)
  lines.forEach((l, i) => {
    const mods = l.modifiers || []
    const altOf = x => (ctx.alt && x?.nameAlt) || x?.name || ''
    const vars = {
      qty: l.qty, name: l.name, nameAlt: ctx.alt ? l.nameAlt : '',
      choice: l.choice ? ` ${l.choice.name}` : '',
      choiceAlt: l.choice ? ` ${altOf(l.choice)}` : '',
      mods: beside && mods.length ? ` (${mods.map(m => m.name).join(', ')})` : '',
      modsAlt: beside && mods.length ? ` (${mods.map(altOf).join(', ')})` : '',
      price: ctx.money(lineTotal(l)),
    }
    const look = chain(vars, ctx.lookup)
    const line = (def, fallback) => {
      const st = style(def.style)
      const { text } = fill(def.format ?? fallback, look)
      if (def.price) emitPriced(ops, ctx, text.trimEnd(), vars.price, st, b.id)
      else emitLines(ops, ctx, text.trimEnd(), st, b.id)
    }
    const showAlt = ctx.alt && l.nameAlt && altLine.show !== false
    if (showAlt) line(altLine, '{qty}× {nameAlt}')
    // Never let an item vanish: without its alt line the main line prints.
    if (mainLine.show !== false || !showAlt) line(mainLine, '  {qty}× {name}')
    if (!beside) mods.forEach(m => {
      const look = chain({ sign: m.kind === 'remove' ? '-' : '+', name: m.name, nameAlt: ctx.alt ? m.nameAlt : '', price: m.price ? ctx.money(m.price) : '' }, ctx.lookup)
      const { text } = fill(modLine.format ?? '{sign} {name}', look)
      emitLines(ops, ctx, text.trimEnd(), style(modLine.style), b.id)
    })
    if (l.note && String(l.note).trim()) {
      const { text } = fill(noteLine.format ?? '* {note}', chain({ note: String(l.note).trim() }, ctx.lookup))
      emitLines(ops, ctx, text.trimEnd(), style(noteLine.style), b.id)
    }
    if (gap && i < lines.length - 1) ops.push({ op: 'feed', lines: gap, blockId: b.id })
  })
}

function renderTotals(ops, ctx, b, order) {
  const t = orderTotals(order)
  const row = (def, amount, auto) => {
    if (!def) return
    const show = def.show || 'auto'
    if (show === 'never' || (show === 'auto' && !auto)) return
    const { text } = fill(def.label ?? '', ctx.lookup)
    emitRow(ops, ctx, text, amount, style(def.style), b.id)
  }
  row(b.subtotal, ctx.money(t.subtotal), t.fee > 0 || t.discount > 0)
  row(b.fee, ctx.money(t.fee), t.fee > 0)
  row(b.discount, ctx.money(-t.discount), t.discount > 0)
  row({ show: 'always', label: 'TOTAL', ...b.total }, ctx.money(t.total), true)
}

function renderSummaryModes(ops, ctx, b, summary) {
  const st = style(b.style)
  for (const m of summary.modes || []) {
    const look = chain({ label: m.label, labelAlt: ctx.alt ? m.labelAlt : '', short: m.short, count: m.count, total: ctx.money(m.total) }, ctx.lookup)
    emitRow(ops, ctx, fill(b.format ?? '{label}  {count}', look).text.trimEnd(), ctx.money(m.total), st, b.id)
  }
}

function renderSummaryOrders(ops, ctx, b, summary) {
  const row = b.rowLine || {}, items = b.itemsLine || {}
  const rst = style(row.style), ist = style(items.style)
  const orders = summary.orders || []
  if (!orders.length) return emitLines(ops, ctx, 'No orders', rst, b.id)
  const locale = ctx.config.business?.locale || 'en-GB'
  for (const o of orders) {
    const look = chain({ time: fmtTime(o.time, locale), short: o.short, number: o.number, label: o.label, total: ctx.money(o.total) }, ctx.lookup)
    emitRow(ops, ctx, fill(row.format ?? '{time}  #{number}', look).text.trimEnd(), ctx.money(o.total), rst, b.id)
    if (items.show !== false && o.items?.length) {
      const list = o.items.map(i => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ')
      const { text } = fill(items.format ?? '  {items}', chain({ items: list }, ctx.lookup))
      const line = truncate(ctx.norm(text.trimEnd()), ctx.avail(ist), '…', ctx.tw)
      ops.push(ist.invert ? textOp(alignTo(line, ctx.avail(ist), ist.align, ctx.tw), ist, b.id) : textOp(line, ist, b.id))
    }
  }
}

const shown = (b, order) => b.show == null || b.show === 'always' || (Array.isArray(b.show) && order && b.show.includes(order.mode))

function finish(ctx, ops) {
  ops.push({ op: 'cut' })
  return { cols: ctx.cols, lineSpacing: clamp(ctx.config.receipt?.lineSpacing, 0, 255, 24), encoding: ctx.encoding, ops }
}

// order -> PrintDoc
export function renderReceipt(config, order, { now = Date.now() } = {}) {
  config = withDefaults(config)
  const ctx = makeCtx(config, 'order', { order }, now)
  const ops = []
  for (const b of config.receipt.blocks || []) {
    if (b.hidden || !shown(b, order)) continue
    if (renderCommon(ops, ctx, b)) continue
    if (b.type === 'items') renderItems(ops, ctx, b, order)
    else if (b.type === 'totals') renderTotals(ops, ctx, b, order)
  }
  return finish(ctx, ops)
}

// summary (from buildSummary) -> PrintDoc. Summary templates ignore `show`.
export function renderSummary(config, summary, { now = Date.now() } = {}) {
  config = withDefaults(config)
  const ctx = makeCtx(config, 'summary', { summary }, now)
  const ops = []
  for (const b of config.summary.blocks || []) {
    if (b.hidden) continue
    if (renderCommon(ops, ctx, b)) continue
    if (b.type === 'summary-modes') renderSummaryModes(ops, ctx, b, summary)
    else if (b.type === 'summary-orders') renderSummaryOrders(ops, ctx, b, summary)
  }
  return finish(ctx, ops)
}


const dayBounds = ms => {
  const d = new Date(ms)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return [start, end]
}

// jobs from GET /api/jobs -> summary of the local day containing dayMs.
// summary = { date, count, total, modes: [{ id, label, labelAlt, short, count, total }],
//             orders: [{ id, number, time, mode, label, short, total, items: [{ name, nameAlt, qty }] }] }
export function buildSummary(config, jobs, dayMs = Date.now()) {
  config = withDefaults(config)
  const [start, end] = dayBounds(dayMs)
  const orders = (jobs || [])
    .filter(j => (j.type || 'order') === 'order' && (j.status === 'printed' || j.status === 'pending') && j.order)
    .map(j => ({ job: j, time: j.order.createdAt || j.createdAt }))
    .filter(({ time }) => time >= start && time < end)
    .sort((a, b) => a.time - b.time)
    .map(({ job, time }) => {
      const o = job.order
      const mode = findMode(config, o.mode)
      return {
        id: o.id || job.id, number: o.number, time, mode: mode ? mode.id : null,
        label: mode?.label || '', labelAlt: mode?.labelAlt || '', short: mode?.short || '',
        total: Number(job.total ?? orderTotals(o).total) || 0,
        items: (o.lines || []).map(l => ({ name: l.name + (l.choice ? ` ${l.choice.name}` : ''), nameAlt: l.nameAlt, qty: l.qty })),
      }
    })
  const r2 = n => Math.round(n * 100) / 100
  const group = (id, base) => {
    const list = orders.filter(o => o.mode === id)
    return list.length ? { ...base, count: list.length, total: r2(list.reduce((s, o) => s + o.total, 0)) } : null
  }
  const modes = [
    ...(config.modes || []).map(m => group(m.id, { id: m.id, label: m.label, labelAlt: m.labelAlt || '', short: m.short || '' })),
    group(null, { id: null, label: 'Orders', labelAlt: '', short: '' }),
  ].filter(Boolean)
  return { date: start, count: orders.length, total: r2(orders.reduce((s, o) => s + o.total, 0)), modes, orders }
}


const SAMPLE_CUSTOMER = { name: 'Alex Chen', phone: '07700 900123', address: '12 High Street, Leeds LS1 4AB' }

const FALLBACK_ITEMS = [
  { id: 'a', name: 'Spring Rolls', nameAlt: '春卷', price: 4.5, choices: [] },
  { id: 'b', name: 'Black Bean Sauce', nameAlt: '豉汁', price: 8.5, choices: [{ id: 'c', name: 'Chicken', nameAlt: '鸡', price: 0 }, { id: 'b', name: 'Beef', nameAlt: '牛', price: 0.5 }] },
  { id: 'c', name: 'Salt & Pepper Wings', nameAlt: '椒盐鸡翼', price: 6.5, choices: [] },
  { id: 'd', name: 'Egg Fried Rice', nameAlt: '蛋炒饭', price: 3.5, choices: [] },
  { id: 'e', name: 'Coke', nameAlt: '可乐', price: 1.5, choices: [] },
]

const at1820 = now => { const d = new Date(now); d.setHours(18, 20, 0, 0); return d.getTime() }

// A realistic order for previews: 5 lines, a choice, modifiers, a note and a
// customer for the mode's fields. modeId undefined = first enabled mode,
// null = no mode.
export function sampleOrder(config, modeId, { now = Date.now() } = {}) {
  config = withDefaults(config)
  const useModes = config.features.orderModes !== false
  const mode = !useModes || modeId === null ? null
    : modeId === undefined ? (config.modes.find(m => m.enabled !== false) || null)
    : findMode(config, modeId)
  const items = config.items?.length >= 3 ? config.items : FALLBACK_ITEMS
  const withChoice = items.find(i => i.choices?.length) || null
  const plain = items.filter(i => i !== withChoice)
  const pick = [plain[0], withChoice, plain[1], plain[Math.floor(plain.length * 0.6)], plain[plain.length - 1]].filter(Boolean)
  const seen = new Set()
  const mods = config.features.modifiers ? (config.modifiers || []) : []
  const lines = pick.filter(i => !seen.has(i) && seen.add(i)).map((item, n) => {
    const choice = item.choices?.length ? item.choices[Math.min(1, item.choices.length - 1)] : null
    const lineMods = item === withChoice
      ? [mods.find(m => m.kind === 'remove'), mods.find(m => m.kind === 'add' && m.price > 0) || mods.find(m => m.kind === 'add')].filter(Boolean)
      : []
    return {
      id: `l${n + 1}`, itemId: item.id, name: item.name, nameAlt: item.nameAlt || '',
      choice: choice ? { id: choice.id, name: choice.name, nameAlt: choice.nameAlt || '' } : null,
      price: (Number(item.price) || 0) + (Number(choice?.price) || 0),
      qty: n === 0 || n === 3 ? 2 : 1,
      modifiers: lineMods.map(m => ({ id: m.id, name: m.name, nameAlt: m.nameAlt || '', kind: m.kind, price: Number(m.price) || 0 })),
      note: n === 2 ? 'Extra crispy please' : '',
    }
  })
  const customer = { name: '', phone: '', address: '' }
  for (const f of mode?.fields || []) customer[f] = SAMPLE_CUSTOMER[f] || ''
  return {
    id: 'sample', number: 42, createdAt: at1820(now), mode: mode?.id ?? null,
    customer, lines, discount: 0, fee: Number(mode?.fee) || 0,
  }
}

// A summary for previews, built from a handful of sample orders.
export function sampleSummary(config, { now = Date.now() } = {}) {
  config = withDefaults(config)
  const modes = config.features.orderModes !== false ? config.modes.filter(m => m.enabled !== false) : []
  const base = at1820(now)
  const times = [-150, -112, -85, -61, -30, -8].map(m => base + m * 60000)
  const jobs = times.map((t, i) => {
    const mode = modes.length ? modes[i % modes.length].id : null
    const o = sampleOrder(config, mode, { now })
    o.lines = o.lines.slice(i % 3, (i % 3) + 2 + (i % 2))
    o.createdAt = t
    o.number = i + 1
    o.id = `sample-${i + 1}`
    return { id: o.id, type: 'order', status: 'printed', order: o, total: orderTotals(o).total, createdAt: t }
  })
  return buildSummary(config, jobs, base)
}
