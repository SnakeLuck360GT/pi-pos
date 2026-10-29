import { Component, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { themeVars } from '../../lib/theme.js'
import { BlockFrame } from '../../pos/BlockFrame.jsx'
import { BlockContent } from '../../pos/PosGrid.jsx'
import {
  makeMetrics, cellRect, pointToCell, deltaCells, moveRect, resizeRect, inBounds, sameRect, fitScale,
} from './gridMath.js'

const cx = (...c) => c.filter(Boolean).join(' ')

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const DRAG_PX = 3
const FIT_MARGIN = 40

// A block that throws on sample data must not take the whole designer down.
class BlockBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidUpdate(prev) { if (prev.block !== this.props.block && this.state.error) this.setState({ error: null }) }
  render() {
    if (this.state.error) return <div className="dz-block-error">{this.props.label} could not render</div>
    return this.props.children
  }
}

// Same frame + content pair PosGrid renders, plus an error boundary.
function PreviewBlock({ block, def, ctx }) {
  return (
    <BlockFrame block={block}>
      <BlockBoundary block={block} label={def?.label || block.type}>
        <BlockContent block={block} ctx={ctx} />
      </BlockBoundary>
    </BlockFrame>
  )
}

// The real POS screen at device size. Memoised so hover and pointer moves
// that don't change the layout don't re-render every block.
const PosScreen = memo(function PosScreen({ theme, layout, ctx, blocks, width, height }) {
  const ref = useRef(null)
  // Keeps inputs inside blocks (search) out of the tab order.
  useEffect(() => { ref.current?.setAttribute('inert', '') }, [])
  return (
    <div ref={ref} className="pos-root pos-theme dz-pos" style={{ ...themeVars(theme), width, height }}>
      <div
        className="pos-grid dz-pos__grid"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
        }}
      >
        {layout.blocks.map(b => <PreviewBlock key={b.id} block={b} def={blocks[b.type]} ctx={ctx} />)}
      </div>
    </div>
  )
})

