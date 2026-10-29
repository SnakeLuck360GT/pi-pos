import { useState } from 'react'
import {
  Badge, Button, Empty, Field, Icon, Input, Modal, MoneyInput, NumberInput, PageHeader, Section, Segmented, Toggle,
} from '../../ui/index.jsx'
import { newId } from '../../../shared/defaults.js'
import { setPath } from '../../lib/fields.js'
import { SortableList, moveItem } from './Sortable.jsx'
import { Confirm, nameOf } from './util.jsx'

const FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'address', label: 'Address' },
]

export const etaLabel = eta => (!eta?.length ? 'No ready time' : eta.length > 1 ? `${eta[0]}–${eta[1]} min` : `${eta[0]} min`)

// Home-screen buttons that start this order type.
const buttonsFor = (config, id) =>
  Object.values(config.layouts || {}).flatMap(l => l.blocks || []).filter(b => b.type === 'mode-button' && b.props?.modeId === id)

export default function OrderTypes({ config, update }) {
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const modes = config.modes
  const alt = config.features.altNames
  const patch = (id, p) => update(d => ({ ...d, modes: d.modes.map(m => (m.id === id ? { ...m, ...p } : m)) }))

  function add() {
    const id = newId('mode')
    update(d => ({ ...d, modes: [...d.modes, { id, label: 'New order type', labelAlt: '', short: '', eta: [], fields: [], fee: 0, copies: 1, enabled: true }] }))
    setEditing({ id, isNew: true })
  }

  // Receipt blocks limited to this type would otherwise point at nothing.
  function remove(id) {
    const strip = blocks => (blocks || []).map(b => (Array.isArray(b.show) ? { ...b, show: b.show.filter(x => x !== id) } : b))
    update(d => ({
      ...d,
      modes: d.modes.filter(m => m.id !== id),
      receipt: { ...d.receipt, blocks: strip(d.receipt.blocks) },
    }))
    setEditing(null)
  }

  const editMode = editing && modes.find(m => m.id === editing.id)

  return (
    <>
      <PageHeader
        title="Order types" description="Each type gets its own button, receipt label, ready time and number of copies."
        actions={<Button icon="plus" onClick={add}>Add order type</Button>}
      />

      {!config.features.orderModes && (
        <div className="pg-notice">
          <span>Order types are off. The POS uses one plain order flow.</span>
          <Button size="sm" onClick={() => update(d => setPath(d, 'features.orderModes', true))}>Turn on</Button>
        </div>
      )}

      <Section className="pg-flush">
        {modes.length === 0
          ? <Empty title="No order types yet" action={<Button size="sm" onClick={add}>Add order type</Button>} />
          : (
            <SortableList items={modes} keyOf={m => m.id} className="ui-list" onMove={(a, b) => update(d => ({ ...d, modes: moveItem(d.modes, a, b) }))}>
              {(m, { handle, style }) => (
                <div
                  className="ui-list__row pg-mode pg-clickable" style={style} role="button" tabIndex={0}
                  onClick={() => setEditing({ id: m.id })}
                  onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setEditing({ id: m.id }) }}
                >
                  {handle}
                  <div className="pg-names">
                    <div className="pg-ellipsis">{nameOf(m)}</div>
                    {alt && m.labelAlt && <div className="pg-sub pg-ellipsis">{m.labelAlt}</div>}
                  </div>
                  <span className="pg-col-short">{m.short && <Badge>{m.short}</Badge>}</span>
                  <span className="pg-col-eta pg-sub">{etaLabel(m.eta)}</span>
                  <span className="pg-col-copies pg-sub">{m.copies} {m.copies === 1 ? 'copy' : 'copies'}</span>
                  <span onClick={e => e.stopPropagation()}>
                    <Toggle checked={m.enabled} onChange={enabled => patch(m.id, { enabled })} />
                  </span>
                  <Icon name="chevronRight" className="pg-chev" />
                </div>
              )}
            </SortableList>
          )}
      </Section>

      {editMode && (
        <ModeEditor
          config={config} mode={editMode} isNew={editing.isNew} patch={p => patch(editMode.id, p)}
          onClose={() => setEditing(null)}
          onDelete={() => (buttonsFor(config, editMode.id).length ? setConfirm(editMode) : remove(editMode.id))}
        />
      )}

      {confirm && (
        <Confirm title="Delete order type?" onConfirm={() => remove(confirm.id)} onClose={() => setConfirm(null)}>
          A button on the POS home screen starts {nameOf(confirm)}. It will show as empty until you change or remove it in POS layout.
        </Confirm>
      )}
    </>
  )
}

