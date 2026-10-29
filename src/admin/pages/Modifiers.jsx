import { useState } from 'react'
import {
  Badge, Button, Empty, Field, Icon, Input, Modal, MoneyInput, PageHeader, Section, Segmented, Toggle,
} from '../../ui/index.jsx'
import { newId } from '../../../shared/defaults.js'
import { money } from '../../../shared/order.js'
import { setPath } from '../../lib/fields.js'
import { SortableList, moveItem } from './Sortable.jsx'
import { nameOf } from './util.jsx'

const appliesText = (m, config) => {
  if (m.itemIds == null) return 'All items'
  const n = m.itemIds.filter(id => config.items.some(i => i.id === id)).length
  return n === 1 ? '1 item' : `${n} items`
}

export default function Modifiers({ config, update }) {
  const [editing, setEditing] = useState(null)
  const mods = config.modifiers
  const alt = config.features.altNames

  function add() {
    const id = newId('mod')
    update(d => ({ ...d, modifiers: [...d.modifiers, { id, name: 'New modifier', nameAlt: '', kind: 'remove', price: 0, itemIds: null }] }))
    setEditing({ id, isNew: true })
  }

  const editMod = editing && mods.find(m => m.id === editing.id)

  return (
    <>
      <PageHeader
        title="Modifiers" description={'Add and remove options for order lines, like "No onion" or "Extra sauce".'}
        actions={<Button icon="plus" onClick={add}>Add modifier</Button>}
      />

      {!config.features.modifiers && (
        <div className="pg-notice">
          <span>Modifiers are turned off, so the POS doesn't show them.</span>
          <Button size="sm" onClick={() => update(d => setPath(d, 'features.modifiers', true))}>Turn on</Button>
        </div>
      )}

      <Section className="pg-flush">
        {mods.length === 0
          ? <Empty title="No modifiers yet" action={<Button size="sm" onClick={add}>Add modifier</Button>} />
          : (
            <SortableList items={mods} keyOf={m => m.id} className="ui-list" onMove={(a, b) => update(d => ({ ...d, modifiers: moveItem(d.modifiers, a, b) }))}>
              {(m, { handle, style }) => (
                <div
                  className="ui-list__row pg-mod pg-clickable" style={style} role="button" tabIndex={0}
                  onClick={() => setEditing({ id: m.id })}
                  onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setEditing({ id: m.id }) }}
                >
                  {handle}
                  <div className="pg-names">
                    <div className="pg-ellipsis">{nameOf(m)}</div>
                    {alt && m.nameAlt && <div className="pg-sub pg-ellipsis">{m.nameAlt}</div>}
                  </div>
                  <span className="pg-col-kind"><Badge>{m.kind === 'add' ? 'Add' : 'Remove'}</Badge></span>
                  <span className="pg-col-applies pg-sub">{appliesText(m, config)}</span>
                  <span className="pg-money">{m.price ? money(m.price, config) : <span className="pg-muted">Free</span>}</span>
                  <Icon name="chevronRight" className="pg-chev" />
                </div>
              )}
            </SortableList>
          )}
      </Section>

      {editMod && (
        <ModifierEditor
          config={config} mod={editMod} isNew={editing.isNew} update={update}
          onClose={() => setEditing(null)}
          onDelete={() => {
            // Items that picked this modifier explicitly forget it too.
            update(d => ({
              ...d,
              modifiers: d.modifiers.filter(x => x.id !== editMod.id),
              items: d.items.map(i => (i.modifierIds ? { ...i, modifierIds: i.modifierIds.filter(id => id !== editMod.id) } : i)),
            }))
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function ModifierEditor({ config, mod, isNew, update, onClose, onDelete }) {
  const alt = config.features.altNames
  const patch = p => update(d => ({ ...d, modifiers: d.modifiers.map(m => (m.id === mod.id ? { ...m, ...p } : m)) }))
  const ids = mod.itemIds || []
  const toggle = (id, on) => patch({ itemIds: on ? [...ids, id] : ids.filter(x => x !== id) })

  return (
    <Modal
      title={isNew ? 'New modifier' : 'Edit modifier'} onClose={onClose} width={520}
      footer={<>
        <Button variant="danger" onClick={onDelete}>Delete modifier</Button>
        <div className="ui-spacer" />
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}
    >
      <div className="ui-grid-2">
        <Field label="Name">
          <Input value={mod.name} onChange={e => patch({ name: e.target.value })} autoFocus={isNew} onFocus={isNew ? e => e.target.select() : undefined} />
        </Field>
        {alt
          ? <Field label="Second-language name"><Input value={mod.nameAlt || ''} placeholder="Optional" onChange={e => patch({ nameAlt: e.target.value })} /></Field>
          : <div />}
        <Field label="Type" hint={mod.kind === 'add' ? 'Prints with a + sign.' : 'Prints with a - sign.'}>
          <Segmented value={mod.kind} onChange={kind => patch({ kind })} options={[{ value: 'add', label: 'Add' }, { value: 'remove', label: 'Remove' }]} />
        </Field>
        <Field label="Price" hint="Added to the line. Usually 0 for removals.">
          <MoneyInput value={mod.price} currency={config.business.currency} onChange={price => patch({ price })} />
        </Field>
      </div>

      <Field label="Offered on">
        <Segmented
          value={mod.itemIds == null ? 'all' : 'some'}
          onChange={v => patch({ itemIds: v === 'all' ? null : [] })}
          options={[{ value: 'all', label: 'All items' }, { value: 'some', label: 'Some items' }]}
        />
      </Field>

      {mod.itemIds != null && (
        config.items.length === 0
          ? <div className="pg-sub">No items on the menu yet.</div>
          : (
            <div className="pg-pick">
              {config.categories.map(c => {
                const its = config.items.filter(i => i.categoryId === c.id)
                if (!its.length) return null
                return (
                  <div key={c.id} className="pg-pick__group">
                    <div className="pg-pick__label">{nameOf(c)}</div>
                    <div className="pg-checks">
                      {its.map(i => (
                        <div key={i.id} className="pg-check">
                          <Toggle checked={ids.includes(i.id)} onChange={on => toggle(i.id, on)} label={nameOf(i)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
      )}
    </Modal>
  )
}
