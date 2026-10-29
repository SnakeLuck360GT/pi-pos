// Order maths shared by the POS, the receipt renderer and the summary. An
// order line's unit price already includes its choice; modifiers add on top.
//
// order = {
//   id, number, createdAt (ms), mode (mode id | null),
//   customer: { name, phone, address },
//   lines: [{ id, itemId, name, nameAlt, choice: { id, name, nameAlt } | null,
//             price, qty, modifiers: [{ id, name, nameAlt, kind, price }], note }],
//   discount, fee,
// }

export const lineUnit  = l => (Number(l.price) || 0) + (l.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0)
export const lineTotal = l => round(lineUnit(l) * (Number(l.qty) || 0))

export function orderTotals(order) {
  const subtotal = round((order.lines || []).reduce((s, l) => s + lineTotal(l), 0))
  const fee      = round(Number(order.fee) || 0)
  const discount = round(Number(order.discount) || 0)
  return { subtotal, fee, discount, total: Math.max(0, round(subtotal + fee - discount)) }
}

export const itemCount = order => (order.lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0)

const round = n => Math.round(n * 100) / 100

export function money(n, config) {
  const c = config?.business?.currency ?? '£'
  const v = Number(n) || 0
  return `${v < 0 ? '-' : ''}${c}${Math.abs(v).toFixed(2)}`
}

export const findMode = (config, id) => (config.modes || []).find(m => m.id === id) || null

// "18:40" or "19:00-19:20" from the mode's eta minutes.
export function etaText(mode, ts, locale = 'en-GB') {
  if (!mode?.eta?.length) return ''
  const at = mins => new Date(ts + mins * 60000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return mode.eta.map(at).join('-')
}

// Modifiers that may go on an item: the modifier must be offered on the item
// (modifier.itemIds) and the item must accept it (item.modifierIds).
export function modifiersFor(config, item) {
  if (!config.features?.modifiers) return []
  return (config.modifiers || []).filter(m =>
    (m.itemIds == null || m.itemIds.includes(item.id)) &&
    (item.modifierIds == null || item.modifierIds.includes(m.id)))
}
