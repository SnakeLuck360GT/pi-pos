// Menu import. Turns a PDF (read in the browser with pdf.js) or pasted text
// into categories and items, then into a config patch. Nothing leaves the
// browser. The text parser is a set of plain heuristics tuned on takeaway
// menus: "Name ..... £4.50", bilingual English/Chinese names, "pick one"
// rows like "Chicken 7.50 / Beef 8.00", and two- or three-column layouts.
//
// ImportedMenu = {
//   business?: { name, nameAlt, phone, address },
//   currency?: string,
//   categories: [{ name, nameAlt, items: [{ name, nameAlt, price, description, choices: [{ name, nameAlt, price }] }] }],
// }
// Choice prices are added to the item price, so the item carries the lowest
// price and each choice the difference.
import { newId } from '../../shared/defaults.js'

export const MAX_BYTES = 30 * 1024 * 1024

// pdf.js is only needed here, so it loads from a pinned CDN build on first
// use instead of being bundled.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168'

export const NO_TEXT = 'This PDF has no selectable text. Paste the menu text instead.'

/* ── Text helpers ─────────────────────────────────────────────────────── */

const CJK_CHARS = '\\u2e80-\\u2fdf\\u3000-\\u303f\\u3040-\\u30ff\\u3100-\\u31ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uac00-\\ud7af\\uf900-\\ufaff\\uff00-\\uffef'
const CJK = new RegExp(`[${CJK_CHARS}]`)
const LATIN = /[A-Za-zÀ-ɏ]/
const hasCjk = s => CJK.test(s)
const hasLatin = s => LATIN.test(s)
const words = s => s.split(/\s+/).filter(Boolean).length
const round2 = n => Math.round((Number(n) || 0) * 100) / 100

// NFKC folds fullwidth digits, brackets and "￡" into their plain forms, so
// one set of patterns covers both. Dot leaders become a single space.
function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\t/g, '   ')
    .replace(/(?:[.·•_]\s?){3,}|(?:-\s?){3,}/g, ' ')
    .trim()
}

const squash = s => s.replace(/\s+/g, ' ').trim()

// Trim separators left behind after prices and leaders are cut out.
function cleanEdge(s) {
  return squash(s).replace(/^[\s\-–—:|/·•,;]+|[\s\-–—:|/·•,;]+$/g, '').trim()
}

// A price needs decimals ("7.50", "7,50") or a currency sign ("£7").
// "pp" / "each" after it still count; times like "5.30pm" do not.
const PRICE_RE = /(?<![\w.,:£$€¥-])([£$€¥]\s?)?(\d{1,4}(?:[.,]\d{1,2})?)(\s?[£$€¥])?(?:\s?(?:pp|p\/p|each|ea\.?|per (?:person|head)))?(?![A-Za-z\d%]|[.,]\d)/gi
const TRAIL_TAGS = /(?:\s*(?:\((?:v|vg|ve|gf|df|n|h|hot|spicy|new)\)|\*+|†))+$/i

function findPrices(s) {
  const out = []
  for (const m of s.matchAll(PRICE_RE)) {
    const currency = (m[1] || m[3] || '').trim()
    if (!currency && !/[.,]\d{2}$/.test(m[2])) continue
    out.push({ start: m.index, end: m.index + m[0].length, value: Number(m[2].replace(',', '.')), currency })
  }
  return out
}

const hasPrice = s => findPrices(normalize(s)).length > 0
function isPriceOnly(s) {
  const t = normalize(s)
  const ps = findPrices(t)
  if (!ps.length) return false
  let rest = t
  for (const p of [...ps].reverse()) rest = rest.slice(0, p.start) + rest.slice(p.end)
  return !/[\p{L}\p{N}]/u.test(rest)
}

