// PrintDoc (docs/SPEC.md §4.3) -> ESC/POS bytes. Pure, so it can be tested
// without a printer. Byte details are the ones proven on the Fortune House
// printer: GS ! for size, ESC 3 spacing scaled by height, GS v 0 rules,
// FS & + iconv for GB2312 printers.
import iconv from 'iconv-lite'

const b = (...bytes) => Buffer.from(bytes)

export const CMD = {
  init:      b(0x1b, 0x40),
  chineseOn: b(0x1c, 0x26),   // FS &: GB2312 two-byte mode
  lf:        b(0x0a),
  align:     n => b(0x1b, 0x61, n),
  size:      (w, h) => b(0x1d, 0x21, (((w - 1) & 7) << 4) | ((h - 1) & 7)),
  spacing:   n => (n > 0 ? b(0x1b, 0x33, Math.min(255, n)) : b(0x1b, 0x32)),
  bold:      on => b(0x1b, 0x45, on ? 1 : 0),
  underline: on => b(0x1b, 0x2d, on ? 1 : 0),
  invert:    on => b(0x1d, 0x42, on ? 1 : 0),
  feed:      n => b(0x1b, 0x64, Math.min(255, n)),
  // GS V 66 / 65: feed to the cutter, then partial / full cut.
  cut:       full => b(0x1d, 0x56, full ? 0x41 : 0x42, 0x00),
}

const ALIGN = { left: 0, center: 1, right: 2 }
const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d)

// Same clean-up as shared/text.js printable(), repeated here so the bridge
// folder works on its own.
export function encodeText(text, encoding) {
  let s = String(text ?? '')
    .replace(/¼/g, '1/4').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/[–—]/g, '-')
    .replace(/\p{Extended_Pictographic}|[️‍⃣]/gu, ch => (ch.codePointAt(0) < 0x2300 && ch !== '‍') || ch === '★' || ch === '☆' ? ch : '')
  if (encoding === 'gb2312') return iconv.encode(s.replace(/£/g, '￡'), 'gb2312')
  return Buffer.from(s, 'utf8')
}

// GS v 0 raster: `rows` of `bytesPerRow` packed bits. Split into bands,
// since some printers choke on one very tall image.
function raster(bytesPerRow, rows, data) {
  const out = []
  const BAND = 256
  for (let y = 0; y < rows; y += BAND) {
    const h = Math.min(BAND, rows - y)
    out.push(b(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8))
    out.push(data.subarray(y * bytesPerRow, (y + h) * bytesPerRow))
  }
  return out
}

export function ruleBytes(paperDots, thickness, pad) {
  const bpr = paperDots / 8
  const rows = pad * 2 + thickness
  const data = Buffer.alloc(bpr * rows, 0)
  data.fill(0xff, bpr * pad, bpr * (pad + thickness))
  return raster(bpr, rows, data)
}

// GS ( k, model 2, error correction M.
export function qrBytes(text, size) {
  const data = Buffer.from(String(text), 'utf8')
  const len = data.length + 3
  return [
    b(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    b(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, clamp(size, 1, 16, 6)),
    b(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31),
    b(0x1d, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30), data,
    b(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
  ]
}

// opts.encoding overrides doc.encoding; opts.cut: 'partial' | 'full' | 'none'.
export function encodeDoc(doc, { encoding, cut = 'partial' } = {}) {
  const enc = encoding || doc?.encoding || 'utf8'
  const cols = clamp(doc?.cols, 16, 96, 48)
  const paperDots = cols * 12
  const ls = clamp(doc?.lineSpacing, 0, 255, 24)
  const out = [CMD.init]
  if (enc === 'gb2312') out.push(CMD.chineseOn)
  const normal = () => [CMD.size(1, 1), CMD.spacing(ls), CMD.bold(false), CMD.underline(false), CMD.invert(false)]
  out.push(...normal())

  for (const op of doc?.ops || []) {
    switch (op.op) {
      case 'text': {
        const w = clamp(op.w, 1, 8, 1), h = clamp(op.h, 1, 8, 1)
        out.push(
          CMD.align(ALIGN[op.align] ?? 0), CMD.size(w, h), CMD.spacing(ls ? ls * h : 0),
          CMD.bold(op.bold), CMD.underline(op.underline), CMD.invert(op.invert),
          encodeText(op.text, enc), CMD.lf,
        )
        if (op.invert || op.underline || op.bold || w > 1 || h > 1) out.push(...normal())
        break
      }
      case 'rule':
        out.push(CMD.align(0), ...ruleBytes(paperDots, clamp(op.thickness, 1, 8, 2), clamp(op.pad, 0, 48, 3)))
        break
      case 'feed':
        out.push(...normal(), CMD.feed(clamp(op.lines, 0, 255, 1)))
        break
      case 'image': {
        const width = clamp(op.width, 8, 2048, 0)
        const bpr = Math.ceil(width / 8)
        const data = Buffer.from(op.data || '', 'base64')
        const rows = Math.min(clamp(op.height, 0, 10000, 0), Math.floor(data.length / bpr))
        if (rows > 0) out.push(CMD.align(ALIGN[op.align] ?? 1), ...raster(bpr, rows, data))
        break
      }
      case 'qr':
        if (op.data) out.push(CMD.align(ALIGN[op.align] ?? 1), ...qrBytes(op.data, op.size), CMD.lf)
        break
      case 'cut':
        break   // always added last, below
    }
  }

  out.push(CMD.align(0), ...normal())
  if (cut === 'none') out.push(CMD.feed(4))
  else out.push(CMD.cut(cut === 'full'))
  return Buffer.concat(out)
}
