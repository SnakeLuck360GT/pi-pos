import { useState } from 'react'
import {
  Badge, Button, ColorInput, Empty, Field, Icon, IconButton, Input, Modal, MoneyInput,
  PageHeader, Section, Segmented, Select, Toggle,
} from '../../ui/index.jsx'
import { newId } from '../../../shared/defaults.js'
import { money } from '../../../shared/order.js'
import { SortableList, moveItem, moveWithin } from './Sortable.jsx'
import { Confirm, nameOf } from './util.jsx'
import MenuImport from '../import/MenuImport.jsx'

// Items whose category was removed some other way still need a home.
const NONE = '__none'

// Removing items also removes them from modifiers that list them.
function dropItems(d, ids) {
  const gone = new Set(ids)
  return {
    ...d,
    items: d.items.filter(i => !gone.has(i.id)),
    modifiers: d.modifiers.map(m => (m.itemIds ? { ...m, itemIds: m.itemIds.filter(id => !gone.has(id)) } : m)),
  }
}

export default function Menu({ config, update }) {
  const { categories, items } = config
  const alt = config.features.altNames
  const [picked, setPicked] = useState(() => categories[0]?.id ?? null)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')

  const known = new Set(categories.map(c => c.id))
  const orphans = items.filter(i => !known.has(i.categoryId))
  const active = known.has(picked) || (picked === NONE && orphans.length) ? picked : categories[0]?.id ?? (orphans.length ? NONE : null)
  const inActive = it => (active === NONE ? !known.has(it.categoryId) : it.categoryId === active)
  const shown = items.filter(inActive)
  const activeCat = categories.find(c => c.id === active)
  const countIn = id => items.filter(i => i.categoryId === id).length

  const patchCat = (id, patch) => update(d => ({ ...d, categories: d.categories.map(c => (c.id === id ? { ...c, ...patch } : c)) }))

  function addCategory() {
    const id = newId('cat')
    update(d => ({ ...d, categories: [...d.categories, { id, name: 'New category', nameAlt: '' }] }))
    setPicked(id)
    // Focus the new name once it has rendered.
    requestAnimationFrame(() => document.querySelector(`[data-cat="${id}"]`)?.select())
  }

  function deleteCategory(c) {
    const ids = items.filter(i => i.categoryId === c.id).map(i => i.id)
    update(d => ({ ...dropItems(d, ids), categories: d.categories.filter(x => x.id !== c.id) }))
  }

  function addItem() {
    const id = newId('item')
    const categoryId = active === NONE ? categories[0]?.id ?? '' : active
    update(d => ({ ...d, items: [...d.items, { id, categoryId, name: 'New item', nameAlt: '', price: 0, color: '', choices: [], modifierIds: null }] }))
    setEditing({ id, isNew: true })
  }

  const editItem = editing && items.find(i => i.id === editing.id)

  return (
    <>
      <PageHeader
        title="Menu" description="Categories and items, in the order the POS shows them."
        actions={<Button icon="upload" onClick={() => setImporting(true)}>Import</Button>}
      />
      {notice && <p className="pg-notice">{notice}</p>}
      {importing && (
        <MenuImport
          config={config} update={update}
          onClose={() => setImporting(false)}
          onImported={s => setNotice(`${s.message} ${s.added} item${s.added === 1 ? '' : 's'} added.`)}
        />
      )}

      <div className="pg-menu">
        <Section
          title="Categories" className="pg-flush"
          actions={<Button size="sm" icon="plus" onClick={addCategory}>Add</Button>}
        >
          {categories.length === 0 && !orphans.length
            ? <Empty title="No categories yet" action={<Button size="sm" onClick={addCategory}>Add category</Button>} />
            : (
              <>
                <SortableList
                  items={categories} keyOf={c => c.id} className="ui-list"
                  onMove={(a, b) => update(d => ({ ...d, categories: moveItem(d.categories, a, b) }))}
                >
                  {(c, { handle, style }) => (
                    <div
                      className={`ui-list__row pg-cat${c.id === active ? ' is-active' : ''}`}
                      style={style} onClick={() => setPicked(c.id)}
                    >
                      {handle}
                      <div className="pg-cat__names">
                        <input
                          className="pg-quiet" data-cat={c.id} value={c.name} placeholder="Category name"
                          onChange={e => patchCat(c.id, { name: e.target.value })} onFocus={() => setPicked(c.id)}
                        />
                        {alt && (
                          <input
                            className="pg-quiet pg-quiet--alt" value={c.nameAlt || ''} placeholder="Second language"
                            onChange={e => patchCat(c.id, { nameAlt: e.target.value })} onFocus={() => setPicked(c.id)}
                          />
                        )}
                      </div>
                      <span className="pg-count">{countIn(c.id)}</span>
                      <IconButton
                        icon="trash" label="Delete category" size="sm"
                        onClick={e => {
                          e.stopPropagation()
                          if (countIn(c.id)) setConfirm(c)
                          else deleteCategory(c)
                        }}
                      />
                    </div>
                  )}
                </SortableList>
                {orphans.length > 0 && (
                  <div className="ui-list pg-orphans">
                    <div className={`ui-list__row pg-cat${active === NONE ? ' is-active' : ''}`} onClick={() => setPicked(NONE)}>
                      <span className="pg-grip-space" />
                      <div className="pg-cat__names pg-muted">No category</div>
                      <span className="pg-count">{orphans.length}</span>
                      <span className="pg-icon-space" />
                    </div>
                  </div>
                )}
              </>
            )}
        </Section>

        <Section
          title={active === NONE ? 'No category' : activeCat ? nameOf(activeCat) : 'Items'}
          description={active === NONE ? 'Move these into a category so the POS shows them.' : undefined}
          className="pg-flush"
          actions={<Button size="sm" icon="plus" onClick={addItem} disabled={!categories.length}>Add item</Button>}
        >
          {shown.length === 0
            ? (
              <Empty
                title={categories.length ? 'No items in this category' : 'Add a category first'}
                action={categories.length ? <Button size="sm" onClick={addItem}>Add item</Button> : null}
              />
            )
            : (
              <SortableList
                items={shown} keyOf={i => i.id} className="ui-list"
                onMove={(a, b) => update(d => ({ ...d, items: moveWithin(d.items, inActive, a, b) }))}
              >
                {(it, { handle, style }) => (
                  <div
                    className="ui-list__row pg-item pg-clickable" style={style} tabIndex={0} role="button"
                    onClick={() => setEditing({ id: it.id })}
                    onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setEditing({ id: it.id }) }}
                  >
                    {handle}
                    <span className="pg-swatch" style={it.color ? { background: it.color } : undefined} />
                    <div className="pg-names">
                      <div className="pg-ellipsis">{nameOf(it)}</div>
                      {alt && it.nameAlt && <div className="pg-sub pg-ellipsis">{it.nameAlt}</div>}
                    </div>
                    {it.choices?.length > 0 && <Badge>{it.choices.length} choices</Badge>}
                    <span className="pg-money">{money(it.price, config)}</span>
                    <Icon name="chevronRight" className="pg-chev" />
                  </div>
                )}
              </SortableList>
            )}
        </Section>
      </div>

      {editItem && (
        <ItemEditor
          config={config} item={editItem} isNew={editing.isNew} update={update}
          onClose={() => setEditing(null)}
          onDelete={() => { update(d => dropItems(d, [editItem.id])); setEditing(null) }}
        />
      )}

      {confirm && (
        <Confirm
          title="Delete category?" confirmLabel={`Delete category and ${countIn(confirm.id)} items`}
          onConfirm={() => deleteCategory(confirm)} onClose={() => setConfirm(null)}
        >
          {nameOf(confirm)} has {countIn(confirm.id)} {countIn(confirm.id) === 1 ? 'item' : 'items'}. They will be deleted too.
          You can undo this until you save.
        </Confirm>
      )}
    </>
  )
}

