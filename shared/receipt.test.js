import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, withDefaults } from './defaults.js'
import { renderReceipt, renderSummary, buildSummary, sampleOrder, sampleSummary, TOKENS, RECEIPT_BLOCK_TYPES, createBlock } from './receipt.js'
import { colWidth } from './text.js'

const NOW = new Date(2026, 9, 29, 18, 20).getTime()
const texts = doc => doc.ops.filter(o => o.op === 'text').map(o => o.text)
const cfgWith = (blocks, extra = {}) => withDefaults({ ...extra, receipt: { ...DEFAULT_CONFIG.receipt, ...extra.receipt, blocks } })
const S = o => ({ w: 1, h: 1, bold: false, underline: false, invert: false, align: 'left', ...o })

const order = (o = {}) => ({
  id: 'o1', number: 7, createdAt: NOW, mode: 'takeaway',
  customer: { name: 'Sam', phone: '0123', address: '' },
  lines: [{ id: 'l1', itemId: 'x', name: 'Spring Rolls', nameAlt: '春卷', choice: null, price: 4.5, qty: 2, modifiers: [], note: '' }],
  discount: 0, fee: 0, ...o,
})

test('default template: banner like "自取 18:40", date, customer, rules, cut', () => {
  const cfg = withDefaults()
  const doc = renderReceipt(cfg, sampleOrder(cfg, 'takeaway', { now: NOW }), { now: NOW })
  assert.equal(doc.cols, 48)
  assert.equal(doc.lineSpacing, 24)
  const first = doc.ops[0]
  assert.equal(first.text, '自取 18:40')
  assert.deepEqual([first.w, first.h, first.bold, first.align], [2, 2, true, 'center'])
  assert.equal(doc.ops[1].text, '29/10 18:20')
  assert.ok(texts(doc).includes('Alex Chen'))
  assert.ok(texts(doc).includes('Tel: 07700 900123'))
  const rules = doc.ops.filter(o => o.op === 'rule').map(o => o.thickness)
  assert.deepEqual(rules, [4, 2])
  assert.equal(doc.ops.at(-1).op, 'cut')
  // Every op carries the block that made it, except the cut.
  assert.ok(doc.ops.slice(0, -1).every(o => o.blockId))
})

test('delivery banner shows the eta range', () => {
  const cfg = withDefaults()
  const doc = renderReceipt(cfg, sampleOrder(cfg, 'delivery', { now: NOW }))
  assert.equal(doc.ops[0].text, '外送 19:00-19:20')
  assert.ok(texts(doc).includes('12 High Street, Leeds LS1 4AB'))
})

test('no mode: banner and empty customer lines are dropped (hideIfEmpty)', () => {
  const cfg = withDefaults()
  const doc = renderReceipt(cfg, sampleOrder(cfg, null, { now: NOW }))
  assert.equal(doc.ops[0].text, '29/10 18:20')
  assert.ok(!texts(doc).some(t => t.startsWith('Tel:')))
})

test('hideIfEmpty keeps lines with literal text only, and with some tokens filled', () => {
  const blocks = [{ id: 't', type: 'text', show: 'always', hideIfEmpty: true, style: S(),
    text: 'Hello\n{customer.address}\nTel: {customer.phone}\n{customer.address|customer.name}\n{nope}' }]
  assert.deepEqual(texts(renderReceipt(cfgWith(blocks), order())), ['Hello', 'Tel: 0123', 'Sam', '{nope}'])
  blocks[0].hideIfEmpty = false
  assert.deepEqual(texts(renderReceipt(cfgWith(blocks), order())), ['Hello', '', 'Tel: 0123', 'Sam', '{nope}'])
})

