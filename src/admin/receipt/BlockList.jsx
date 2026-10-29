// Left panel: the template's blocks top to bottom. Drag the grip to reorder
// (Pointer Events, so touch works), eye to hide, add from the menu.
import { useEffect, useRef, useState } from 'react'
import { Button, Icon, IconButton } from '../../ui/index.jsx'
import { RECEIPT_BLOCK_TYPES } from '../../../shared/receipt.js'
import { Popover } from './parts.jsx'

const firstLine = s => String(s || '').split('\n').find(l => l.trim()) || ''

// One-line description of what a block prints.
export function blockSummary(b, modes) {
  let s
  switch (b.type) {
    case 'text':    s = firstLine(b.text) || 'Empty'; break
    case 'items':   s = (b.modsPosition === 'below' ? 'Modifiers below' : 'Modifiers beside') + (b.altLine?.show === false ? '' : ', two languages'); break
    case 'totals':  s = ['subtotal', 'fee', 'discount', 'total'].filter(k => b[k] && b[k].show !== 'never').map(k => b[k].label || k).join(', '); break
    case 'divider': s = `${b.thickness || 1} dot${b.thickness === 1 ? '' : 's'} thick`; break
    case 'feed':    s = `${b.lines || 1} line${b.lines === 1 ? '' : 's'}`; break
    case 'image':   s = b.data ? `${b.width} × ${b.height} dots` : 'No image'; break
    case 'qr':      s = firstLine(b.text) || 'Empty'; break
    case 'summary-modes':  s = b.format || ''; break
    case 'summary-orders': s = b.rowLine?.format || ''; break
    default:        s = ''
  }
  if (Array.isArray(b.show)) {
    const names = b.show.map(id => modes.find(m => m.id === id)?.label).filter(Boolean)
    s = `${names.length ? names.join(', ') : 'No orders'} only · ${s}`
  }
  return s
}

export default function BlockList({ blocks, template, modes, selected, onSelect, onMove, onToggle, onDuplicate, onDelete, onAdd, isShown }) {
  const listRef = useRef()
  const drag = useRef(null)
  const [dragState, setDragState] = useState(null)   // { from, to }
  const [adding, setAdding] = useState(false)

  // Keep the picked block in view when it was chosen from the preview.
  useEffect(() => {
    if (!selected) return
    listRef.current?.querySelector(`[data-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  function down(e, index) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rows = [...listRef.current.querySelectorAll('[data-row]')].map(el => el.getBoundingClientRect())
    drag.current = { from: index, to: index, rows }
    setDragState({ from: index, to: index })
  }
  function move(e) {
    const d = drag.current
    if (!d) return
    let to = d.rows.length
    for (let i = 0; i < d.rows.length; i++) {
      if (e.clientY < d.rows[i].top + d.rows[i].height / 2) { to = i; break }
    }
    if (to !== d.to) { d.to = to; setDragState({ from: d.from, to }) }
  }
  function up() {
    const d = drag.current
    drag.current = null
    setDragState(null)
    if (!d) return
    // `to` is an insertion point; dropping just above or below itself is a no-op.
    if (d.to !== d.from && d.to !== d.from + 1) onMove(d.from, d.to > d.from ? d.to - 1 : d.to)
  }

  const types = Object.entries(RECEIPT_BLOCK_TYPES).filter(([, t]) => t.templates.includes(template))
  const dropAt = dragState && dragState.to !== dragState.from && dragState.to !== dragState.from + 1 ? dragState.to : -1

  return (
    <div className="rd-blocks">
      <div className="rd-blocks__list" ref={listRef} data-tour="rc-blocks">
        {!blocks.length && <div className="rd-empty">No blocks yet.</div>}
        {blocks.map((b, i) => {
          const t = RECEIPT_BLOCK_TYPES[b.type] || { label: b.type, icon: 'type' }
          const on = selected === b.id
          const cls = ['rd-row',
            on && 'is-active',
            (b.hidden || !isShown(b)) && 'is-off',
            dragState?.from === i && 'is-dragging',
            dropAt === i && 'is-drop-before',
            dropAt === blocks.length && i === blocks.length - 1 && 'is-drop-after',
          ].filter(Boolean).join(' ')
          return (
            <div key={b.id} data-row data-id={b.id} className={cls} onClick={() => onSelect(b.id)}>
              <span
                className="rd-row__grip" aria-label="Drag to reorder" title="Drag to reorder"
                onPointerDown={e => down(e, i)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                onClick={e => e.stopPropagation()}
              >
                <Icon name="grip" />
              </span>
              <Icon name={t.icon} className="rd-row__icon" />
              <div className="rd-row__text">
                <div className="rd-row__label">{t.label}</div>
                <div className="rd-row__sum">{blockSummary(b, modes)}</div>
              </div>
              {on && (
                <>
                  <IconButton icon="copy" label="Duplicate" size="sm" onClick={e => { e.stopPropagation(); onDuplicate(b.id) }} />
                  <IconButton icon="trash" label="Delete" size="sm" onClick={e => { e.stopPropagation(); onDelete(b.id) }} />
                </>
              )}
              <IconButton
                icon={b.hidden ? 'eyeOff' : 'eye'} label={b.hidden ? 'Show' : 'Hide'} size="sm"
                className={b.hidden ? 'rd-row__eye is-hidden' : 'rd-row__eye'}
                onClick={e => { e.stopPropagation(); onToggle(b.id) }}
              />
            </div>
          )
        })}
      </div>
      <div className="rd-blocks__foot">
        <div className="rd-anchor" data-tour="rc-add">
          <Button icon="plus" onClick={() => setAdding(a => !a)}>Add block</Button>
          <Popover open={adding} onClose={() => setAdding(false)} className="rd-addmenu">
            {types.map(([type, t]) => (
              <button key={type} type="button" className="rd-menu__item" onClick={() => { onAdd(type); setAdding(false) }}>
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </button>
            ))}
          </Popover>
        </div>
      </div>
    </div>
  )
}