function ItemEditor({ config, item, isNew, update, onClose, onDelete }) {
  const alt = config.features.altNames
  const currency = config.business.currency
  const patch = p => update(d => ({ ...d, items: d.items.map(i => (i.id === item.id ? { ...i, ...(typeof p === 'function' ? p(i) : p) } : i)) }))
  const choices = item.choices || []
  const setChoices = fn => patch(i => ({ choices: fn(i.choices || []) }))
  const patchChoice = (id, p) => setChoices(cs => cs.map(c => (c.id === id ? { ...c, ...p } : c)))

  return (
    <Modal
      title={isNew ? 'New item' : 'Edit item'} onClose={onClose} width={560}
      footer={<>
        <Button variant="danger" onClick={onDelete}>Delete item</Button>
        <div className="ui-spacer" />
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}
    >
      <div className="ui-grid-2">
        <Field label="Name">
          <Input value={item.name} onChange={e => patch({ name: e.target.value })} autoFocus={isNew} onFocus={isNew ? e => e.target.select() : undefined} />
        </Field>
        {alt
          ? <Field label="Second-language name"><Input value={item.nameAlt || ''} placeholder="Optional" onChange={e => patch({ nameAlt: e.target.value })} /></Field>
          : <div />}
        <Field label="Price"><MoneyInput value={item.price} currency={currency} onChange={v => patch({ price: v })} /></Field>
        <Field label="Category">
          <Select
            value={item.categoryId}
            options={[...(config.categories.some(c => c.id === item.categoryId) ? [] : [{ value: item.categoryId ?? '', label: 'No category' }]),
              ...config.categories.map(c => ({ value: c.id, label: nameOf(c) }))]}
            onChange={v => patch({ categoryId: v })}
          />
        </Field>
      </div>
      <Field label="Colour" hint="Shown as a thin edge on the POS tile.">
        <ColorInput value={item.color} placeholder="None" onChange={v => patch({ color: v })} />
      </Field>

      <div className="pg-sub-head">
        <div>
          <div className="pg-sub-head__title">Choices</div>
          <div className="pg-sub">One must be picked before the item is added. The choice price is added to the item price.</div>
        </div>
        <Button size="sm" icon="plus" onClick={() => setChoices(cs => [...cs, { id: newId('ch'), name: '', nameAlt: '', price: 0 }])}>Add</Button>
      </div>
      {choices.length > 0 && (
        <SortableList items={choices} keyOf={c => c.id} className="pg-choices" onMove={(a, b) => setChoices(cs => moveItem(cs, a, b))}>
          {(c, { handle, style }) => (
            <div className={`pg-choice${alt ? '' : ' no-alt'}`} style={style}>
              {handle}
              <Input value={c.name} placeholder="Name" aria-label="Choice name" onChange={e => patchChoice(c.id, { name: e.target.value })} />
              {alt && <Input value={c.nameAlt || ''} placeholder="Second language" aria-label="Choice second-language name" onChange={e => patchChoice(c.id, { nameAlt: e.target.value })} />}
              <MoneyInput value={c.price} currency={currency} aria-label="Extra price" onChange={v => patchChoice(c.id, { price: v })} />
              <IconButton icon="x" label="Remove choice" size="sm" onClick={() => setChoices(cs => cs.filter(x => x.id !== c.id))} />
            </div>
          )}
        </SortableList>
      )}

      {config.features.modifiers && <AllowedModifiers config={config} item={item} patch={patch} />}
    </Modal>
  )
}