test('show filters blocks by mode; hidden blocks are skipped', () => {
  const blocks = [
    { id: 'a', type: 'text', show: 'always', text: 'all', style: S() },
    { id: 'b', type: 'text', show: ['delivery'], text: 'del only', style: S() },
    { id: 'c', type: 'text', show: ['takeaway', 'delivery'], text: 'both', style: S() },
    { id: 'd', type: 'text', show: 'always', hidden: true, text: 'hidden', style: S() },
  ]
  const cfg = cfgWith(blocks)
  assert.deepEqual(texts(renderReceipt(cfg, order())), ['all', 'both'])
  assert.deepEqual(texts(renderReceipt(cfg, order({ mode: 'delivery' }))), ['all', 'del only', 'both'])
  assert.deepEqual(texts(renderReceipt(cfg, order({ mode: null }))), ['all'])
})

test('altNames off empties every *Alt token and skips alt item lines', () => {
  const items = createBlock('items')
  const blocks = [{ id: 't', type: 'text', show: 'always', hideIfEmpty: true, text: '{mode.labelAlt|mode.label}\n{business.nameAlt}', style: S() }, items]
  const on = renderReceipt(cfgWith(blocks), order())
  assert.deepEqual(texts(on).slice(0, 2), ['自取', '2× 春卷'])
  const off = renderReceipt(cfgWith(blocks, { features: { ...DEFAULT_CONFIG.features, altNames: false } }), order())
  assert.equal(texts(off)[0], 'Takeaway')
  assert.ok(!texts(off).some(t => t.includes('春卷')))
  assert.ok(texts(off)[1].startsWith('  2× Spring Rolls'))
})

test('items: price stays on the first wrapped line, continuation indents under the name', () => {
  const items = createBlock('items')
  const cfg = cfgWith([items], { receipt: { paperCols: 32 } })
  const o = order({ lines: [{ id: 'l', name: 'Sweet and Sour Chicken Hong Kong Style with Extra Pineapple', nameAlt: '', choice: null, price: 8.5, qty: 1, modifiers: [], note: '' }] })
  const lines = texts(renderReceipt(cfg, o))
  assert.ok(lines.length >= 2)
  assert.ok(lines[0].endsWith('£8.50'))
  assert.equal(colWidth(lines[0]), 31)
  assert.ok(lines.slice(1).every(l => l.startsWith('     ') && !l.includes('£')))
  assert.ok(lines.every(l => colWidth(l) <= 31))
})

test('items: CJK alt line wraps at floor((cols - 1) / w) columns', () => {
  const items = createBlock('items')
  const o = order({ lines: [{ id: 'l', name: 'Banquet', nameAlt: '豪华套餐鸡鸭鱼肉海鲜大拼盘', choice: null, price: 30, qty: 1, modifiers: [], note: '' }] })
  const ops = renderReceipt(cfgWith([items], { receipt: { paperCols: 32 } }), o).ops.filter(x => x.op === 'text' && x.w === 2)
  assert.ok(ops.length === 2)
  assert.ok(ops.every(x => colWidth(x.text) <= 15))
})

