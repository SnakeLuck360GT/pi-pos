// Right panel: settings for the selected block, or for the template when
// nothing is selected.
import { useEffect, useRef, useState } from 'react'
import { Button, Field, Icon, IconButton, NumberInput, Segmented, Select, Toggle } from '../../ui/index.jsx'
import { ALIGN_OPTIONS } from '../../lib/fields.js'
import { RECEIPT_BLOCK_TYPES, TOKENS, LINE_TOKENS } from '../../../shared/receipt.js'
import { fitImage, imageToRaster, rasterToDataUrl } from '../../lib/raster.js'
import { Choice, Group, ShowFor, StyleFields, TemplateField } from './parts.jsx'

const PAPER = [{ value: 48, label: '80mm' }, { value: 32, label: '58mm' }]

export default function Inspector({ block, template, config, update, patch, onDuplicate, onDelete }) {
  if (!block) return <TemplateSettings template={template} config={config} update={update} />
  const t = RECEIPT_BLOCK_TYPES[block.type] || { label: block.type, icon: 'type' }
  const ctx = {
    block, config, template, patch,
    set: (key, value) => patch(b => ({ ...b, [key]: value })),
    setIn: (key, sub, value) => patch(b => ({ ...b, [key]: { ...(b[key] || {}), [sub]: value } })),
    tokens: TOKENS.filter(x => x.scope === 'both' || x.scope === (template === 'summary' ? 'summary' : 'order')),
    modes: config.features?.orderModes === false ? [] : (config.modes || []),
  }
  const Body = BODIES[block.type]
  return (
    <div className="rd-insp">
      <header className="rd-insp__head">
        <Icon name={t.icon} />
        <h2>{t.label}</h2>
        <span className="ui-spacer" />
        <IconButton icon="copy" label="Duplicate" size="sm" onClick={onDuplicate} />
        <IconButton icon="trash" label="Delete" size="sm" onClick={onDelete} />
      </header>
      <div className="rd-insp__body">
        {Body ? <Body {...ctx} /> : <div className="ui-muted">This block type has no settings.</div>}
        {template === 'receipt' && ctx.modes.length > 0 && (
          <div className="rd-insp__show"><ShowFor value={block.show} modes={ctx.modes} onChange={v => ctx.set('show', v)} /></div>
        )}
      </div>
    </div>
  )
}

function TemplateSettings({ template, config, update }) {
  const r = config.receipt || {}
  const setR = (k, v) => update(d => ({ ...d, receipt: { ...d.receipt, [k]: v } }))
  return (
    <div className="rd-insp">
      <header className="rd-insp__head"><h2>{template === 'summary' ? 'Daily summary' : 'Order receipt'}</h2></header>
      <div className="rd-insp__body ui-stack">
        <Field label="Paper width">
          <Segmented size="sm" value={r.paperCols} options={PAPER} onChange={v => setR('paperCols', v)} />
        </Field>
        <Field label="Characters per line" hint="48 for 80mm paper, 32 for 58mm. Some printers fit 42 or 64.">
          <NumberInput value={r.paperCols} min={16} max={96} onChange={v => setR('paperCols', v ?? 48)} />
        </Field>
        <Field label="Line spacing" hint="Dots per line. 24 is tight, 0 uses the printer default.">
          <NumberInput value={r.lineSpacing} min={0} max={255} onChange={v => setR('lineSpacing', v ?? 0)} />
        </Field>
        {template === 'summary' && <div className="ui-field__hint">Paper and spacing are shared with the order receipt.</div>}
        <div className="rd-insp__note">Select a block, or click a line on the receipt, to edit it.</div>
      </div>
    </div>
  )
}

function TextBody({ block, set, tokens }) {
  return (
    <>
      <TemplateField label="Text" multiline rows={4} value={block.text} tokens={tokens} onChange={v => set('text', v)}
        hint="Each line prints on its own. {a|b} uses b when a is empty." />
      <Toggle label="Hide lines whose tokens are empty" checked={block.hideIfEmpty} onChange={v => set('hideIfEmpty', v)} />
      <Group title="Style"><StyleFields value={block.style} onChange={v => set('style', v)} /></Group>
    </>
  )
}

