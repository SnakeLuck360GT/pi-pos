import { IconButton, Button, Segmented, Select } from '../../ui/index.jsx'
import { CommitNumber } from './controls.jsx'

export const DEVICES = [
  { id: 'ipad-l', label: 'iPad landscape', w: 1180, h: 820 },
  { id: 'ipad-p', label: 'iPad portrait', w: 820, h: 1180 },
  { id: 'android', label: '10" Android', w: 1280, h: 800 },
  { id: 'xga', label: '1024 × 768', w: 1024, h: 768 },
  { id: 'custom', label: 'Custom' },
]

const SCREENS = [{ value: 'home', label: 'Home' }, { value: 'order', label: 'Order' }]
const ZOOMS = [{ value: 'fit', label: 'Fit' }, { value: 1, label: '100%' }]
const DEVICE_OPTIONS = DEVICES.map(d => ({ value: d.id, label: d.w && d.label !== `${d.w} × ${d.h}` ? `${d.label} · ${d.w} × ${d.h}` : d.label }))

export function Toolbar({ screen, onScreen, view, onView, layout, onGrid, undo, redo, canUndo, canRedo, onReset }) {
  return (
    <div className="dz-toolbar">
      <div className="dz-toolbar__seg dz-toolbar__seg--screen" data-tour="dz-screens">
        <Segmented value={screen} onChange={onScreen} options={SCREENS} size="sm" />
      </div>

      <span className="dz-sep" />

      <div className="dz-toolbar__device" data-tour="dz-device">
        <Select value={view.device} options={DEVICE_OPTIONS} onChange={device => onView({ device })} aria-label="Device" />
      </div>
      {view.device === 'custom' && (
        <div className="dz-toolbar__dims">
          <CommitNumber value={view.custom.w} min={320} max={4000} live={false} aria-label="Width" onCommit={w => onView({ custom: { ...view.custom, w } })} />
          <span className="dz-muted">×</span>
          <CommitNumber value={view.custom.h} min={320} max={4000} live={false} aria-label="Height" onCommit={h => onView({ custom: { ...view.custom, h } })} />
        </div>
      )}

      <div className="dz-toolbar__seg dz-toolbar__seg--zoom">
        <Segmented value={view.zoom} onChange={zoom => onView({ zoom })} options={ZOOMS} size="sm" />
      </div>

      <span className="dz-sep" />

      <label className="dz-toolbar__num">
        <span>Columns</span>
        <CommitNumber value={layout.cols} min={1} max={48} live={false} onCommit={cols => onGrid({ cols })} />
      </label>
      <label className="dz-toolbar__num">
        <span>Rows</span>
        <CommitNumber value={layout.rows} min={1} max={48} live={false} onCommit={rows => onGrid({ rows })} />
      </label>

      <span className="ui-spacer" />

      <div className="dz-toolbar__undo" data-tour="dz-undo">
        <IconButton icon="undo" label="Undo" size="sm" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" label="Redo" size="sm" onClick={redo} disabled={!canRedo} />
      </div>
      <span className="dz-sep" />
      <Button size="sm" variant="ghost" icon="refresh" onClick={onReset}>Reset screen</Button>
    </div>
  )
}
