import { useRef, useState } from 'react'
import { Icon, IconButton } from '../../ui/index.jsx'

const cx = (...c) => c.filter(Boolean).join(' ')

// Below this many px a press on a palette row is a click (add at first free
// spot), above it a drag onto the canvas.
const DRAG_PX = 4

export function LeftPanel({ blockTypes, layout, config, selectedId, onSelect, onToggleHidden, hitTest, onAddDrag, onAdd }) {
  return (
    <aside className="dz-left">
      <div className="dz-panel-head">Blocks</div>
      <Palette blockTypes={blockTypes} hitTest={hitTest} onAddDrag={onAddDrag} onAdd={onAdd} />
      <div className="dz-panel-head dz-panel-head--rule">Layers</div>
      <Layers layout={layout} config={config} blockTypes={blockTypes} selectedId={selectedId} onSelect={onSelect} onToggleHidden={onToggleHidden} />
    </aside>
  )
}

function Palette({ blockTypes, hitTest, onAddDrag, onAdd }) {
  const g = useRef(null)
  const [chip, setChip] = useState(null)

  if (!blockTypes.length) return <div className="dz-empty" data-tour="dz-palette">No blocks for this screen</div>

  function down(e, type) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    g.current = { type, id: e.pointerId, sx: e.clientX, sy: e.clientY, dragging: false, cell: null }
  }
  function move(e) {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    if (!s.dragging && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < DRAG_PX) return
    s.dragging = true
    const hit = hitTest(e.clientX, e.clientY)
    s.cell = hit && hit.inside ? { x: hit.x, y: hit.y } : null
    onAddDrag(s.cell && { type: s.type, cell: s.cell })
    // The live preview on the canvas replaces the chip once over the screen.
    setChip(s.cell ? null : { type: s.type, x: e.clientX, y: e.clientY })
  }
  function up(e) {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    g.current = null
    setChip(null)
    onAddDrag(null)
    if (!s.dragging) onAdd(s.type, null)
    else if (s.cell) onAdd(s.type, s.cell)
  }
  function cancel() {
    g.current = null
    setChip(null)
    onAddDrag(null)
  }

  const chipDef = chip && blockTypes.find(t => t.type === chip.type)
  return (
    <div className="dz-palette" data-tour="dz-palette">
      {blockTypes.map(t => (
        <div
          key={t.type} className="dz-palette__row" role="button" tabIndex={0}
          title="Drag onto the screen, or click to add"
          onPointerDown={e => down(e, t.type)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(t.type, null) } }}
        >
          <Icon name={t.icon || 'layout'} />
          <span>{t.label}</span>
        </div>
      ))}
      {chipDef && (
        <div className="dz-chip" style={{ left: chip.x, top: chip.y }}>
          <Icon name={chipDef.icon || 'layout'} />
          {chipDef.label}
        </div>
      )}
    </div>
  )
}

// A short hint after the layer name, so two "Mode button" rows can be told apart.
function layerDetail(b, config) {
  const p = b.props || {}
  if (p.modeId) return config.modes?.find(m => m.id === p.modeId)?.label || p.modeId
  if (p.label) return p.label
  if (p.text) return String(p.text).split('\n')[0]
  return ''
}

function Layers({ layout, config, blockTypes, selectedId, onSelect, onToggleHidden }) {
  if (!layout.blocks.length) return <div className="dz-empty">No blocks on this screen</div>
  const byType = Object.fromEntries(blockTypes.map(t => [t.type, t]))
  // Topmost first, like every other design tool.
  const rows = [...layout.blocks].reverse()
  return (
    <div className="dz-layers">
      {rows.map(b => {
        const def = byType[b.type]
        const hidden = !!b.style?.hidden
        const detail = layerDetail(b, config)
        return (
          <div
            key={b.id} className={cx('dz-layer', b.id === selectedId && 'is-selected', hidden && 'is-hidden')}
            onClick={() => onSelect(b.id)}
          >
            <Icon name={def?.icon || 'layout'} />
            <span className="dz-layer__name">{def?.label || b.type}</span>
            {detail && <span className="dz-layer__detail">{detail}</span>}
            <IconButton
              icon={hidden ? 'eyeOff' : 'eye'} label={hidden ? 'Show' : 'Hide'} size="sm" className="dz-layer__eye"
              onClick={e => { e.stopPropagation(); onToggleHidden(b.id) }}
            />
          </div>
        )
      })}
    </div>
  )
}