export function Canvas({ config, layout, ctx, blocks, device, zoom, selectedId, drag, onSelect, onDrag, onCommit, apiRef }) {
  const areaRef = useRef(null)
  const stageRef = useRef(null)
  const gesture = useRef(null)
  const [avail, setAvail] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const theme = config.theme
  const m = useMemo(() => makeMetrics({
    width: device.w, height: device.h, cols: layout.cols, rows: layout.rows,
    pad: Number(theme.padding) || 0, gap: Number(theme.gap) || 0,
  }), [device.w, device.h, layout.cols, layout.rows, theme.padding, theme.gap])

  const scale = zoom === 'fit' && avail.w ? fitScale(device.w, device.h, avail.w, avail.h, FIT_MARGIN) : 1

  // What the canvas shows: the committed layout plus the in-flight drag.
  // Nothing here touches undo history until onCommit.
  const display = useMemo(() => {
    if (!drag || !drag.valid) return layout
    if (drag.kind === 'add') return { ...layout, blocks: [...layout.blocks, drag.preview] }
    const b = layout.blocks.find(x => x.id === drag.id)
    if (!b) return layout
    const nb = { ...b, ...drag.rect }
    const others = layout.blocks.filter(x => x.id !== drag.id)
    return { ...layout, blocks: drag.kind === 'move' ? [...others, nb] : layout.blocks.map(x => (x.id === drag.id ? nb : x)) }
  }, [layout, drag])

  // Client point -> cell, for the palette drag in the left panel.
  apiRef.current = {
    hitTest(clientX, clientY) {
      const r = stageRef.current?.getBoundingClientRect()
      if (!r) return null
      return pointToCell((clientX - r.left) / scale, (clientY - r.top) / scale, m)
    },
  }

  const px = r => {
    const c = cellRect(r, m)
    return { left: c.left * scale, top: c.top * scale, width: c.width * scale, height: c.height * scale }
  }

  function start(e, kind, block, handle) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    onSelect(block.id)
    e.currentTarget.setPointerCapture(e.pointerId)
    const def = blocks[block.type]
    gesture.current = {
      kind, handle, id: block.id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
      start: { x: block.x, y: block.y, w: block.w, h: block.h },
      min: def?.minSize || { w: 1, h: 1 }, moved: false, rect: null, valid: true,
    }
  }

  // Captured pointer events bubble here from the hit area or handle.
  function move(e) {
    const s = gesture.current
    if (!s || s.pointerId !== e.pointerId) return
    if (!s.moved && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < DRAG_PX) return
    s.moved = true
    const d = deltaCells((e.clientX - s.sx) / scale, (e.clientY - s.sy) / scale, m)
    const rect = s.kind === 'move'
      ? moveRect(s.start, d.dx, d.dy)
      : resizeRect(s.start, s.handle, d.dx, d.dy, s.min, layout.cols, layout.rows)
    const valid = inBounds(rect, layout.cols, layout.rows)
    // Only re-render when the snapped target changes, not on every pixel.
    if (s.rect && sameRect(s.rect, rect) && s.valid === valid) return
    s.rect = rect
    s.valid = valid
    onDrag({ kind: s.kind, id: s.id, rect, valid })
  }

  function end(e) {
    const s = gesture.current
    if (!s || s.pointerId !== e.pointerId) return
    gesture.current = null
    onDrag(null)
    if (e.type === 'pointerup' && s.moved && s.valid && s.rect && !sameRect(s.rect, s.start)) onCommit(s.id, s.rect, s.kind)
  }

  const dragging = !!drag
  const selected = display.blocks.find(b => b.id === selectedId)
  const displayRect = Object.fromEntries(display.blocks.map(b => [b.id, b]))
  const stageW = device.w * scale
  const stageH = device.h * scale

  return (
    <div ref={areaRef} data-tour="dz-canvas" className={cx('dz-canvas', zoom !== 'fit' && 'is-scroll')} onPointerDown={() => onSelect(null)}>
      <div className="dz-canvas__inner">
        <div ref={stageRef} className="dz-stage" style={{ width: stageW, height: stageH }}>
          <div className="dz-device">
            <div className="dz-device__screen" style={{ width: device.w, height: device.h, transform: `scale(${scale})` }}>
              <PosScreen theme={theme} layout={display} ctx={ctx} blocks={blocks} width={device.w} height={device.h} />
            </div>
          </div>

          <div
            className={cx('dz-overlay', dragging && 'is-dragging')}
            onPointerDown={e => { e.stopPropagation(); onSelect(null) }}
            onPointerMove={move} onPointerUp={end} onPointerCancel={end}
          >
            {dragging && <GridLines m={m} px={px} />}

            {/* Hit areas stay in committed order: reordering DOM nodes mid-drag
                would drop pointer capture. z-index lifts the dragged one. */}
            {layout.blocks.map(b => {
              const isSel = b.id === selectedId
              if (b.style?.hidden && !isSel) return null
              const r = displayRect[b.id] || b
              return (
                <div
                  key={b.id}
                  className={cx('dz-hit', isSel && 'is-selected', drag?.id === b.id && 'is-active')}
                  style={px(r)}
                  onPointerDown={e => start(e, 'move', b)}
                />
              )
            })}

            {drag && (drag.kind === 'move' || drag.kind === 'add') && (
              <div className={cx('dz-ghost', !drag.valid && 'is-invalid')} style={px(drag.rect)} />
            )}

            {selected && (
              <Selection
                block={selected} box={px(selected)} label={blocks[selected.type]?.label || selected.type}
                size={drag?.id === selected.id ? drag.rect : null}
                onHandle={(e, h) => start(e, 'resize', layout.blocks.find(b => b.id === selected.id), h)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GridLines({ m, px }) {
  const cells = []
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) cells.push(<div key={`${x}.${y}`} className="dz-cell" style={px({ x, y, w: 1, h: 1 })} />)
  }
  return <div className="dz-grid">{cells}</div>
}

function Selection({ block, box, label, size, onHandle }) {
  // Tab sits above the box unless that would leave the device frame.
  const tabInside = box.top < 20
  return (
    <div className={cx('dz-sel', block.style?.hidden && 'is-hidden')} style={box}>
      <div className={cx('dz-sel__tab', tabInside && 'is-inside')}>
        {label}{size && <span className="dz-sel__size">{size.w} × {size.h}</span>}
      </div>
      {HANDLES.map(h => (
        <div key={h} className={`dz-handle dz-handle--${h}`} onPointerDown={e => onHandle(e, h)} />
      ))}
    </div>
  )
}
