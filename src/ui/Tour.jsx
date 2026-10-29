// First-run walkthrough. Dims the page, rings one element at a time and shows
// a short note beside it. Each tour runs once per browser (localStorage), and
// resetTours() brings them all back ("Show tips again" in the sidebar).
//
//   <Tour id="designer" steps={[
//     { target: '[data-tour="palette"]', title: 'Blocks', body: 'Drag one onto the screen.' },
//     { title: 'That's it', body: 'No target = centred note.' },
//   ]} />
//
// Steps whose target isn't on the page are skipped. Pass `run` to start it
// manually (e.g. from a "Take the tour" button) even if it was seen.
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './index.jsx'

const KEY = 'pipos.tours'
const PAD = 6
const GAP = 12
const W = 300

function seenAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
export const tourSeen = id => !!seenAll()[id]
function markSeen(id) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...seenAll(), [id]: true })) } catch {}
}
export function resetTours() {
  try { localStorage.removeItem(KEY) } catch {}
  window.dispatchEvent(new Event('pipos:tours-reset'))
}

const find = s => (s.target ? document.querySelector(s.target) : null)

export function Tour({ id, steps, run, delay = 400, onDone }) {
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)

  // Start once the page has rendered its targets.
  useEffect(() => {
    const start = () => {
      if (!run && tourSeen(id)) return
      const t = setTimeout(() => { setI(0); setActive(true) }, delay)
      return () => clearTimeout(t)
    }
    const stop = start()
    const onReset = () => start()
    window.addEventListener('pipos:tours-reset', onReset)
    return () => { stop?.(); window.removeEventListener('pipos:tours-reset', onReset) }
  }, [id, run, delay])

  // Only steps that can be shown right now.
  const visible = active ? steps.filter(s => !s.target || find(s)) : []
  const step = visible[i]

  useLayoutEffect(() => {
    if (!step) return
    const el = find(step)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [step])

  useEffect(() => {
    if (!active) return
    const onKey = e => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!active || !step) return null

  function finish() {
    markSeen(id)
    setActive(false)
    onDone?.()
  }
  function next() {
    if (i >= visible.length - 1) finish()
    else setI(i + 1)
  }

  const pos = rect ? place(rect, step.placement) : null

  return createPortal(
    <div className="ui-tour" role="dialog" aria-label={step.title}>
      {rect
        ? <div className="ui-tour__ring" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        : <div className="ui-tour__dim" />}
      <div className={`ui-tour__card${pos ? '' : ' is-center'}`} style={pos || undefined}>
        <div className="ui-tour__count">{i + 1} of {visible.length}</div>
        <div className="ui-tour__title">{step.title}</div>
        {step.body && <p className="ui-tour__body">{step.body}</p>}
        <div className="ui-tour__foot">
          <Button variant="ghost" size="sm" onClick={finish}>Skip</Button>
          <div className="ui-spacer" />
          {i > 0 && <Button size="sm" onClick={() => setI(i - 1)}>Back</Button>}
          <Button variant="primary" size="sm" onClick={next}>{i === visible.length - 1 ? 'Done' : 'Next'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Put the card on the side with the most room, clamped to the viewport.
function place(r, placement) {
  const vw = window.innerWidth, vh = window.innerHeight
  const room = { right: vw - r.right, left: r.left, bottom: vh - r.bottom, top: r.top }
  const side = placement || (room.right >= W + GAP * 2 ? 'right' : room.bottom >= 180 ? 'bottom' : room.left >= W + GAP * 2 ? 'left' : 'top')
  const clampX = x => Math.max(GAP, Math.min(x, vw - W - GAP))
  const clampY = y => Math.max(GAP, Math.min(y, vh - 200))
  switch (side) {
    case 'right':  return { top: clampY(r.top), left: r.right + PAD + GAP }
    case 'left':   return { top: clampY(r.top), left: r.left - PAD - GAP - W }
    case 'top':    return { top: Math.max(GAP, r.top - PAD - GAP - 160), left: clampX(r.left) }
    default:       return { top: r.bottom + PAD + GAP, left: clampX(r.left) }
  }
}