function AllowedModifiers({ config, item, patch }) {
  const mods = config.modifiers
  const initial = item.modifierIds == null ? 'all' : item.modifierIds.length ? 'pick' : 'none'
  // Local, because "pick" with nothing ticked is stored the same as "none".
  const [mode, setMode] = useState(initial)
  const ids = item.modifierIds || []

  function choose(m) {
    setMode(m)
    if (m === 'all') patch({ modifierIds: null })
    if (m === 'none') patch({ modifierIds: [] })
    if (m === 'pick') patch({ modifierIds: item.modifierIds?.length ? item.modifierIds : mods.map(x => x.id) })
  }
  const toggle = (id, on) => patch({ modifierIds: on ? [...ids, id] : ids.filter(x => x !== id) })

  return (
    <>
      <div className="pg-sub-head">
        <div>
          <div className="pg-sub-head__title">Modifiers</div>
          <div className="pg-sub">Which add and remove options the POS offers on this item.</div>
        </div>
      </div>
      <Segmented
        value={mode} onChange={choose} size="sm"
        options={[{ value: 'all', label: 'All' }, { value: 'none', label: 'None' }, { value: 'pick', label: 'Pick' }]}
      />
      {mode === 'pick' && (
        mods.length === 0
          ? <div className="pg-sub">No modifiers yet. Add them on the Modifiers page.</div>
          : (
            <div className="pg-checks">
              {mods.map(m => {
                const offered = m.itemIds == null || m.itemIds.includes(item.id)
                return (
                  <div key={m.id} className="pg-check">
                    <Toggle checked={ids.includes(m.id)} onChange={on => toggle(m.id, on)} label={nameOf(m)} />
                    {!offered && <span className="pg-sub">Not offered on this item</span>}
                  </div>
                )
              })}
            </div>
          )
      )}
    </>
  )
}