// Split a line into the text before each price. Prices must end the line
// ("Spring Rolls 4.50", "Chicken 7.50 / Beef 8.00") or, for a single price,
// start it ("4.50 Spring Rolls"). A price in the middle of a sentence
// ("£12 per person, min 2") leaves the line as plain text.
function readPriced(text) {
  const s = text.replace(TRAIL_TAGS, '')
  const ps = findPrices(s)
  if (!ps.length) return null
  const last = ps[ps.length - 1]
  if (/^[\s)\].,;:]*$/.test(s.slice(last.end))) {
    let pos = 0
    const parts = ps.map(p => {
      const label = cleanEdge(s.slice(pos, p.start))
      pos = p.end
      return { label, value: p.value }
    })
    return { parts, currency: last.currency || ps[0].currency }
  }
  const first = ps[0]
  const rest = cleanEdge(s.slice(first.end))
  if (ps.length === 1 && !s.slice(0, first.start).trim() && (/^[A-Z\d]/.test(rest) || hasCjk(rest.charAt(0)))) {
    return { parts: [{ label: rest, value: first.value }], currency: first.currency }
  }
  return null
}

// Item numbers: "12.", "12)", "#12", "No. 12", "A3", "SP1". Bare "12 " is
// only stripped when most priced lines start that way, so "4 Seasons Pizza"
// survives on a menu that doesn't number its items.
function stripCode(s, bare) {
  s = s.replace(/^(?:(?:No|NO|no)\.?\s*|#\s*)?[A-Za-z]{0,2}\d{1,4}[a-zA-Z]?[.):](?!\d)\s*/, '')
  s = s.replace(/^(?:#\s*\d{1,4}|(?:No|NO|no)\.?\s*\d{1,4}|[A-Z]{1,3}\d{1,3}[a-z]?)\s+(?=\S)/, '')
  if (bare) s = s.replace(/^\d{1,3}[a-z]?\s+(?=\D)/, '')
  return s
}

// Copied text often loses the space between scripts: "春卷Spring Rolls".
const SCRIPT_GAP_1 = new RegExp(`([${CJK_CHARS}])(?=[A-Z][a-z])`, 'g')
const SCRIPT_GAP_2 = new RegExp(`([a-z)])(?=[${CJK_CHARS}])`, 'g')

// "春卷 (4件) Crispy Spring Rolls (4)" -> name / nameAlt. Tokens with any
// CJK go to the alt name ("OK鸡翅" stays whole); tokens with neither script
// ("(4)", "-") follow the token before them.
export function splitAlt(text) {
  const s = squash(text).replace(SCRIPT_GAP_1, '$1 ').replace(SCRIPT_GAP_2, '$1 ')
  const lat = []
  const cjk = []
  let side = null
  for (const t of s.split(' ').filter(Boolean)) {
    if (hasCjk(t)) side = 'c'
    else if (hasLatin(t)) side = 'l'
    else if (!side) side = 'l'
    ;(side === 'c' ? cjk : lat).push(t)
  }
  return { name: cleanEdge(lat.join(' ')), nameAlt: cleanEdge(cjk.join(' ')) }
}

// "KING PRAWN IN BATTER" -> "King Prawn in Batter". Short words and words
// without vowels keep their capitals (XO, OK, BBQ, S&P).
const SMALL = new Set(['a', 'an', 'and', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
const WORDS = new Set(['la', 'le', 'de', 'du', 'al', 'au', 'el', 'my', 'no', 'go', 'hi', 'up'])
export function tidyCase(s) {
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (letters.length < 4 || letters !== letters.toUpperCase()) return s
  return s.split(' ').map((w, i) => {
    if (!/[A-Z]/.test(w)) return w
    const lower = w.toLowerCase()
    if (i > 0 && SMALL.has(lower)) return lower
    const core = w.replace(/[^A-Z]/g, '')
    if ((core.length <= 2 && !WORDS.has(lower)) || !/[AEIOUY]/.test(core)) return w
    return lower.replace(/[a-z]/, c => c.toUpperCase())
  }).join(' ')
}

function names(text) {
  const { name, nameAlt } = splitAlt(text)
  return { name: tidyCase(name), nameAlt }
}

const isCaps = s => {
  const l = s.replace(/[^A-Za-z]/g, '')
  return l.length >= 2 && l === l.toUpperCase()
}

const DESC_START = /^(served|with|comes|choice of|choose|includ|add\b|all\b|per\b|min\b|minimum|for\b|each\b|any\b|on a bed|topped|plus\b)/i
// Capitals read as a heading ("A LA CARTE", "CHEF'S SPECIALS · MAINS").
function isDescription(t) {
  const n = words(t)
  if (isCaps(t)) return n > 10 || t.length > 64
  return /^[a-z(·•*+]/.test(t) || DESC_START.test(t) || /^(?:A|An|The)\s+[a-z]/.test(t) || /[.!]$/.test(t) ||
    (/[,·•;]/.test(t) && n > 3) || n > 7 || t.length > 48
}

const shortLabel = s => !!s && words(s) <= 4 && s.length <= 32

function splitList(s) {
  return s.split(/\s*\/\s*|\s*\|\s*|\s*,\s*|\s+or\s+/i).map(cleanEdge).filter(Boolean)
}

/* ── Page furniture and shop details ──────────────────────────────────── */

const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?\(?\d{2,5}\)?(?:[\s-]?\d{2,4}){2,4}/
const POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/
const FURNITURE = [
  /^(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$/i,
  /https?:\/\/|www\.|\.(?:co\.uk|com|net|org|uk)\b|@[\w-]+\.\w/i,
  /opening (?:hours|times)|open (?:daily|every|7)|closed (?:on|every)|\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?s?\b.*\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)/i,
  /minimum order|orders? (?:over|above|under)|free delivery|delivery (?:charge|area|within|radius|available)|service charge|allerg|intoleran|prices? (?:are|include|may)|subject to|terms and conditions|we accept|cards? accepted|follow us|facebook|instagram|(?:^|\s)vat\b/i,
]

function digitsIn(s) {
  return (s.match(/\d/g) || []).length
}

// True for lines that are page furniture. Phone numbers and addresses are
// picked up on the way past.
function furniture(t, business) {
  const phone = t.match(PHONE_RE)
  if (phone && digitsIn(phone[0]) >= 9 && !findPrices(t).length) {
    if (!business.phone) business.phone = squash(phone[0])
    const rest = cleanEdge(t.replace(phone[0], '').replace(/\b(?:tel|telephone|phone|call(?: us)?|t|order(?: on| now)?)\b[.:]?/gi, ''))
    if (rest && POSTCODE_RE.test(rest) && !business.address) business.address = rest
    return true
  }
  if (POSTCODE_RE.test(t) && !findPrices(t).length) {
    if (!business.address) business.address = cleanEdge(t.replace(/^address\s*:?/i, ''))
    return true
  }
  return FURNITURE.some(re => re.test(t))
}

/* ── Line parser ──────────────────────────────────────────────────────── */

const median = a => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

const catKey = s => squash(String(s || '').toLowerCase().replace(/\((?:cont(?:inued|'d|\.)?|continued)\)|\bcont(?:inued|'d|\.)$/g, ''))

// lines: strings, or { text, size } from the PDF reader ('' = a gap).
export function parseMenuLines(input) {
  const lines = (input || []).map(l => (typeof l === 'string' ? { text: l } : { ...l })).map(l => ({ ...l, text: normalize(l.text) }))
  const pricedLines = lines.filter(l => l.text && readPriced(l.text))
  const bodySize = median(pricedLines.map(l => l.size).filter(Boolean))
  const bare = pricedLines.length >= 3 &&
    pricedLines.filter(l => /^\d{1,3}[a-z]?\s+\D/.test(l.text)).length >= pricedLines.length * 0.5

  const business = {}
  const currencies = {}
  const cats = []
  let cat = null
  let pending = []        // headings seen since the last item, newest last
  let last = null         // the item on the line before, for alt names and descriptions
  let prev = 'start'      // what the previous line was
  let colHeader = null    // "Small   Large" style labels for rows with several prices
  let colHeaderText = ''
  let carry = ''          // first half of a name that wrapped onto the next line
  let pendingAlt = ''     // Chinese-only line waiting for the item below it
  let firstHeading = null
  const dropped = new Set()

  const pushHeading = text => {
    const h = names(text)
    if (!h.name && !h.nameAlt) return
    pending.push(h)
    if (!firstHeading && !cats.length) firstHeading = h
    colHeader = null
  }

  function openCategory() {
    if (!pending.length) return
    const h = pending.pop()
    pending.forEach(p => dropped.add(p))
    pending = []
    cat = { name: h.name, nameAlt: h.nameAlt, items: [] }
    cats.push(cat)
  }

  function addItem(item) {
    // A Chinese-only line above an item that already has its own alt name
    // was a heading, not the item's alt name.
    if (pendingAlt) {
      if (item.nameAlt) pending.push({ name: '', nameAlt: pendingAlt })
      else item.nameAlt = pendingAlt
      pendingAlt = ''
    }
    openCategory()
    if (!cat) {
      cat = { name: 'Menu', nameAlt: '', items: [] }
      cats.push(cat)
    }
    cat.items.push(item)
    last = item
    prev = 'item'
  }

  function itemFrom(nameText, value, choices) {
    const label = stripCode(carry ? `${carry} ${nameText}` : nameText, bare)
    carry = ''
    const { name, nameAlt } = names(label)
    return { name, nameAlt, price: round2(value), description: '', choices }
  }

  function handlePriced(p) {
    if (p.currency) currencies[p.currency] = (currencies[p.currency] || 0) + 1
    const values = p.parts.map(x => x.value)
    let label = p.parts[0].label
    let opts = null
    let usedHeader = false

    if (p.parts.length > 1) {
      const rest = p.parts.slice(1).map(x => x.label)
      let labels
      if (rest.every(l => !l)) {
        // One name, several prices. The option names come from a bracketed
        // or slashed list, or from a header row above.
        const paren = label.match(/^(.*?)\s*\(([^()]+)\)$/)
        if (paren && splitList(paren[2]).length === values.length) {
          label = paren[1]
          labels = splitList(paren[2])
        } else if (splitList(label).length === values.length) {
          labels = splitList(label)
          label = ''
        } else if (colHeader?.length === values.length) {
          labels = colHeader
          usedHeader = true
        } else {
          labels = values.map((_, k) => `Option ${k + 1}`)
        }
      } else if (rest.every(shortLabel)) {
        // "Black Bean Sauce: Chicken 8.50 / Beef 9.00" or, with the name on
        // the line above, "Chicken 8.50 / Beef 9.00".
        const m = label.match(/^(.+?)\s*(?::|\s[-–]\s)\s*(.+)$/)
        if (m) {
          label = m[1]
          labels = [m[2], ...rest]
        } else if (!label || (shortLabel(label) && words(label) <= 2)) {
          labels = [label || 'Option 1', ...rest]
          label = ''
        } else {
          labels = [label, ...rest]
        }
      }
      if (labels) {
        const base = Math.min(...values)
        opts = labels.map((l, k) => ({ ...names(l), price: round2(values[k] - base) }))
        values.splice(0, values.length, base)
      }
    }

    // A header row that nothing used was a heading after all.
    if (prev === 'colheader' && !usedHeader) pushHeading(colHeaderText)

    if (!label) {
      // The item name is on its own line above (a heading so far) or, for
      // a list of options, made from the options.
      const h = (prev === 'heading' || prev === 'alt-heading') && pending.length ? pending.pop() : null
      if (h) label = [h.name, h.nameAlt].filter(Boolean).join(' ')
      else if (opts) label = opts.map(o => o.name || o.nameAlt).join(' / ')
      else return
    }

    const item = itemFrom(label, values[0], opts || [])
    if (!opts && p.parts.length > 1) item.description = p.parts.slice(1).map(x => x.label).filter(Boolean).join(' ')
    if (!item.name && !item.nameAlt) return
    addItem(item)
  }

  function handlePlain(t, line, i) {
    if (hasCjk(t) && !hasLatin(t)) {
      const top = pending[pending.length - 1]
      if (prev === 'item' && last && !last.nameAlt) {
        last.nameAlt = cleanEdge(t)
        prev = 'alt'
      } else if (prev === 'heading' && top && !top.nameAlt) {
        top.nameAlt = cleanEdge(t)
        prev = 'alt-heading'
      } else {
        if (pendingAlt) pending.push({ name: '', nameAlt: pendingAlt })
        pendingAlt = cleanEdge(t)
        prev = 'alt-pending'
      }
      return
    }

    if (last && (prev === 'item' || prev === 'alt' || prev === 'desc') && isDescription(t)) {
      last.description = squash(`${last.description} ${t}`)
      prev = 'desc'
      return
    }

    // "Small   Large" or "Chicken / Beef / Prawn" above rows with that many prices.
    const cols = t.split(/\s{2,}|\s[/|]\s/).map(cleanEdge).filter(Boolean)
    if (cols.length >= 2 && cols.every(c => shortLabel(c) && !hasCjk(c) && !/^\d+$/.test(c))) {
      if (prev === 'colheader') pushHeading(colHeaderText)
      colHeader = cols.map(c => tidyCase(c))
      colHeaderText = squash(t)
      prev = 'colheader'
      return
    }

    // From a PDF, a body-sized line squeezed between two items is the first
    // half of a long name, not a heading.
    const next = lines[i + 1]
    if (line.size && bodySize && line.size < bodySize * 1.12 && !isCaps(t) && prev === 'item' &&
        next?.text && readPriced(next.text) && (!next.size || next.size < bodySize * 1.12)) {
      carry = carry ? `${carry} ${t}` : t
      return
    }

    if (isDescription(t)) {
      prev = 'other'
      return
    }
    pushHeading(t.replace(/:$/, ''))
    last = null
    prev = 'heading'
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.text
    if (!t) {
      if (prev === 'item' || prev === 'alt' || prev === 'desc') last = null
      if (prev === 'colheader') pushHeading(colHeaderText)
      carry = ''
      prev = 'blank'
      continue
    }
    if (furniture(t, business)) continue
    const p = readPriced(t)
    if (p) handlePriced(p)
    else handlePlain(t, line, i)
  }

  // Merge categories that are the same heading repeated ("Mains (cont.)").
  const merged = []
  const byKey = new Map()
  for (const c of cats) {
    if (!c.name && c.nameAlt) [c.name, c.nameAlt] = [c.nameAlt, '']
    c.name = squash(c.name.replace(/\((?:cont(?:inued|'d|\.)?)\)/i, ''))
    for (const it of c.items) {
      if (!it.name && it.nameAlt) [it.name, it.nameAlt] = [it.nameAlt, '']
      for (const ch of it.choices) if (!ch.name && ch.nameAlt) [ch.name, ch.nameAlt] = [ch.nameAlt, '']
    }
    const k = catKey(c.name)
    if (byKey.has(k)) byKey.get(k).items.push(...c.items)
    else { byKey.set(k, c); merged.push(c) }
  }

  if (firstHeading && dropped.has(firstHeading)) {
    business.name = firstHeading.name || firstHeading.nameAlt
    if (firstHeading.name && firstHeading.nameAlt) business.nameAlt = firstHeading.nameAlt
  }
  const currency = Object.entries(currencies).sort((a, b) => b[1] - a[1])[0]?.[0]
  const out = { categories: merged.filter(c => c.items.length) }
  if (Object.keys(business).length) out.business = business
  if (currency) out.currency = currency
  return out
}

export function parseMenuText(text) {
  return parseMenuLines(String(text || '').split(/\r?\n/))
}

export function countMenu(menu) {
  let items = 0
  let categories = 0
  for (const c of menu?.categories || []) {
    if (c.include === false) continue
    const n = c.items.filter(i => i.include !== false).length
    items += n
    if (n) categories++
  }
  return { items, categories }
}

/* ── PDF text to lines ────────────────────────────────────────────────── */

// Price-only pieces on a row ("Spring Rolls" ... "4.50") join the name next
// to them, so a right-aligned price column doesn't look like a page column.
function attachPrices(segs) {
  const out = []
  let carry = null
  for (let i = 0; i < segs.length; i++) {
    let s = { ...segs[i] }
    if (carry) {
      s = { x0: carry.x0, x1: s.x1, size: Math.max(carry.size, s.size), text: `${carry.text}   ${s.text}` }
      carry = null
    }
    if (!isPriceOnly(s.text)) { out.push(s); continue }
    const prev = out[out.length - 1]
    const next = segs[i + 1]
    // Prices before names ("4.50 Spring Rolls") go forward.
    if (next && !isPriceOnly(next.text) && !hasPrice(next.text) && (!prev || hasPrice(prev.text))) carry = s
    else if (prev) { prev.text += `   ${s.text}`; prev.x1 = s.x1 }
    else out.push(s)
  }
  if (carry) out.push(carry)
  return out
}

function emitColumn(lines, out) {
  if (!lines.length) return
  if (out.length && out[out.length - 1].text) out.push({ text: '' })
  const gaps = lines.slice(1).map((l, k) => lines[k].y - l.y)
  const typical = median(gaps.filter(g => g > 0))
  lines.forEach((l, k) => {
    if (k && typical) {
      const gap = lines[k - 1].y - l.y
      if (gap > typical * 1.6 && gap > Math.max(l.size, lines[k - 1].size) * 1.4) out.push({ text: '' })
    }
    out.push({ text: l.text, size: l.size })
  })
}

// pdf.js text items ({ str, x, y, w, h }, y up from the bottom) -> lines
// in reading order. Rows are rebuilt from baselines, then the page is split
// into columns at vertical gutters that have prices on both sides (so a
// Chinese name column next to an English one is not mistaken for a page
// column). A row that crosses a gutter, like a full-width heading, starts a
// new band, and each band is read column by column.
export function linesFromItems(raw) {
  const items = []
  for (const it of raw || []) {
    const str = String(it.str ?? '')
    if (!str.trim()) continue
    const size = it.h || 10
    items.push({ str, x: it.x, y: it.y, w: it.w ?? str.length * size * 0.5, size })
  }
  if (!items.length) return []
  items.sort((a, b) => b.y - a.y || a.x - b.x)

  const rows = []
  for (const it of items) {
    let row = null
    for (let k = rows.length - 1; k >= Math.max(0, rows.length - 3); k--) {
      if (Math.abs(rows[k].y - it.y) <= Math.max(1.5, Math.min(rows[k].size, it.size) * 0.45)) { row = rows[k]; break }
    }
    if (row) { row.items.push(it); row.size = Math.max(row.size, it.size) }
    else rows.push({ y: it.y, size: it.size, items: [it] })
  }

  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x)
    const segs = []
    for (const it of r.items) {
      const seg = segs[segs.length - 1]
      const gap = seg ? it.x - seg.x1 : Infinity
      if (gap < r.size * 1.2) {
        const space = gap > r.size * 0.15 && !/\s$/.test(seg.text) && !/^\s/.test(it.str)
        seg.text += space ? ` ${it.str}` : it.str
        seg.x1 = Math.max(seg.x1, it.x + it.w)
        seg.size = Math.max(seg.size, it.size)
      } else {
        segs.push({ x0: it.x, x1: it.x + it.w, size: it.size, text: it.str })
      }
    }
    r.segs = attachPrices(segs)
  }

  const all = rows.flatMap(r => r.segs)
  const minX = Math.min(...all.map(s => s.x0))
  const maxX = Math.max(...all.map(s => s.x1))
  const body = median(rows.map(r => r.size)) || 10
  const BIN = 2
  const n = Math.ceil((maxX - minX) / BIN) + 1
  const cov = new Array(n).fill(0)
  for (const r of rows) {
    const seen = new Set()
    for (const s of r.segs) {
      for (let b = Math.floor((s.x0 - minX) / BIN); b <= Math.floor((s.x1 - minX) / BIN); b++) seen.add(b)
    }
    for (const b of seen) cov[b]++
  }

  const limit = Math.max(1, rows.length * 0.04)
  const cands = []
  let start = -1
  for (let b = 0; b <= n; b++) {
    const open = b < n && cov[b] <= limit
    if (open && start < 0) start = b
    if (!open && start >= 0) {
      if (start > 0 && b < n && (b - start) * BIN >= Math.max(10, body * 1.5)) cands.push(minX + ((start + b) / 2) * BIN)
      start = -1
    }
  }

  const priced = all.filter(s => hasPrice(s.text))
  const gutters = []
  for (const g of cands) {
    const lo = gutters.length ? gutters[gutters.length - 1] : -Infinity
    const left = priced.filter(s => s.x0 >= lo && s.x1 <= g).length
    const right = priced.filter(s => s.x0 >= g).length
    if (left >= 2 && right >= 2) gutters.push(g)
  }

  const colOf = x => {
    let c = 0
    while (c < gutters.length && x > gutters[c]) c++
    return c
  }
  const lineOf = (r, segs) => ({ y: r.y, size: Math.max(...segs.map(s => s.size)), text: segs.map(s => s.text).join('   ') })

  const out = []
  let band = []
  const flush = () => {
    for (let c = 0; c <= gutters.length; c++) {
      const col = []
      for (const r of band) {
        const segs = r.segs.filter(s => colOf((s.x0 + s.x1) / 2) === c)
        if (segs.length) col.push(lineOf(r, segs))
      }
      emitColumn(col, out)
    }
    band = []
  }
  for (const r of rows) {
    const spans = gutters.some(g => r.segs.some(s => s.x0 < g - 1 && s.x1 > g + 1))
    if (spans) {
      flush()
      emitColumn([lineOf(r, r.segs)], out)
    } else {
      band.push(r)
    }
  }
  flush()
  return out
}

/* ── PDF reading ──────────────────────────────────────────────────────── */

let pdfjs = null
function loadPdfjs() {
  pdfjs ??= import(/* @vite-ignore */ `${PDFJS}/build/pdf.min.mjs`).then(lib => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/build/pdf.worker.min.mjs`
    return lib
  }).catch(() => {
    pdfjs = null
    throw new Error("Couldn't load the PDF reader. Check the connection, or paste the menu text instead.")
  })
  return pdfjs
}

const abortError = () => new DOMException('Cancelled', 'AbortError')

export function checkFile(file) {
  if (!file) return 'No file chosen.'
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
  if (!isPdf) return 'Only PDF files can be read. For a photo or scan, paste the menu text instead.'
  if (file.size > MAX_BYTES) return 'That file is over 30 MB.'
  return ''
}

// Read a PDF's text layer and parse it. Throws with a plain message when
// the file is wrong or has no text (a scan). onProgress({ page, pages }).
export async function extractFromPdfText(file, { onProgress, signal } = {}) {
  const bad = checkFile(file)
  if (bad) throw new Error(bad)
  const lib = await loadPdfjs()
  if (signal?.aborted) throw abortError()

  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${PDFJS}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS}/standard_fonts/`,
    isEvalSupported: false,
  })
  const stop = () => task.destroy()
  signal?.addEventListener('abort', stop)
  try {
    let doc
    try {
      doc = await task.promise
    } catch (e) {
      if (signal?.aborted) throw abortError()
      throw new Error(e?.name === 'PasswordException' ? 'This PDF is password protected.' : "That file couldn't be opened as a PDF.")
    }
    const pages = []
    let chars = 0
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw abortError()
      onProgress?.({ page: n, pages: doc.numPages })
      const page = await doc.getPage(n)
      const tc = await page.getTextContent()
      const items = []
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue
        const [a, b, c, d, x, y] = it.transform
        // Skip rotated text (spine labels, stamps); menus read horizontally.
        if (Math.abs(b) > Math.abs(a)) continue
        chars += it.str.replace(/\s/g, '').length
        items.push({ str: it.str, x, y, w: it.width, h: Math.hypot(c, d) || it.height })
      }
      pages.push(linesFromItems(items))
      page.cleanup()
    }
    if (chars < 20) throw new Error(NO_TEXT)

    // The shop name or a footer repeated on most pages is not a heading.
    const seen = new Map()
    for (const p of pages) {
      for (const t of new Set(p.map(l => normalize(l.text)).filter(Boolean))) seen.set(t, (seen.get(t) || 0) + 1)
    }
    const repeated = t => {
      const k = seen.get(normalize(t)) || 0
      return k >= 3 && k >= pages.length * 0.6 && !hasPrice(t)
    }
    const lines = []
    for (const p of pages) {
      lines.push(...p.filter(l => !l.text || !repeated(l.text)), { text: '' })
    }
    return parseMenuLines(lines)
  } finally {
    signal?.removeEventListener('abort', stop)
    if (signal?.aborted) task.destroy()
  }
}

/* ── Config patch ─────────────────────────────────────────────────────── */

const nameKey = s => squash(String(s || '').toLowerCase())

export function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 32).replace(/-+$/, '')
}

// Readable ids where they're free ("spring-rolls"), newId otherwise.
function makeId(name, prefix, used) {
  const slug = slugify(name)
  let id = slug && !used.has(slug) ? slug : newId(slug || prefix)
  while (used.has(id)) id = newId(slug || prefix)
  used.add(id)
  return id
}

// ImportedMenu -> { categories, items } for the config.
//   mode 'replace': the imported menu is the whole menu.
//   mode 'append': imported categories merge into existing ones with the
//     same name (case-insensitive); items already there are skipped (same
//     name in that category, or same name and price anywhere).
//   include(item, category) -> bool picks what goes in. By default anything
//     not marked `include: false` (the review screen sets that).
export function toConfigPatch(imported, config, { mode = 'append', include } = {}) {
  const keep = include || ((item, cat) => item.include !== false && cat.include !== false)
  const append = mode !== 'replace'
  const oldCats = config?.categories || []
  const oldItems = config?.items || []
  const categories = append ? [...oldCats] : []
  const items = append ? [...oldItems] : []
  // Never reuse an old id, even when replacing: modifiers may still list it.
  const usedCat = new Set(oldCats.map(c => c.id))
  const usedItem = new Set(oldItems.map(i => i.id))
  const catByName = new Map(categories.map(c => [nameKey(c.name), c]))
  const inCat = new Map()
  const everywhere = new Set()
  for (const i of items) {
    const k = nameKey(i.name)
    if (!inCat.has(i.categoryId)) inCat.set(i.categoryId, new Set())
    inCat.get(i.categoryId).add(k)
    everywhere.add(`${k}|${round2(i.price)}`)
  }

  for (const ic of imported?.categories || []) {
    const picked = (ic.items || []).filter(it => keep(it, ic) && squash(it.name || it.nameAlt || ''))
    if (!picked.length) continue
    const catName = squash(ic.name || ic.nameAlt || 'Menu')
    let cat = catByName.get(nameKey(catName))
    if (!cat) {
      cat = { id: makeId(catName, 'cat', usedCat), name: catName, nameAlt: squash(ic.name ? ic.nameAlt || '' : '') }
      categories.push(cat)
      catByName.set(nameKey(catName), cat)
    }
    if (!inCat.has(cat.id)) inCat.set(cat.id, new Set())
    const here = inCat.get(cat.id)

    for (const it of picked) {
      const name = squash(it.name || it.nameAlt)
      const price = round2(it.price)
      const k = nameKey(name)
      if (here.has(k) || everywhere.has(`${k}|${price}`)) continue
      here.add(k)
      everywhere.add(`${k}|${price}`)
      const usedChoice = new Set()
      const item = {
        id: makeId(name, 'item', usedItem),
        categoryId: cat.id,
        name,
        nameAlt: squash(it.name ? it.nameAlt || '' : ''),
        price,
        color: '',
        choices: (it.choices || [])
          .filter(c => c.include !== false && squash(c.name || c.nameAlt || ''))
          .map(c => ({
            id: makeId(c.name || c.nameAlt, 'choice', usedChoice),
            name: squash(c.name || c.nameAlt),
            nameAlt: squash(c.name ? c.nameAlt || '' : ''),
            price: round2(c.price),
          })),
        modifierIds: null,
      }
      if (squash(it.description || '')) item.description = squash(it.description)
      items.push(item)
    }
  }
  return { categories, items }
}
