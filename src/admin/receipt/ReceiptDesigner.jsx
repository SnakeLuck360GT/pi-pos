// Receipt designer (/admin/receipt). Blocks on the left, the live receipt in
// the middle (rendered by the same code the POS prints with), the selected
// block's settings on the right. Edits go through update(draft => draft), so
// the shell's undo/redo and save cover them.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconButton, Segmented, Tour } from '../../ui/index.jsx'
import { newId } from '../../../shared/defaults.js'
import { renderReceipt, renderSummary, sampleOrder, sampleSummary, createBlock } from '../../../shared/receipt.js'
import ReceiptPaper from '../../receipt/ReceiptPaper.jsx'
import BlockList from './BlockList.jsx'
import Inspector from './Inspector.jsx'
import './ReceiptDesigner.css'

const PX_PER_COL = 7.5   // preview scale: 48 columns = 360px
const PAPER = [{ value: 48, label: '80mm' }, { value: 32, label: '58mm' }]
const TEMPLATES = [{ value: 'receipt', label: 'Order receipt' }, { value: 'summary', label: 'Daily summary' }]

const TOUR = [
  { target: '[data-tour="rc-template"]', title: 'Two templates', body: 'Switch between the order receipt and the daily summary.' },
  { target: '[data-tour="rc-blocks"]', title: 'Blocks', body: 'Blocks print top to bottom. Drag the handle to reorder them.' },
  { target: '[data-tour="rc-add"]', title: 'Add blocks', body: 'Add text, dividers, a logo or a QR code.' },
  { target: '[data-tour="rc-preview"]', title: 'Preview', body: 'Click any line on the receipt to edit the block that prints it.' },
  { target: '[data-tour="rc-sample"]', title: 'Sample order', body: 'Preview the receipt for a takeaway, a delivery or an order with no type.' },
  { target: '[data-tour="rc-inspector"]', title: 'Line style', body: 'Set the size (1–8×), bold, underline and white on black for each line.' },
]

const isTyping = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)

export default function ReceiptDesigner({ config, update, undo, redo, canUndo, canRedo }) {
  const summaryOn = config.features?.summary !== false
  const modesOn = config.features?.orderModes !== false
  const modes = useMemo(() => (modesOn ? (config.modes || []).filter(m => m.enabled !== false) : []), [config.modes, modesOn])

  const [template, setTemplate] = useState('receipt')
  const tpl = summaryOn ? template : 'receipt'
  const [selectedId, setSelectedId] = useState(null)
  const [sampleMode, setSampleMode] = useState(() => modes[0]?.id ?? '')
  const [now] = useState(() => Date.now())

  const blocks = config[tpl]?.blocks || []
  const selected = blocks.find(b => b.id === selectedId) || null
  const mode = modes.some(m => m.id === sampleMode) ? sampleMode : ''

  const doc = useMemo(() => (tpl === 'summary'
    ? renderSummary(config, sampleSummary(config, { now }), { now })
    : renderReceipt(config, sampleOrder(config, mode || null, { now }), { now })), [config, tpl, mode, now])

  const setBlocks = useCallback(fn => update(d => ({ ...d, [tpl]: { ...d[tpl], blocks: fn(d[tpl]?.blocks || []) } })), [update, tpl])
  const patch = useCallback((id, fn) => setBlocks(bs => bs.map(b => (b.id === id ? fn(b) : b))), [setBlocks])

  const prefix = tpl === 'summary' ? 's' : 'r'
  const actions = {
    move: (from, to) => setBlocks(bs => {
      const next = [...bs]
      const [b] = next.splice(from, 1)
      next.splice(to, 0, b)
      return next
    }),
    toggle: id => patch(id, ({ hidden, ...b }) => (hidden ? b : { ...b, hidden: true })),
    duplicate: id => {
      const copy = { ...structuredClone(blocks.find(b => b.id === id)), id: newId(prefix) }
      setBlocks(bs => {
        const i = bs.findIndex(b => b.id === id)
        return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)]
      })
      setSelectedId(copy.id)
    },
    remove: id => {
      setBlocks(bs => bs.filter(b => b.id !== id))
      setSelectedId(null)
    },
    add: type => {
      const b = createBlock(type, tpl)
      setBlocks(bs => {
        const i = bs.findIndex(x => x.id === selectedId)
        return i < 0 ? [...bs, b] : [...bs.slice(0, i + 1), b, ...bs.slice(i + 1)]
      })
      setSelectedId(b.id)
    },
  }

  // Escape deselects; Delete removes the selected block unless typing.
  useEffect(() => {
    const onKey = e => {
      if (isTyping(document.activeElement) || document.querySelector('.ui-overlay')) return
      if (e.key === 'Escape') setSelectedId(null)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); actions.remove(selected.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const isShown = b => tpl === 'summary' || !Array.isArray(b.show) || (!!mode && b.show.includes(mode))
  const cols = config.receipt?.paperCols || 48
  const setCols = v => update(d => ({ ...d, receipt: { ...d.receipt, paperCols: v } }))

  return (
    <div className="rd-root">
      <aside className="rd-left">
        {summaryOn && (
          <div className="rd-left__head" data-tour="rc-template">
            <Segmented value={tpl} options={TEMPLATES} onChange={v => { setTemplate(v); setSelectedId(null) }} />
          </div>
        )}
        <BlockList
          blocks={blocks} template={tpl} modes={config.modes || []} selected={selectedId} isShown={isShown}
          onSelect={setSelectedId} onMove={actions.move} onToggle={actions.toggle}
          onDuplicate={actions.duplicate} onDelete={actions.remove} onAdd={actions.add}
        />
      </aside>

      <main className="rd-center">
        <div className="rd-toolbar">
          <div className="rd-toolbar__group" data-tour="rc-sample">
            {tpl === 'receipt' && modes.length > 0 && (
              <Segmented size="sm" value={mode} onChange={setSampleMode}
                options={[...modes.map(m => ({ value: m.id, label: m.label })), { value: '', label: 'No mode' }]} />
            )}
            {tpl === 'receipt' && !modes.length && <span className="rd-toolbar__label">Sample order</span>}
            {tpl === 'summary' && <span className="rd-toolbar__label">Sample day</span>}
          </div>
          <div className="rd-toolbar__paper">
            <Segmented size="sm" value={cols} options={PAPER} onChange={setCols} />
          </div>
          <span className="ui-spacer" />
          <IconButton icon="undo" label="Undo" size="sm" disabled={!canUndo} onClick={undo} />
          <IconButton icon="redo" label="Redo" size="sm" disabled={!canRedo} onClick={redo} />
        </div>
        <div className="rd-canvas" onClick={() => setSelectedId(null)}>
          <div data-tour="rc-preview" className="rd-canvas__paper">
            <ReceiptPaper doc={doc} width={cols * PX_PER_COL} selected={selectedId} onPick={setSelectedId} />
          </div>
        </div>
      </main>

      <aside className="rd-right" data-tour="rc-inspector">
        <Inspector
          key={selected?.id || 'template'}
          block={selected} template={tpl} config={config} update={update}
          patch={fn => selected && patch(selected.id, fn)}
          onDuplicate={() => selected && actions.duplicate(selected.id)}
          onDelete={() => selected && actions.remove(selected.id)}
        />
      </aside>

      <Tour id="receipt" steps={TOUR} />
    </div>
  )
}