function LineGroup({ title, block, k, tokens, set, showToggle, price, hint, defaultOpen }) {
  const line = block[k] || {}
  const put = (sub, v) => set(k, { ...line, [sub]: v })
  return (
    <Group title={title} defaultOpen={defaultOpen}>
      {showToggle && <Toggle label="Print this line" checked={line.show !== false} onChange={v => put('show', v)} />}
      {hint && <div className="ui-field__hint">{hint}</div>}
      <TemplateField label="Format" value={line.format} tokens={tokens} onChange={v => put('format', v)} />
      {price && <Toggle label="Price on the right" checked={!!line.price} onChange={v => put('price', v)} />}
      <StyleFields value={line.style} onChange={v => put('style', v)} noAlign={!!line.price} />
    </Group>
  )
}

function ItemsBody({ block, set, config }) {
  const altOff = !config.features?.altNames
  const below = block.modsPosition === 'below'
  return (
    <>
      <LineGroup title="Second-language line" block={block} k="altLine" set={set} tokens={LINE_TOKENS.item} showToggle
        hint={altOff ? 'Second-language names are off in Business, so this line is skipped.' : 'Skipped for items without a second-language name.'} />
      <LineGroup title="Main line" block={block} k="mainLine" set={set} tokens={LINE_TOKENS.item} showToggle price />
      <Group title="Modifiers">
        <Choice label="Position" value={below ? 'below' : 'beside'} onChange={v => set('modsPosition', v)}
          options={[{ value: 'beside', label: 'Beside the name' }, { value: 'below', label: 'Own lines' }]} />
        {below
          ? <>
              <TemplateField label="Format" value={block.modLine?.format} tokens={LINE_TOKENS.mod} onChange={v => set('modLine', { ...block.modLine, format: v })} />
              <StyleFields value={block.modLine?.style} onChange={v => set('modLine', { ...block.modLine, style: v })} />
            </>
          : <div className="ui-field__hint">{'{mods} adds them in brackets, e.g. " (No Chilli, Extra Sauce)".'}</div>}
      </Group>
      <LineGroup title="Notes" block={block} k="noteLine" set={set} tokens={LINE_TOKENS.note} defaultOpen={false} />
      <Group title="Spacing" defaultOpen={false}>
        <Field label="Blank lines between items">
          <NumberInput value={block.gap ?? 0} min={0} max={10} onChange={v => set('gap', v ?? 0)} />
        </Field>
      </Group>
    </>
  )
}

const ROW_SHOW = {
  subtotal: [{ value: 'auto', label: 'With a fee or discount' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }],
  fee:      [{ value: 'auto', label: 'When not zero' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }],
  discount: [{ value: 'auto', label: 'When not zero' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }],
  total:    [{ value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }],
}
const ROW_TITLE = { subtotal: 'Subtotal', fee: 'Fee', discount: 'Discount', total: 'Total' }

function TotalsBody({ block, set, tokens }) {
  return Object.keys(ROW_TITLE).map(k => {
    const row = block[k] || {}
    const put = (sub, v) => set(k, { ...row, [sub]: v })
    return (
      <Group key={k} title={ROW_TITLE[k]} defaultOpen={k === 'total'}>
        <TemplateField label="Label" value={row.label} tokens={tokens} onChange={v => put('label', v)} />
        <Field label="Show">
          <Select value={row.show || (k === 'total' ? 'always' : 'auto')} options={ROW_SHOW[k]} onChange={v => put('show', v)} />
        </Field>
        <StyleFields value={row.style} onChange={v => put('style', v)} noAlign />
      </Group>
    )
  })
}

function DividerBody({ block, set }) {
  return (
    <div className="ui-grid-2">
      <Field label="Thickness (dots)"><NumberInput value={block.thickness} min={1} max={8} onChange={v => set('thickness', v ?? 1)} /></Field>
      <Field label="Space around (dots)"><NumberInput value={block.pad} min={0} max={48} onChange={v => set('pad', v ?? 0)} /></Field>
    </div>
  )
}

function FeedBody({ block, set }) {
  return (
    <Field label="Blank lines"><NumberInput value={block.lines} min={1} max={20} onChange={v => set('lines', v ?? 1)} /></Field>
  )
}

function QrBody({ block, set, tokens }) {
  return (
    <>
      <TemplateField label="Content" multiline rows={2} value={block.text} tokens={tokens} placeholder="https://example.com" onChange={v => set('text', v)}
        hint="A link or any text. The preview shows a stand-in; the printer draws the real code." />
      <Field label="Module size (dots)"><NumberInput value={block.size} min={1} max={16} onChange={v => set('size', v ?? 6)} /></Field>
      <Choice label="Align" value={block.align || 'center'} options={ALIGN_OPTIONS} onChange={v => set('align', v)} />
    </>
  )
}

