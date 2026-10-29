// Pure grid maths for the layout designer. Everything works in device pixels
// (the POS screen at 1:1), so the canvas zoom only matters when converting
// pointer coordinates. Rects are { x, y, w, h } in cells, 0-based.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Cell geometry for a grid that fills `width` × `height` inside `pad`, with
// `gap` between tracks. Mirrors the CSS grid in PosGrid (1fr tracks).
export function makeMetrics({ width, height, cols, rows, pad = 0, gap = 0 }) {
  const cellW = Math.max(0, (width - 2 * pad - (cols - 1) * gap) / cols)
  const cellH = Math.max(0, (height - 2 * pad - (rows - 1) * gap) / rows)
  return { width, height, cols, rows, pad, gap, cellW, cellH, stepX: cellW + gap, stepY: cellH + gap }
}

// Pixel box of a cell rect (also works for rects partly outside the grid,
// which is how invalid drag targets are drawn).
export function cellRect(r, m) {
  return {
    left: m.pad + r.x * m.stepX,
    top: m.pad + r.y * m.stepY,
    width: r.w * m.cellW + (r.w - 1) * m.gap,
    height: r.h * m.cellH + (r.h - 1) * m.gap,
  }
}

// Device-pixel point -> cell under it. A point in a gap belongs to the
// nearer cell. `inside` says whether the point is on the screen at all.
export function pointToCell(px, py, m) {
  const x = clamp(Math.floor((px - m.pad + m.gap / 2) / m.stepX), 0, m.cols - 1)
  const y = clamp(Math.floor((py - m.pad + m.gap / 2) / m.stepY), 0, m.rows - 1)
  const inside = px >= 0 && py >= 0 && px <= m.width && py <= m.height
  return { x, y, inside }
}

// Pixel drag distance -> whole cells (rounded, so half a cell snaps).
export function deltaCells(dx, dy, m) {
  return { dx: Math.round(dx / m.stepX) || 0, dy: Math.round(dy / m.stepY) || 0 }
}

export const inBounds = (r, cols, rows) =>
  r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && r.x + r.w <= cols && r.y + r.h <= rows

export const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

// Fit a rect inside the grid: shrink first if it is bigger than the grid,
// then slide it back in.
export function clampRect(r, cols, rows) {
  const w = clamp(Math.round(r.w) || 1, 1, cols)
  const h = clamp(Math.round(r.h) || 1, 1, rows)
  return { x: clamp(Math.round(r.x) || 0, 0, cols - w), y: clamp(Math.round(r.y) || 0, 0, rows - h), w, h }
}

// Min size can never exceed the grid, otherwise nothing would fit.
export function effectiveMin(minSize, cols, rows) {
  return { w: clamp(minSize?.w || 1, 1, cols), h: clamp(minSize?.h || 1, 1, rows) }
}

// Move by whole cells. Raw target, not clamped: the caller shows it red when
// it leaves the grid and drops nothing.
export const moveRect = (r, dx, dy) => ({ ...r, x: r.x + dx, y: r.y + dy })

// Keyboard nudge: stays inside the grid.
export const nudgeRect = (r, dx, dy, cols, rows) =>
  ({ ...r, x: clamp(r.x + dx, 0, cols - r.w), y: clamp(r.y + dy, 0, rows - r.h) })

// Resize from one of 8 handles ('n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw')
// by whole cells. The opposite edge stays put; size respects minSize and the
// grid edges.
export function resizeRect(start, handle, dx, dy, minSize, cols, rows) {
  const min = effectiveMin(minSize, cols, rows)
  let { x, y, w, h } = start
  const right = start.x + start.w
  const bottom = start.y + start.h
  if (handle.includes('e')) w = clamp(start.w + dx, min.w, cols - start.x)
  if (handle.includes('w')) { x = clamp(start.x + dx, 0, right - min.w); w = right - x }
  if (handle.includes('s')) h = clamp(start.h + dy, min.h, rows - start.y)
  if (handle.includes('n')) { y = clamp(start.y + dy, 0, bottom - min.h); h = bottom - y }
  return { x, y, w: Math.max(w, 1), h: Math.max(h, 1) }
}

// Keyboard resize (shift+arrows): grows/shrinks from the bottom-right corner.
export const growRect = (r, dw, dh, minSize, cols, rows) =>
  resizeRect(r, 'se', dw, dh, minSize, cols, rows)

// Place a new block with its top-left on `cell`, sliding it back in if its
// default size would run off the grid.
export function placeAt(cell, size, cols, rows) {
  return clampRect({ x: cell.x, y: cell.y, w: size.w, h: size.h }, cols, rows)
}

// First spot (row by row) where a w × h rect overlaps nothing. null if full.
export function findFreeSpot(blocks, w, h, cols, rows) {
  w = clamp(w, 1, cols)
  h = clamp(h, 1, rows)
  for (let y = 0; y + h <= rows; y++) {
    for (let x = 0; x + w <= cols; x++) {
      const r = { x, y, w, h }
      if (!blocks.some(b => overlaps(r, b))) return r
    }
  }
  return null
}

// Where a new or duplicated block goes: a free spot at its size, else a free
// spot at its min size, else the fallback (overlapping is allowed).
export function spotFor(blocks, size, minSize, cols, rows, fallback) {
  return findFreeSpot(blocks, size.w, size.h, cols, rows)
    || (minSize && findFreeSpot(blocks, minSize.w, minSize.h, cols, rows))
    || clampRect(fallback || { x: 0, y: 0, w: size.w, h: size.h }, cols, rows)
}

// Scale that fits a device frame into the available area with a margin.
// Never upscales, so the canvas stays crisp.
export function fitScale(contentW, contentH, availW, availH, margin = 32) {
  if (!contentW || !contentH || availW <= 0 || availH <= 0) return 1
  return clamp(Math.min((availW - 2 * margin) / contentW, (availH - 2 * margin) / contentH, 1), 0.1, 1)
}
