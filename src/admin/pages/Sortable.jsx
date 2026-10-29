// Vertical drag to reorder, with Pointer Events so mouse, pen and touch all
// work. Only the grip starts a drag (it has touch-action: none), so the rest
// of the row stays tappable and the page still scrolls under a finger.
//
//   <SortableList items={rows} keyOf={r => r.id} onMove={(from, to) => …} className="ui-list">
//     {(row, { handle, style, dragging }) => <div className="ui-list__row" style={style}>{handle}…</div>}
//   </SortableList>
//
// The render function's root must take `style`: rows are measured and moved
// as the list's direct children.
import { Fragment, useEffect, useRef, useState } from 'react'
import { Icon } from '../../ui/index.jsx'

const EDGE = 48       // px from the scroller edge where auto-scroll starts
const SPEED = 12      // px per frame at the very edge

function scrollParent(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return document.scrollingElement || document.documentElement
}

export function SortableList({ items, keyOf, onMove, children, className, as: Tag = 'div' }) {
  const listRef = useRef()
  const st = useRef(null)
  const [drag, setDrag] = useState(null) // { from, to, dy, step }

  useEffect(() => () => cancelAnimationFrame(st.current?.raf), [])

  function compute() {
    const s = st.current
    const dy = s.y - s.startY + (s.scroller.scrollTop - s.scroll0)
    const r = s.rects[s.from]
    const center = r.top + r.height / 2 + dy
    // Target index = how many other rows have their middle above the dragged row's middle.
    let to = 0
    s.rects.forEach((o, i) => { if (i !== s.from && o.top + o.height / 2 < center) to++ })
    s.to = to
    setDrag({ from: s.from, to, dy, step: s.step })
  }

  function tick() {
    const s = st.current
    if (!s) return
    const box = s.scroller === document.scrollingElement || s.scroller === document.documentElement
      ? { top: 0, bottom: window.innerHeight }
      : s.scroller.getBoundingClientRect()
    let v = 0
    if (s.y < box.top + EDGE) v = -SPEED * (1 - Math.max(0, s.y - box.top) / EDGE)
    else if (s.y > box.bottom - EDGE) v = SPEED * (1 - Math.max(0, box.bottom - s.y) / EDGE)
    if (v) {
      s.scroller.scrollTop += v
      compute()
    }
    s.raf = requestAnimationFrame(tick)
  }

  function start(e, index) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rects = [...listRef.current.children].map(el => el.getBoundingClientRect())
    const scroller = scrollParent(listRef.current)
    // Distance between neighbouring rows, including any gap.
    const r = rects[index]
    const next = rects[index + 1] || rects[index - 1]
    const step = next ? Math.abs(next.top - r.top) : r.height
    st.current = { from: index, to: index, startY: e.clientY, y: e.clientY, rects, scroller, scroll0: scroller.scrollTop, step, raf: 0 }
    st.current.raf = requestAnimationFrame(tick)
    document.body.style.userSelect = 'none'
    setDrag({ from: index, to: index, dy: 0, step })
  }

  function moveTo(e) {
    if (!st.current) return
    st.current.y = e.clientY
    compute()
  }

  function end(cancelled) {
    const s = st.current
    if (!s) return
    cancelAnimationFrame(s.raf)
    st.current = null
    document.body.style.userSelect = ''
    setDrag(null)
    if (!cancelled && s.to !== s.from) onMove(s.from, s.to)
  }

  function onKey(e, index) {
    if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); onMove(index, index - 1) }
    if (e.key === 'ArrowDown' && index < items.length - 1) { e.preventDefault(); onMove(index, index + 1) }
  }

  function shift(i) {
    if (!drag || i === drag.from) return 0
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.step
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return drag.step
    return 0
  }

  return (
    <Tag ref={listRef} className={className}>
      {items.map((item, i) => {
        const dragging = drag?.from === i
        const style = dragging
          ? { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 2, background: 'var(--ui-surface)', boxShadow: 'var(--ui-shadow-pop)' }
          : drag ? { transform: `translateY(${shift(i)}px)`, transition: 'transform 120ms cubic-bezier(.2,.6,.2,1)' } : undefined
        const handle = (
          <button
            type="button" className="pg-grip" aria-label="Drag to reorder (or use the arrow keys)" title="Drag to reorder"
            onPointerDown={e => start(e, i)} onPointerMove={moveTo}
            onPointerUp={() => end(false)} onPointerCancel={() => end(true)}
            onKeyDown={e => onKey(e, i)} onClick={e => e.stopPropagation()}
          >
            <Icon name="grip" />
          </button>
        )
        return <Fragment key={keyOf(item)}>{children(item, { index: i, handle, style, dragging })}</Fragment>
      })}
    </Tag>
  )
}

// Immutable move within an array.
export function moveItem(arr, from, to) {
  const out = arr.slice()
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}

// Reorders the subset of `all` that matches `pred`, leaving every other
// element where it was. Used for items, which are one array across categories.
export function moveWithin(all, pred, from, to) {
  const idx = all.map((x, i) => (pred(x) ? i : -1)).filter(i => i >= 0)
  const subset = moveItem(idx.map(i => all[i]), from, to)
  const out = all.slice()
  idx.forEach((pos, k) => { out[pos] = subset[k] })
  return out
}