function ImageBody({ block, config, patch }) {
  const file = useRef()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [threshold, setThreshold] = useState(block.threshold ?? 128)
  const paperDots = (config.receipt?.paperCols || 48) * 12
  useEffect(() => setThreshold(block.threshold ?? 128), [block.id, block.threshold])

  // Re-raster from the stored source whenever a setting changes.
  async function apply(next) {
    const b = { ...block, ...next }
    if (!b.src) return patch(x => ({ ...x, ...next }))
    setBusy(true)
    setError('')
    try {
      const r = await imageToRaster(b.src, { maxWidthDots: Math.min(b.maxWidth || paperDots, paperDots), threshold: b.threshold ?? 128, dither: b.dither !== false })
      patch(x => ({ ...x, ...next, data: r.data, width: r.width, height: r.height }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = async () => {
      try { apply({ src: await fitImage(reader.result, paperDots) }) } catch (err) { setError(err.message) }
    }
    reader.readAsDataURL(f)
  }

  const commitThreshold = () => threshold !== block.threshold && apply({ threshold })
  const preview = block.data ? rasterToDataUrl(block.width, block.height, block.data) : ''

  return (
    <>
      <div className="rd-image">
        {preview ? <img src={preview} alt="" /> : <div className="rd-image__empty">No image</div>}
      </div>
      <div className="ui-row">
        <Button size="sm" onClick={() => file.current.click()}>{block.src ? 'Replace' : 'Upload'}</Button>
        {block.src && <Button size="sm" variant="ghost" onClick={() => patch(x => ({ ...x, src: '', data: '', width: 0, height: 0 }))}>Remove</Button>}
        {busy && <span className="ui-muted">Converting…</span>}
        <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
      </div>
      {error && <div className="rd-error">{error}</div>}
      <Field label="Width (dots)" hint={`Up to ${paperDots}, the full paper width.`}>
        <NumberInput value={block.maxWidth} min={8} max={paperDots} step={8} onChange={v => apply({ maxWidth: v ?? paperDots })} />
      </Field>
      <Field label={`Threshold (${threshold})`} hint="Lower keeps only the darkest parts.">
        <input
          type="range" className="rd-range" min={0} max={255} value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
          onPointerUp={commitThreshold} onKeyUp={commitThreshold} onBlur={commitThreshold}
        />
      </Field>
      <Toggle label="Dither (for photos and shading)" checked={block.dither !== false} onChange={v => apply({ dither: v })} />
      <Choice label="Align" value={block.align || 'center'} options={ALIGN_OPTIONS} onChange={v => patch(x => ({ ...x, align: v }))} />
    </>
  )
}

function SummaryModesBody({ block, set }) {
  return (
    <>
      <TemplateField label="Row format" value={block.format} tokens={LINE_TOKENS.summaryMode} onChange={v => set('format', v)}
        hint="One row per order type, with its total on the right." />
      <Group title="Style"><StyleFields value={block.style} onChange={v => set('style', v)} noAlign /></Group>
    </>
  )
}

function SummaryOrdersBody({ block, set }) {
  const items = block.itemsLine || {}
  return (
    <>
      <Group title="Order row">
        <TemplateField label="Format" value={block.rowLine?.format} tokens={LINE_TOKENS.summaryOrder} onChange={v => set('rowLine', { ...block.rowLine, format: v })}
          hint="The order total prints on the right." />
        <StyleFields value={block.rowLine?.style} onChange={v => set('rowLine', { ...block.rowLine, style: v })} noAlign />
      </Group>
      <Group title="Items line">
        <Toggle label="Print this line" checked={items.show !== false} onChange={v => set('itemsLine', { ...items, show: v })} />
        <TemplateField label="Format" value={items.format} tokens={LINE_TOKENS.summaryItems} onChange={v => set('itemsLine', { ...items, format: v })}
          hint="Cut to one line." />
        <StyleFields value={items.style} onChange={v => set('itemsLine', { ...items, style: v })} />
      </Group>
    </>
  )
}

const BODIES = {
  text: TextBody,
  items: ItemsBody,
  totals: TotalsBody,
  divider: DividerBody,
  feed: FeedBody,
  qr: QrBody,
  image: ImageBody,
  'summary-modes': SummaryModesBody,
  'summary-orders': SummaryOrdersBody,
}