function ModeEditor({ config, mode, isNew, patch, onClose, onDelete }) {
  const alt = config.features.altNames
  const eta = mode.eta || []
  const etaKind = eta.length > 1 ? 'range' : eta.length ? 'fixed' : 'none'
  const fields = mode.fields || []

  function setKind(k) {
    if (k === 'none') patch({ eta: [] })
    if (k === 'fixed') patch({ eta: [eta[0] ?? 20] })
    if (k === 'range') patch({ eta: [eta[0] ?? 30, eta[1] ?? (eta[0] ?? 30) + 15] })
  }
  const setEta = (i, v) => patch({ eta: eta.map((x, j) => (j === i ? Math.max(0, v ?? 0) : x)) })

  return (
    <Modal
      title={isNew ? 'New order type' : 'Edit order type'} onClose={onClose} width={520}
      footer={<>
        <Button variant="danger" onClick={onDelete}>Delete</Button>
        <div className="ui-spacer" />
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}
    >
      <div className="ui-grid-2">
        <Field label="Name">
          <Input value={mode.label} onChange={e => patch({ label: e.target.value })} autoFocus={isNew} onFocus={isNew ? e => e.target.select() : undefined} />
        </Field>
        {alt
          ? <Field label="Second-language name"><Input value={mode.labelAlt || ''} placeholder="Optional" onChange={e => patch({ labelAlt: e.target.value })} /></Field>
          : <div />}
        <Field label="Short code" hint="Used on the summary, like T/A.">
          <Input value={mode.short || ''} maxLength={8} onChange={e => patch({ short: e.target.value })} className="pg-input-short" />
        </Field>
        <Field label="Copies" hint="Receipts printed per order.">
          <NumberInput value={mode.copies} min={1} max={10} onChange={v => patch({ copies: Math.min(10, Math.max(1, v ?? 1)) })} className="pg-input-short" />
        </Field>
      </div>

      <Field label="Ready time" hint="Minutes from when the order is taken. Prints as a clock time.">
        <div className="ui-stack pg-gap-8">
          <Segmented
            value={etaKind} onChange={setKind} size="sm"
            options={[{ value: 'none', label: 'None' }, { value: 'fixed', label: 'Fixed' }, { value: 'range', label: 'Range' }]}
          />
          {etaKind !== 'none' && (
            <div className="ui-row">
              <NumberInput value={eta[0]} min={0} onChange={v => setEta(0, v)} className="pg-input-short" aria-label="Minutes" />
              {etaKind === 'range' && <><span className="pg-muted">to</span><NumberInput value={eta[1]} min={0} onChange={v => setEta(1, v)} className="pg-input-short" aria-label="Minutes, upper" /></>}
              <span className="pg-muted">min</span>
            </div>
          )}
        </div>
      </Field>

      <Field label="Ask for" hint="Asked before the order starts. Each can be skipped on the POS.">
        <div className="ui-row pg-gap-16">
          {FIELDS.map(f => (
            <Toggle
              key={f.value} label={f.label} checked={fields.includes(f.value)}
              onChange={on => patch({ fields: FIELDS.map(x => x.value).filter(v => (v === f.value ? on : fields.includes(v))) })}
            />
          ))}
        </div>
      </Field>

      <div className="ui-grid-2">
        <Field label="Fee" hint="Added to each order, like a delivery charge. Can be changed per order.">
          <MoneyInput value={mode.fee} currency={config.business.currency} onChange={fee => patch({ fee })} />
        </Field>
        <Field label="Status">
          <div className="pg-toggle-pad">
            <Toggle checked={mode.enabled} onChange={enabled => patch({ enabled })} label={mode.enabled ? 'Shown on the POS' : 'Hidden on the POS'} />
          </div>
        </Field>
      </div>
    </Modal>
  )
}
