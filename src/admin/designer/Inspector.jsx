import { Field, Fields, Icon, IconButton, Select } from '../../ui/index.jsx'
import { FONTS, THEME_PRESETS } from '../../lib/theme.js'
import { POS_STYLE_FIELDS } from '../../lib/fields.js'
import { blockFields } from '../../pos/blocks/index.js'
import { CommitNumber } from './controls.jsx'

const cx = (...c) => c.filter(Boolean).join(' ')

function Group({ title, children }) {
  return (
    <section className="dz-group">
      <h3 className="dz-group__title">{title}</h3>
      <div className="dz-group__body dz-props">{children}</div>
    </section>
  )
}

export function Inspector({ config, block, def, layout, onRect, onProps, onStyle, onDuplicate, onDelete, onTheme }) {
  return (
    <aside className="dz-right" data-tour="dz-inspector">
      {block
        ? <BlockInspector config={config} block={block} def={def} layout={layout} onRect={onRect} onProps={onProps} onStyle={onStyle} onDuplicate={onDuplicate} onDelete={onDelete} />
        : <ThemePanel theme={config.theme} onTheme={onTheme} />}
    </aside>
  )
}

// blockFields fills config-driven options. modeId is still forced to a list of
// the shop's modes in case a block declares it as plain text.
function contentFields(type, config) {
  const modes = (config.modes || []).map(m => ({ value: m.id, label: m.label || m.id }))
  return blockFields(type, config).map(f =>
    f.key === 'modeId' && (f.type !== 'select' || !f.options?.length)
      ? { ...f, type: 'select', options: modes }
      : f,
  )
}

function BlockInspector({ config, block, def, layout, onRect, onProps, onStyle, onDuplicate, onDelete }) {
  const fields = contentFields(block.type, config)
  const pos = [
    { key: 'x', label: 'X', min: 0, max: layout.cols - 1 },
    { key: 'y', label: 'Y', min: 0, max: layout.rows - 1 },
    { key: 'w', label: 'W', min: 1, max: layout.cols },
    { key: 'h', label: 'H', min: 1, max: layout.rows },
  ]
  return (
    <>
      <header className="dz-insp-head">
        <Icon name={def?.icon || 'layout'} />
        <span className="dz-insp-head__title">{def?.label || block.type}</span>
        <IconButton icon="copy" label="Duplicate" size="sm" onClick={onDuplicate} />
        <IconButton icon="trash" label="Delete" size="sm" onClick={onDelete} />
      </header>

      <Group title="Position">
        <div className="dz-pos-grid">
          {pos.map(p => (
            <label key={p.key} className="dz-pos-field">
              <span>{p.label}</span>
              <CommitNumber value={block[p.key]} min={p.min} max={p.max} onCommit={v => onRect({ [p.key]: v })} />
            </label>
          ))}
        </div>
      </Group>

      {fields.length > 0 && (
        <Group title="Content">
          <Fields fields={fields} value={{ ...def?.props, ...block.props }} onChange={onProps} currency={config.business?.currency} />
        </Group>
      )}

      <Group title="Style">
        <Fields fields={POS_STYLE_FIELDS} value={block.style || {}} onChange={onStyle} />
      </Group>
    </>
  )
}

const COLOR_FIELDS = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'surface2', label: 'Raised surface' },
  { key: 'border', label: 'Border' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentText', label: 'Text on accent' },
  { key: 'danger', label: 'Danger' },
].map(f => ({ ...f, type: 'color', placeholder: '#000000' }))

const COLOR_KEYS = COLOR_FIELDS.map(f => f.key)
const FONT_OPTIONS = Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }))
const SIZE_FIELDS = [
  { key: 'fontSize', label: 'Text size', min: 10, max: 40 },
  { key: 'radius', label: 'Corner radius', min: 0, max: 40 },
  { key: 'gap', label: 'Grid gap', min: 0, max: 48 },
  { key: 'padding', label: 'Screen padding', min: 0, max: 96 },
]

const presetOf = t => Object.keys(THEME_PRESETS).find(k => COLOR_KEYS.every(c => (THEME_PRESETS[k][c] || '').toLowerCase() === (t[c] || '').toLowerCase())) || 'custom'

function ThemePanel({ theme, onTheme }) {
  const active = presetOf(theme)

  function setColors(next) {
    // A theme colour can't be empty (the POS has nothing to inherit from), so
    // clearing one restores the preset value.
    const base = THEME_PRESETS[theme.preset] || THEME_PRESETS.light
    const fixed = { ...next }
    for (const k of COLOR_KEYS) if (!fixed[k]) fixed[k] = base[k]
    onTheme(t => ({ ...t, ...fixed, preset: presetOf(fixed) }))
  }

  return (
    <>
      <header className="dz-insp-head">
        <span className="dz-insp-head__title">Theme</span>
      </header>

      <Group title="Preset">
        <div className="dz-presets">
          {Object.entries(THEME_PRESETS).map(([key, p]) => (
            <button
              key={key} type="button" className={cx('dz-preset', active === key && 'is-on')}
              onClick={() => onTheme(t => ({ ...t, ...p, preset: key }))}
            >
              <span className="dz-preset__swatch" style={{ background: p.bg }}>
                <span style={{ background: p.surface, borderColor: p.border }} />
                <span style={{ background: p.accent }} />
              </span>
              <span className="dz-preset__label">{key[0].toUpperCase() + key.slice(1)}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group title="Colours">
        <Fields fields={COLOR_FIELDS} value={theme} onChange={setColors} />
      </Group>

      <Group title="Type and spacing">
        <Field label="Font">
          <Select value={theme.font} options={FONT_OPTIONS} onChange={font => onTheme(t => ({ ...t, font }))} />
        </Field>
        {SIZE_FIELDS.map(f => (
          <Field key={f.key} label={f.label}>
            <CommitNumber value={theme[f.key]} min={f.min} max={f.max} onCommit={v => onTheme(t => ({ ...t, [f.key]: v }))} />
          </Field>
        ))}
      </Group>
    </>
  )
}
