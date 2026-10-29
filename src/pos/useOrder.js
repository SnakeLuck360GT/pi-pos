// The in-progress order lives in a reducer and is mirrored to sessionStorage,
// so a refresh (or the tablet killing the tab) doesn't lose a half-taken order.
import { useEffect, useReducer } from 'react'
import { newId } from '../../shared/defaults.js'
import { orderTotals } from '../../shared/order.js'

const ORDER_KEY = 'pipos.order'
const COUNTER_KEY = 'pipos.orderNumber'

const round = n => Math.round(n * 100) / 100

export const emptyCustomer = () => ({ name: '', phone: '', address: '' })

// `discountRate` / `feeRate` (percent, or null) are POS-only extras: when set,
// the amount follows the subtotal as lines change.
export function emptyOrder(mode = null, fee = 0) {
  return {
    id: newId('o'), number: null, createdAt: Date.now(), mode,
    customer: emptyCustomer(), lines: [],
    discount: 0, fee: Number(fee) || 0, discountRate: null, feeRate: null,
  }
}

export function lineFromItem(item, choice = null) {
  return {
    id: newId('l'),
    itemId: item.id,
    name: item.name || '',
    nameAlt: item.nameAlt || '',
    choice: choice ? { id: choice.id, name: choice.name || '', nameAlt: choice.nameAlt || '' } : null,
    price: round((Number(item.price) || 0) + (Number(choice?.price) || 0)),
    qty: 1,
    modifiers: [],
    note: '',
  }
}

// Only plain lines merge: once a line has modifiers or a note it is its own thing.
const mergeable = (l, itemId, choiceId) =>
  l.itemId === itemId && (l.choice?.id ?? null) === (choiceId ?? null) && !l.modifiers?.length && !l.note

function withRates(o) {
  if (o.discountRate == null && o.feeRate == null) return o
  const { subtotal } = orderTotals({ ...o, fee: 0, discount: 0 })
  return {
    ...o,
    discount: o.discountRate == null ? o.discount : round(subtotal * o.discountRate / 100),
    fee: o.feeRate == null ? o.fee : round(subtotal * o.feeRate / 100),
  }
}

const mapLine = (state, id, fn) =>
  withRates({ ...state, lines: state.lines.map(l => (l.id === id ? fn(l) : l)).filter(l => l && l.qty > 0) })

export function orderReducer(state, a) {
  switch (a.type) {
    case 'reset':
      return emptyOrder(a.mode ?? null, a.fee)
    case 'load':
      return { ...emptyOrder(), ...a.order }
    case 'setMode':
      return withRates({ ...state, mode: a.mode ?? null, fee: Number(a.fee) || 0, feeRate: null })
    case 'add': {
      const hit = state.lines.find(l => mergeable(l, a.item.id, a.choice?.id))
      const lines = hit
        ? state.lines.map(l => (l === hit ? { ...l, qty: l.qty + 1 } : l))
        : [...state.lines, lineFromItem(a.item, a.choice)]
      return withRates({ ...state, lines })
    }
    case 'inc':
      return mapLine(state, a.lineId, l => ({ ...l, qty: l.qty + 1 }))
    case 'dec':
      return mapLine(state, a.lineId, l => ({ ...l, qty: l.qty - 1 }))
    case 'updateLine':
      return mapLine(state, a.lineId, l => ({ ...l, ...a.patch }))
    case 'remove':
      return mapLine(state, a.lineId, () => null)
    case 'clear':
      // Clears the ticket but keeps who the order is for and its type.
      return withRates({ ...state, lines: [], discount: 0, discountRate: null })
    case 'customer':
      return { ...state, customer: { ...emptyCustomer(), ...state.customer, ...a.customer } }
    case 'discount':
      return withRates({
        ...state,
        discount: a.rate != null ? 0 : Math.max(0, round(Number(a.amount) || 0)),
        discountRate: a.rate != null ? Math.min(100, Math.max(0, Number(a.rate) || 0)) : null,
      })
    case 'fee':
      return withRates({
        ...state,
        fee: a.rate != null ? 0 : Math.max(0, round(Number(a.amount) || 0)),
        feeRate: a.rate != null ? Math.max(0, Number(a.rate) || 0) : null,
      })
    case 'number':
      return { ...state, number: a.number }
    default:
      return state
  }
}

function loadOrder() {
  try {
    const o = JSON.parse(sessionStorage.getItem(ORDER_KEY))
    if (o && Array.isArray(o.lines)) return { ...emptyOrder(), ...o }
  } catch { /* private mode or corrupt: start fresh */ }
  return emptyOrder()
}

export function useOrder() {
  const [order, dispatch] = useReducer(orderReducer, null, loadOrder)
  useEffect(() => {
    try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(order)) } catch { /* storage full or blocked */ }
  }, [order])
  return [order, dispatch]
}

// The order sent to the printer: the POS-only rate fields stay behind.
export function finalOrder(order, number, now) {
  const { discountRate, feeRate, ...rest } = order
  return { ...rest, number, createdAt: now }
}

// Daily order number, per device. Resets at local midnight.
const dayKey = (t = Date.now()) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function readCounter() {
  try {
    const c = JSON.parse(localStorage.getItem(COUNTER_KEY))
    if (c && c.day === dayKey()) return Number(c.n) || 0
  } catch { /* ignore */ }
  return 0
}

export const peekNumber = () => readCounter() + 1

export function takeNumber() {
  const n = readCounter() + 1
  try { localStorage.setItem(COUNTER_KEY, JSON.stringify({ day: dayKey(), n })) } catch { /* ignore */ }
  return n
}

export function startOfDay(t = Date.now()) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
