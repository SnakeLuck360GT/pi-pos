// Fixed-width text helpers for receipts. A thermal printer lays text out on a
// grid of columns: CJK and other East Asian wide characters take two columns,
// everything else one. All wrapping and padding goes through colWidth so
// mixed English/Chinese lines line up on paper and in the on-screen preview.
// Plain ESM, no imports: used by the browser, the functions and the Pi.

// East Asian Wide / Fullwidth ranges (Unicode EastAsianWidth W + F).
const WIDE = [
  [0x1100, 0x115f],   // Hangul Jamo
  [0x231a, 0x231b], [0x2329, 0x232a],
  [0x2e80, 0x303e],   // CJK radicals, punctuation
  [0x3041, 0x33ff],   // kana, bopomofo, CJK compat
  [0x3400, 0x4dbf],   // CJK ext A
  [0x4e00, 0x9fff],   // CJK unified
  [0xa000, 0xa4cf],   // Yi
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],   // Hangul syllables
  [0xf900, 0xfaff],   // CJK compat ideographs
  [0xfe10, 0xfe19], [0xfe30, 0xfe6f],
  [0xff00, 0xff60],   // fullwidth forms
  [0xffe0, 0xffe6],   // fullwidth signs (incl. ￡)
  [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff],
  [0x20000, 0x2fffd], [0x30000, 0x3fffd],
]

// Characters that are narrow in UTF-8 but print as a 2-byte, 2-column glyph
// on a GB2312 printer (× · ° ± Greek, Cyrillic, curly quotes, box drawing…).
// £ counts too, because it is sent as the fullwidth ￡.
const AMBIGUOUS = [
  [0x00a3, 0x00a3], [0x00a4, 0x00a4], [0x00a7, 0x00a8], [0x00b0, 0x00b1], [0x00b7, 0x00b7],
  [0x00d7, 0x00d7], [0x00e0, 0x00e1], [0x00e8, 0x00ea], [0x00ec, 0x00ed], [0x00f2, 0x00f3],
  [0x00f7, 0x00f7], [0x00f9, 0x00fa], [0x00fc, 0x00fc],
  [0x0391, 0x03c9], [0x0401, 0x0401], [0x0410, 0x044f], [0x0451, 0x0451],
  [0x2018, 0x2019], [0x201c, 0x201d], [0x2025, 0x2026], [0x2030, 0x2030], [0x2032, 0x2033], [0x203b, 0x203b],
  [0x2103, 0x2103], [0x2116, 0x2116], [0x2160, 0x216b], [0x2190, 0x2193],
  [0x2208, 0x2299], [0x2460, 0x249b], [0x2500, 0x254b], [0x25a0, 0x25e2], [0x2605, 0x2606], [0x2640, 0x2642],
]

const inRanges = (cp, ranges) => {
  for (const [a, b] of ranges) if (cp >= a && cp <= b) return true
  return false
}

// opts.ambiguousWide: count GB2312 two-byte symbols as 2 (set when printing gb2312).
export function charWidth(ch, opts) {
  const cp = ch.codePointAt(0)
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f) return 0
  if (cp < 0x1100 && !(opts?.ambiguousWide)) return 1
  if (inRanges(cp, WIDE)) return 2
  if (opts?.ambiguousWide && inRanges(cp, AMBIGUOUS)) return 2
  return 1
}

export function colWidth(str, opts) {
  let n = 0
  for (const ch of String(str ?? '')) n += charWidth(ch, opts)
  return n
}

export const isWide = ch => charWidth(ch) === 2

// Thermal printers have no emoji glyphs. Keep the few pictographs that do
// exist in printer fonts (© ® ™ ★ ☆ arrows) and drop the rest.
const KEEP = new Set([0x2605, 0x2606])
export function stripEmoji(str) {
  return String(str ?? '').replace(/\p{Extended_Pictographic}|[️‍⃣]|[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu, ch => {
    const cp = ch.codePointAt(0)
    return (cp < 0x2300 && cp !== 0x200d) || KEEP.has(cp) ? ch : ''
  })
}

// Text exactly as it will print: no emoji, characters most printer fonts lack
// spelled out, and £ as ￡ on GB2312 printers (they have no half-width £).
export function printable(str, encoding) {
  let s = stripEmoji(str).replace(/¼/g, '1/4').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/[–—]/g, '-').replace(/\t/g, ' ')
  if (encoding === 'gb2312') s = s.replace(/£/g, '￡')
  return s
}