test('items: modifiers beside the name vs on their own lines, notes always below', () => {
  const line = { id: 'l', name: 'Chow Mein', nameAlt: '炒面', choice: { id: 'b', name: 'Beef', nameAlt: '牛' }, price: 8, qty: 1, note: 'Allergy: nuts',
    modifiers: [{ id: 'm1', name: 'No Chilli', nameAlt: '不加辣', kind: 'remove', price: 0 }, { id: 'm2', name: 'Extra Sauce', nameAlt: '', kind: 'add', price: 0.5 }] }
  const items = createBlock('items')
  const beside = texts(renderReceipt(cfgWith([items]), order({ lines: [line] })))
  assert.deepEqual(beside.slice(0, 2), ['1× 炒面 牛 (不加辣,', 'Extra Sauce)'])
  assert.match(beside[2], /^  1× Chow Mein Beef \(No Chilli, Extra +£8\.50$/)
  assert.equal(beside[3], '     Sauce)')
  assert.equal(beside.at(-1), '* Allergy: nuts')

  const below = texts(renderReceipt(cfgWith([{ ...items, modsPosition: 'below' }]), order({ lines: [line] })))
  assert.equal(below[0], '1× 炒面 牛')
  assert.ok(below[1].startsWith('  1× Chow Mein Beef ') && below[1].endsWith('£8.50'))
  assert.deepEqual(below.slice(2), ['- 不加辣', '+ Extra Sauce', '* Allergy: nuts'])
})

test('items: gap feeds between items, not after the last', () => {
  const items = { ...createBlock('items'), gap: 1 }
  const two = order({ lines: [order().lines[0], { ...order().lines[0], id: 'l2' }] })
  const feeds = renderReceipt(cfgWith([items]), two).ops.filter(o => o.op === 'feed')
  assert.equal(feeds.length, 1)
})

test('totals: subtotal only when there is a fee or discount (auto)', () => {
  const totals = createBlock('totals')
  const plain = texts(renderReceipt(cfgWith([totals]), order()))
  assert.equal(plain.length, 1)
  assert.match(plain[0], /^TOTAL +£9\.00$/)
  assert.equal(colWidth(plain[0]), 23)   // 2× wide: floor(47 / 2)

  const extra = texts(renderReceipt(cfgWith([totals]), order({ fee: 2.5, discount: 1 })))
  assert.equal(extra.length, 4)
  assert.match(extra[0], /^SUBTOTAL +£9\.00$/)
  assert.match(extra[1], /^DELIVERY +£2\.50$/)
  assert.match(extra[2], /^DISCOUNT +-£1\.00$/)
  assert.match(extra[3], /^TOTAL +£10\.50$/)
  assert.equal(colWidth(extra[0]), 47)

  const never = texts(renderReceipt(cfgWith([{ ...totals, subtotal: { ...totals.subtotal, show: 'never' } }]), order({ fee: 1 })))
  assert.equal(never.length, 2)
  const always = texts(renderReceipt(cfgWith([{ ...totals, subtotal: { ...totals.subtotal, show: 'always' } }]), order()))
  assert.equal(always.length, 2)
})

test('fee label can use the mode label', () => {
  const totals = createBlock('totals')
  totals.fee.label = '{mode.label} fee'
  const out = texts(renderReceipt(cfgWith([totals]), order({ mode: 'delivery', fee: 2 })))
  assert.match(out[1], /^Delivery fee +£2\.00$/)
})

test('inverted lines are padded to the full width', () => {
  const blocks = [{ id: 't', type: 'text', show: 'always', text: 'Hi', style: S({ invert: true, align: 'center', w: 2 }) }]
  const [op] = renderReceipt(cfgWith(blocks), order()).ops
  assert.equal(colWidth(op.text), 23)
  assert.equal(op.text.trim(), 'Hi')
})

test('emoji are stripped and gb2312 counts £ as two columns', () => {
  const blocks = [{ id: 't', type: 'text', show: 'always', text: 'Thanks 🙏', style: S() }, createBlock('totals')]
  const utf = renderReceipt(cfgWith(blocks), order())
  assert.equal(utf.ops[0].text, 'Thanks')
  const gb = renderReceipt(cfgWith(blocks, { printer: { ...DEFAULT_CONFIG.printer, encoding: 'gb2312' } }), order())
  assert.equal(gb.encoding, 'gb2312')
  assert.match(gb.ops[1].text, /￡9\.00$/)
  assert.equal(colWidth(gb.ops[1].text, { ambiguousWide: true }), 23)
})

test('divider, feed, image and qr ops', () => {
  const blocks = [
    { id: 'd', type: 'divider', thickness: 12, pad: 2 },
    { id: 'f', type: 'feed', lines: 2 },
    { id: 'i', type: 'image', data: 'AAAA', width: 8, height: 3, align: 'center' },
    { id: 'e', type: 'image', data: '', width: 0, height: 0 },
    { id: 'q', type: 'qr', text: 'order {order.number}', size: 5, align: 'center' },
  ]
  const ops = renderReceipt(cfgWith(blocks), order()).ops
  assert.deepEqual(ops.map(o => o.op), ['rule', 'feed', 'image', 'qr', 'cut'])
  assert.equal(ops[0].thickness, 8)
  assert.equal(ops[3].data, 'order 7')
})

test('buildSummary groups the local day by mode and skips failed jobs', () => {
  const cfg = withDefaults()
  const job = (id, mode, total, minutes, extra = {}) => ({ id, type: 'order', status: 'printed', total, createdAt: NOW + minutes * 60000,
    order: { ...order({ mode, id, number: Number(id) }), createdAt: NOW + minutes * 60000 }, ...extra })
  const jobs = [
    job('1', 'takeaway', 10, -60), job('2', 'delivery', 20, -30), job('3', 'takeaway', 5.5, -10),
    job('4', 'takeaway', 99, -5, { status: 'failed' }), job('5', 'takeaway', 99, -5, { type: 'summary' }),
    job('6', null, 3, -2), job('7', 'takeaway', 99, -60 * 24),
  ]
  const s = buildSummary(cfg, jobs, NOW)
  assert.equal(s.count, 4)
  assert.equal(s.total, 38.5)
  assert.deepEqual(s.modes.map(m => [m.id, m.count, m.total]), [['takeaway', 2, 15.5], ['delivery', 1, 20], [null, 1, 3]])
  assert.deepEqual(s.orders.map(o => o.id), ['1', '2', '3', '6'])
})

test('default summary template renders modes, orders and the total', () => {
  const cfg = withDefaults({ business: { ...DEFAULT_CONFIG.business, name: 'Fortune House', nameAlt: '福运楼' } })
  const doc = renderSummary(cfg, sampleSummary(cfg, { now: NOW }), { now: NOW })
  const t = texts(doc)
  assert.equal(t[0].trim(), 'Fortune House')
  assert.equal(t[1].trim(), '福运楼')
  assert.ok(t.some(l => /^Takeaway  3 orders +£/.test(l)))
  assert.ok(t.some(l => /\[T\/A\]  #1 +£/.test(l)))
  assert.match(t.at(-1).trim(), /^TOTAL £\d+\.\d\d$/)
  assert.equal(doc.ops.at(-1).op, 'cut')
})

test('summary order rows drop empty [short] brackets', () => {
  const cfg = withDefaults({ features: { ...DEFAULT_CONFIG.features, orderModes: false } })
  const t = texts(renderSummary(cfg, sampleSummary(cfg, { now: NOW })))
  assert.ok(t.some(l => /^\d\d:\d\d    #1 +£/.test(l)))
  assert.ok(!t.some(l => l.includes('[]')))
})

test('sampleOrder has 4-5 lines, a choice, modifiers, a note and a customer', () => {
  const cfg = withDefaults()
  const o = sampleOrder(cfg, 'delivery', { now: NOW })
  assert.ok(o.lines.length >= 4 && o.lines.length <= 5)
  assert.ok(o.lines.some(l => l.choice))
  assert.ok(o.lines.some(l => l.modifiers.length))
  assert.ok(o.lines.some(l => l.note))
  assert.equal(o.customer.address, '12 High Street, Leeds LS1 4AB')
  assert.equal(sampleOrder(cfg, null).mode, null)
  assert.equal(sampleOrder(cfg).mode, 'takeaway')
})

test('metadata: tokens and block types', () => {
  assert.ok(TOKENS.every(t => /^\{[\w.]+\}$/.test(t.token) && t.label && ['order', 'summary', 'both'].includes(t.scope)))
  for (const [type, t] of Object.entries(RECEIPT_BLOCK_TYPES)) {
    assert.ok(t.label && t.icon && t.templates.length, type)
    const b = createBlock(type)
    assert.equal(b.type, type)
    assert.ok(b.id)
  }
})
