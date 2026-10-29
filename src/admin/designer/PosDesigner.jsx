import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Tour } from '../../ui/index.jsx'
import { DEFAULT_CONFIG, newId } from '../../../shared/defaults.js'
import { BLOCKS, makePreviewCtx } from '../../pos/blocks/index.js'
import '../../pos/pos.css'
import { clamp, clampRect, effectiveMin, nudgeRect, growRect, placeAt, spotFor } from './gridMath.js'
import { Toolbar, DEVICES } from './Toolbar.jsx'
import { LeftPanel } from './LeftPanel.jsx'
import { Canvas } from './Canvas.jsx'
import { Inspector } from './Inspector.jsx'
import './designer.css'

function previewCtx(config, screen) {
  try {
    return makePreviewCtx(config, screen)
  } catch {
    return { config, screen, editing: true, actions: {}, ui: {}, money: n => String(n) }
  }
}

// Device, custom size and zoom are a per-viewer preference, not config.
const VIEW_KEY = 'pipos.designer.view'
const DEFAULT_VIEW = { device: 'ipad-l', custom: { w: 1180, h: 820 }, zoom: 'fit' }

function loadView() {
  try { return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') } } catch { return DEFAULT_VIEW }
}

const TOUR = [
  { target: '[data-tour="dz-screens"]', title: 'Screens', body: 'Switch between the Home and Order screens.' },
  { target: '[data-tour="dz-device"]', title: 'Tablet size', body: 'Pick the size of your tablet.' },
  { target: '[data-tour="dz-palette"]', title: 'Blocks', body: 'Drag a block onto the screen to add it.' },
  { target: '[data-tour="dz-canvas"]', title: 'Move and resize', body: 'Drag a block to move it and use its handles to resize; everything snaps to the grid.' },
  { target: '[data-tour="dz-inspector"]', title: 'Settings', body: 'Select a block to change its text size, colours and settings, or click empty space for the theme.' },
  { target: '[data-tour="dz-undo"]', title: 'Undo', body: 'Undo any change with ⌘Z.' },
]

const isTyping = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

export default function PosDesigner({ config, update, undo, redo, canUndo, canRedo }) {
  const [screen, setScreen] = useState('home')
  const [selectedId, setSelectedId] = useState(null)
  const [drag, setDrag] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [view, setView] = useState(loadView)
  const canvasApi = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)) } catch {}
  }, [view])

  const layout = config.layouts?.[screen] || DEFAULT_CONFIG.layouts[screen]
  const { cols, rows } = layout
  // Undo can remove the selected block; treat a stale id as no selection.
  const selected = layout.blocks.find(b => b.id === selectedId) || null
  const ctx = useMemo(() => previewCtx(config, screen), [config, screen])

  const blockTypes = useMemo(
    () => Object.entries(BLOCKS).filter(([, d]) => !d.screens || d.screens.includes(screen)).map(([type, d]) => ({ type, ...d })),
    [screen],
  )

  const preset = DEVICES.find(d => d.id === view.device) || DEVICES[0]
  const device = preset.id === 'custom' ? view.custom : { w: preset.w, h: preset.h }

  // Each of these is one undo step.
  const setLayout = fn => update(d => ({
    ...d,
    layouts: { ...d.layouts, [screen]: fn(d.layouts?.[screen] || DEFAULT_CONFIG.layouts[screen]) },
  }))
  const patchBlock = (id, fn) => setLayout(l => ({ ...l, blocks: l.blocks.map(b => (b.id === id ? fn(b) : b)) }))

  const sizeOf = def => clampRect({ x: 0, y: 0, w: def?.size?.w || 2, h: def?.size?.h || 1 }, cols, rows)

  function makeBlock(type, rect) {
    const def = BLOCKS[type]
    return { id: newId(screen === 'home' ? 'h' : 'o'), type, ...rect, props: structuredClone(def?.props || {}), style: {} }
  }

  function addBlock(type, cell) {
    const def = BLOCKS[type]
    const size = sizeOf(def)
    const rect = cell ? placeAt(cell, size, cols, rows) : spotFor(layout.blocks, size, def?.minSize, cols, rows)
    const block = makeBlock(type, { x: rect.x, y: rect.y, w: rect.w, h: rect.h })
    setLayout(l => ({ ...l, blocks: [...l.blocks, block] }))
    setSelectedId(block.id)
  }

  // Palette drag in progress: show the real block at the drop cell.
  function addDrag(info) {
    if (!info) return setDrag(null)
    const rect = placeAt(info.cell, sizeOf(BLOCKS[info.type]), cols, rows)
    setDrag(prev => (prev?.kind === 'add' && prev.type === info.type && prev.rect.x === rect.x && prev.rect.y === rect.y
      ? prev
      : { kind: 'add', type: info.type, rect, valid: true, preview: { id: '__new', type: info.type, ...rect, props: BLOCKS[info.type]?.props || {}, style: {} } }))
  }

  function commitRect(id, rect, kind) {
    setLayout(l => {
      const b = l.blocks.find(x => x.id === id)
      if (!b) return l
      const nb = { ...b, ...rect }
      // A moved block ends up on top, matching what the drag showed.
      return kind === 'move'
        ? { ...l, blocks: [...l.blocks.filter(x => x.id !== id), nb] }
        : { ...l, blocks: l.blocks.map(x => (x.id === id ? nb : x)) }
    })
  }

  // Position inputs: keep the block inside the grid and at least minSize.
  function setRect(id, patch) {
    patchBlock(id, b => {
      const min = effectiveMin(BLOCKS[b.type]?.minSize, cols, rows)
      const r = { x: b.x, y: b.y, w: b.w, h: b.h, ...patch }
      const w = clamp(r.w, min.w, cols)
      const h = clamp(r.h, min.h, rows)
      return { ...b, w, h, x: clamp(r.x, 0, cols - w), y: clamp(r.y, 0, rows - h) }
    })
  }

  function duplicate(id) {
    const b = layout.blocks.find(x => x.id === id)
    if (!b) return
    const rect = spotFor(layout.blocks, { w: b.w, h: b.h }, null, cols, rows, { x: b.x + 1, y: b.y + 1, w: b.w, h: b.h })
    const copy = { ...structuredClone(b), id: newId(screen === 'home' ? 'h' : 'o'), ...rect }
    setLayout(l => ({ ...l, blocks: [...l.blocks, copy] }))
    setSelectedId(copy.id)
  }

  function remove(id) {
    setLayout(l => ({ ...l, blocks: l.blocks.filter(b => b.id !== id) }))
    setSelectedId(null)
  }

  function toggleHidden(id) {
    patchBlock(id, b => {
      const { hidden, ...rest } = b.style || {}
      return { ...b, style: hidden ? rest : { ...rest, hidden: true } }
    })
  }

  // Shrinking the grid pulls blocks back inside so none are lost off-screen.
  function setGrid(patch) {
    setLayout(l => {
      const c = patch.cols ?? l.cols
      const r = patch.rows ?? l.rows
      return { ...l, cols: c, rows: r, blocks: l.blocks.map(b => ({ ...b, ...clampRect(b, c, r) })) }
    })
  }

  function resetScreen() {
    setLayout(() => structuredClone(DEFAULT_CONFIG.layouts[screen]))
    setSelectedId(null)
    setConfirmReset(false)
  }

  function switchScreen(s) {
    setScreen(s)
    setSelectedId(null)
    setDrag(null)
  }

  const updateTheme = fn => update(d => ({ ...d, theme: fn(d.theme) }))

  // Keyboard: only when focus isn't in a field and no dialog is open.
  useEffect(() => {
    function onKey(e) {
      if (confirmReset || isTyping(e.target) || e.defaultPrevented) return
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Escape') { if (selected) { setSelectedId(null); e.preventDefault() } return }
      if (!selected) return
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (arrows[e.key] && !mod) {
        e.preventDefault()
        const [dx, dy] = arrows[e.key]
        const next = e.shiftKey
          ? growRect(selected, dx, dy, BLOCKS[selected.type]?.minSize, cols, rows)
          : nudgeRect(selected, dx, dy, cols, rows)
        if (next.x !== selected.x || next.y !== selected.y || next.w !== selected.w || next.h !== selected.h) {
          patchBlock(selected.id, b => ({ ...b, x: next.x, y: next.y, w: next.w, h: next.h }))
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
        e.preventDefault()
        remove(selected.id)
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicate(selected.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const def = selected && BLOCKS[selected.type]

  return (
    <div className="dz">
      <Toolbar
        screen={screen} onScreen={switchScreen}
        view={view} onView={patch => setView(v => ({ ...v, ...patch }))}
        layout={layout} onGrid={setGrid}
        undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo}
        onReset={() => setConfirmReset(true)}
      />
      <LeftPanel
        blockTypes={blockTypes} layout={layout} config={config}
        selectedId={selected?.id} onSelect={setSelectedId} onToggleHidden={toggleHidden}
        hitTest={(x, y) => canvasApi.current?.hitTest(x, y)} onAddDrag={addDrag} onAdd={addBlock}
      />
      <Canvas
        config={config} layout={layout} ctx={ctx} blocks={BLOCKS} device={device} zoom={view.zoom}
        selectedId={selected?.id} drag={drag} onSelect={setSelectedId} onDrag={setDrag} onCommit={commitRect}
        apiRef={canvasApi}
      />
      <Inspector
        config={config} block={selected} def={def} layout={layout}
        onRect={patch => setRect(selected.id, patch)}
        onProps={props => patchBlock(selected.id, b => ({ ...b, props }))}
        onStyle={style => patchBlock(selected.id, b => ({ ...b, style }))}
        onDuplicate={() => duplicate(selected.id)} onDelete={() => remove(selected.id)}
        onTheme={updateTheme}
      />

      <Tour id="designer" steps={TOUR} />

      {confirmReset && (
        <Modal
          title={`Reset ${screen} screen`} onClose={() => setConfirmReset(false)}
          footer={<>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={resetScreen}>Reset screen</Button>
          </>}
        >
          <p>This replaces every block on the {screen} screen with the default layout. You can undo it.</p>
        </Modal>
      )}
    </div>
  )
}