// Split into wrap units: runs of narrow non-space characters (words), single
// spaces, and single wide characters (CJK can break anywhere).
function units(text, opts) {
  const out = []
  let word = ''
  for (const ch of text) {
    if (ch === ' ' || charWidth(ch, opts) === 2) {
      if (word) { out.push(word); word = '' }
      out.push(ch)
    } else word += ch
  }
  if (word) out.push(word)
  return out
}

// Greedy wrap where line i may have its own width: widthFor(i) -> columns.
// Breaks at spaces, and anywhere between wide characters; a word longer than
// a whole line is broken mid-word. Leading indentation on the first line is
// kept; continuation lines never start with a space.
export function wrapWidths(text, widthFor, opts) {
  const lines = ['']
  const width = () => Math.max(1, widthFor(lines.length - 1))
  const cur = () => lines[lines.length - 1]
  const set = s => { lines[lines.length - 1] = s }
  const newLine = () => lines.push('')
  const fits = s => colWidth(s.trimEnd(), opts) <= width()

  for (const u of units(String(text ?? ''), opts)) {
    if (u === ' ') {
      if (lines.length === 1 || cur() !== '') set(cur() + u)
      continue
    }
    if (fits(cur() + u)) { set(cur() + u); continue }
    if (cur().trim() && colWidth(u, opts) <= width()) {
      set(cur().trimEnd()); newLine(); set(u); continue
    }
    // Longer than a whole line: break anywhere.
    for (const ch of u) {
      if (fits(cur() + ch) || !cur().trim()) set(cur() + ch)
      else { set(cur().trimEnd()); newLine(); set(ch) }
    }
  }
  return lines.map(l => l.trimEnd())
}

// Wrap to `cols` columns. Returns an array of lines ('\n' starts a new line).
export function wrap(text, cols, opts) {
  return String(text ?? '').split('\n').flatMap(line => wrapWidths(line, () => cols, opts))
}

// Cut to at most `cols` columns, ending with `ellipsis` when something was cut.
export function truncate(str, cols, ellipsis = '…', opts) {
  const s = String(str ?? '')
  if (colWidth(s, opts) <= cols) return s
  const ew = colWidth(ellipsis, opts)
  let out = ''
  for (const ch of s) {
    if (colWidth(out + ch, opts) + ew > cols) break
    out += ch
  }
  return out.trimEnd() + (cols >= ew ? ellipsis : '')
}

export function padRight(str, cols, opts) {
  const s = String(str ?? '')
  return s + ' '.repeat(Math.max(0, cols - colWidth(s, opts)))
}

export function padLeft(str, cols, opts) {
  const s = String(str ?? '')
  return ' '.repeat(Math.max(0, cols - colWidth(s, opts))) + s
}

// Pad both sides to exactly `cols` columns (extra space goes right), so an
// inverted band spans the whole line.
export function center(str, cols, opts) {
  const s = String(str ?? '')
  const free = cols - colWidth(s, opts)
  if (free <= 0) return s
  const l = Math.floor(free / 2)
  return ' '.repeat(l) + s + ' '.repeat(free - l)
}

// Pad to `cols` by alignment.
export function align(str, cols, how = 'left', opts) {
  if (how === 'center') return center(str, cols, opts)
  if (how === 'right') return padLeft(str, cols, opts)
  return padRight(str, cols, opts)
}

// "Label          £12.00" filling exactly `cols` columns, with at least one
// space between. A label too long to fit is cut short with an ellipsis.
export function twoCol(left, right, cols, opts) {
  const r = String(right ?? '')
  const room = cols - colWidth(r, opts) - 1
  const l = room > 0 ? truncate(String(left ?? ''), room, '…', opts) : ''
  return padRight(l, cols - colWidth(r, opts), opts) + r
}
