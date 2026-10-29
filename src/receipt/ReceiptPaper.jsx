// On-screen receipt drawn from the same print ops the Pi turns into bytes,
// at true proportions: 12 x 24 dot character cells (576 dots for 48 columns),
// w x h magnification, wide characters two cells, rules at their dot height.
//
//   <ReceiptPaper doc={printDoc} width={320} />
//   width    = printable width in px (the paper margin is added around it)
//   selected = blockId to outline, onPick(blockId) makes lines clickable
import { memo, useMemo } from 'react'
import { charWidth } from '../../shared/text.js'
import { rasterToDataUrl } from '../lib/raster.js'
import './ReceiptPaper.css'

const CELL = 12          // dots per normal-width column
const CHAR_H = 24        // dots per normal-height line of glyphs
const DEFAULT_LS = 30    // ESC 2 default line feed, roughly

const rowDots = (ls, h) => Math.max(ls || DEFAULT_LS, CHAR_H * h)

function xFor(align, used, total) {
  if (align === 'center') return Math.max(0, (total - used) / 2)
  if (align === 'right') return Math.max(0, total - used)
  return 0
}

const TextLine = memo(function TextLine({ op, scale, ls, paperDots, tw }) {
  const chars = []
  let cols = 0
  for (const ch of op.text || '') {
    const cw = charWidth(ch, tw)
    if (!cw) continue
    chars.push([ch, cw])
    cols += cw
  }
  const w = op.w || 1, h = op.h || 1
  const usedDots = cols * CELL * w
  const runStyle = {
    left: xFor(op.align, usedDots, paperDots) * scale,
    width: cols * CELL * scale,
    height: CHAR_H * scale,
    fontSize: 20 * scale,
    lineHeight: `${CHAR_H * scale}px`,
    transform: w !== 1 || h !== 1 ? `scale(${w}, ${h})` : undefined,
  }
  const cls = ['rp-run', op.bold && 'is-bold', op.underline && 'is-under', op.invert && 'is-invert'].filter(Boolean).join(' ')
  return (
    <div className="rp-line" style={{ height: rowDots(ls, h) * scale }}>
      <div className={cls} style={runStyle}>
        {chars.map(([ch, cw], i) => (
          <span key={i} style={{ width: cw * CELL * scale }}>{ch === ' ' ? ' ' : ch}</span>
        ))}
      </div>
    </div>
  )
})

function Rule({ op, scale }) {
  const pad = (op.pad ?? 3) * scale
  return (
    <div className="rp-rule" style={{ paddingTop: pad, paddingBottom: pad }}>
      <div style={{ height: Math.max(1, (op.thickness || 1) * scale) }} />
    </div>
  )
}

function RasterImage({ op, scale, paperDots }) {
  const src = useMemo(() => rasterToDataUrl(op.width, op.height, op.data), [op.width, op.height, op.data])
  const w = Math.min(op.width, paperDots)
  return (
    <div className="rp-image" style={{ height: op.height * scale }}>
      <img src={src} alt="" style={{ left: xFor(op.align, w, paperDots) * scale, width: op.width * scale, height: op.height * scale }} />
    </div>
  )
}

// Byte-mode capacity per QR version at error level M; the printer picks the
// smallest version that fits.
const QR_CAP = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666]

// Stand-in symbol of the right size: real finder patterns, the data modules
// are a pattern seeded from the text. The printer draws the real code.
function qrPath(data) {
  const len = new TextEncoder().encode(data).length
  const v = Math.max(1, QR_CAP.findIndex(c => c >= len) + 1 || 20)
  const n = 17 + 4 * v
  let seed = 2166136261
  for (const ch of data) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619)
  const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ 0x5bd1e995) >>> 0) / 4294967296
  const inFinder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7)
  const finder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => {
    const dx = x - fx, dy = y - fy
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
  })
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const on = inFinder(x, y) ? finder(x, y) : (y === 6 || x === 6) ? (x + y) % 2 === 0 : rnd() < 0.5
    if (on) d += `M${x} ${y}h1v1h-1z`
  }
  return { n, d }
}

function Qr({ op, scale, paperDots }) {
  const { n, d } = useMemo(() => qrPath(op.data || ''), [op.data])
  const dots = n * (op.size || 6)
  return (
    <div className="rp-qr" style={{ height: dots * scale }}>
      <svg viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" style={{ left: xFor(op.align, dots, paperDots) * scale, width: dots * scale, height: dots * scale }}>
        <path d={d} />
      </svg>
    </div>
  )
}

function Op({ op, scale, ls, paperDots, tw }) {
  switch (op.op) {
    case 'text':  return <TextLine op={op} scale={scale} ls={ls} paperDots={paperDots} tw={tw} />
    case 'rule':  return <Rule op={op} scale={scale} />
    case 'feed':  return <div style={{ height: (op.lines || 1) * (ls || DEFAULT_LS) * scale }} />
    case 'image': return <RasterImage op={op} scale={scale} paperDots={paperDots} />
    case 'qr':    return <Qr op={op} scale={scale} paperDots={paperDots} />
    default:      return null
  }
}

export default function ReceiptPaper({ doc, width = 320, selected, onPick, className }) {
  const cols = doc?.cols || 48
  const paperDots = cols * CELL
  const scale = width / paperDots
  const ls = doc?.lineSpacing ?? 24
  const tw = useMemo(() => ({ ambiguousWide: doc?.encoding === 'gb2312' }), [doc?.encoding])
  // Paper is wider than the print head: 80mm paper / 72mm printed, 58 / 48.
  const margin = width * (cols >= 40 ? 4 / 72 : 5 / 48)

  // Consecutive ops from one block share a wrapper, so a click anywhere on
  // them picks the block.
  const groups = useMemo(() => {
    const out = []
    for (const [i, op] of (doc?.ops || []).entries()) {
      if (op.op === 'cut') continue
      const last = out[out.length - 1]
      if (last && last.blockId === op.blockId && op.blockId) last.ops.push([i, op])
      else out.push({ blockId: op.blockId, key: i, ops: [[i, op]] })
    }
    return out
  }, [doc])

  return (
    <div
      className={['rp-paper', onPick && 'is-pickable', className].filter(Boolean).join(' ')}
      style={{ width: width + margin * 2, padding: `${16 * scale}px ${margin}px ${64 * scale}px` }}
    >
      {groups.map(g => (
        <div
          key={g.key}
          className={['rp-block', selected && g.blockId === selected && 'is-selected'].filter(Boolean).join(' ')}
          onClick={onPick && g.blockId ? e => { e.stopPropagation(); onPick(g.blockId) } : undefined}
        >
          {g.ops.map(([i, op]) => <Op key={i} op={op} scale={scale} ls={ls} paperDots={paperDots} tw={tw} />)}
        </div>
      ))}
    </div>
  )
}
