// Import a menu from a PDF or pasted text. Everything runs in the browser:
// pdf.js reads the PDF's text layer, src/lib/menuImport.js turns lines into
// categories and items, and the review step lets the owner fix names and
// prices before anything touches the draft. The result goes into the draft
// only, so it's saved through the normal Save flow.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconButton, Input, Modal, MoneyInput, Segmented, Spinner, Textarea, Toggle } from '../../ui/index.jsx'
import { checkFile, countMenu, extractFromPdfText, parseMenuText, toConfigPatch } from '../../lib/menuImport.js'
import './menuImport.css'

const cx = (...c) => c.filter(Boolean).join(' ')
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const countLine = ({ items, categories }) => `${plural(items, 'item')} in ${plural(categories, 'category', 'categories')}`

// Review state: everything included to start with.
function withFlags(menu) {
  return {
    ...menu,
    categories: menu.categories.map(c => ({
      ...c,
      include: true,
      items: c.items.map(i => ({ ...i, include: true, choices: (i.choices || []).map(ch => ({ ...ch })) })),
    })),
  }
}

function pickBusiness(b) {
  if (!b) return null
  const out = {}
  for (const k of ['name', 'nameAlt', 'phone', 'address']) if (b[k]) out[k] = b[k]
  return out.name || out.phone || out.address ? out : null
}

export default function MenuImport({ config, update, onClose, onImported }) {
  const [step, setStep] = useState('upload')   // upload | reading | review
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [menu, setMenu] = useState(null)
  const [source, setSource] = useState('')
  const [mode, setMode] = useState('append')
  const [armed, setArmed] = useState(false)
  const [useBusiness, setUseBusiness] = useState(true)
  const [over, setOver] = useState(false)
  const fileRef = useRef(null)
  const abortRef = useRef(null)

  const currency = config.business?.currency || '£'

  // Live count while pasting; deferred so a long paste doesn't stall typing.
  const deferred = useDeferredValue(text)
  const pasted = useMemo(() => (deferred.trim() ? parseMenuText(deferred) : null), [deferred])
  const pastedCount = pasted ? countMenu(pasted) : null

  useEffect(() => () => abortRef.current?.abort(), [])

  function close() {
    abortRef.current?.abort()
    onClose?.()
  }

  function openReview(parsed, from) {
    setMenu(withFlags(parsed))
    setSource(from)
    setUseBusiness(true)
    setArmed(false)
    setError('')
    setStep('review')
  }

  async function readFile(file) {
    setError('')
    const bad = checkFile(file)
    if (bad) { setError(bad); return }
    const ac = new AbortController()
    abortRef.current = ac
    setStatus('Opening the PDF…')
    setStep('reading')
    try {
      const parsed = await extractFromPdfText(file, {
        signal: ac.signal,
        onProgress: ({ pages }) => setStatus(`Reading ${plural(pages, 'page')}…`),
      })
      if (ac.signal.aborted) return
      if (!countMenu(parsed).items) throw new Error('No prices found in this PDF. Paste the menu text instead.')
      openReview(parsed, file.name)
    } catch (e) {
      if (e?.name === 'AbortError' || ac.signal.aborted) return
      setError(e?.message || "That PDF couldn't be read.")
      setStep('upload')
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  function cancelReading() {
    abortRef.current?.abort()
    setStep('upload')
  }

  function onPick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) readFile(f)
  }

  function onDrop(e) {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) readFile(f)
  }

  /* ── Review edits ── */

  const setCat = (ci, patch) => setMenu(m => ({ ...m, categories: m.categories.map((c, k) => (k === ci ? { ...c, ...patch } : c)) }))
  const setItem = (ci, ii, patch) => setMenu(m => ({
    ...m,
    categories: m.categories.map((c, k) => (k !== ci ? c : { ...c, items: c.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) })),
  }))
  const setChoice = (ci, ii, hi, patch) => setMenu(m => ({
    ...m,
    categories: m.categories.map((c, k) => (k !== ci ? c : {
      ...c,
      items: c.items.map((it, j) => (j !== ii ? it : { ...it, choices: it.choices.map((ch, h) => (h === hi ? { ...ch, ...patch } : ch)) })),
    })),
  }))
  const dropChoice = (ci, ii, hi) => setMenu(m => ({
    ...m,
    categories: m.categories.map((c, k) => (k !== ci ? c : {
      ...c,
      items: c.items.map((it, j) => (j !== ii ? it : { ...it, choices: it.choices.filter((_, h) => h !== hi) })),
    })),
  }))

  const counts = menu ? countMenu(menu) : { items: 0, categories: 0 }
  const patch = useMemo(() => (menu ? toConfigPatch(menu, config, { mode }) : null), [menu, config, mode])
  const added = patch ? patch.items.length - (mode === 'append' ? config.items.length : 0) : 0
  const skipped = Math.max(0, counts.items - added)
  const business = pickBusiness(menu?.business)
  const showAlt = config.features?.altNames !== false ||
    !!menu?.categories.some(c => c.nameAlt || c.items.some(i => i.nameAlt))

  // A changed selection or mode needs a fresh confirmation.
  useEffect(() => setArmed(false), [mode, added])

  function doImport() {
    if (!added) return
    if (mode === 'replace' && !armed) { setArmed(true); return }
    const biz = useBusiness ? business : null
    update(d => {
      const p = toConfigPatch(menu, d, { mode })
      const next = { ...d, categories: p.categories, items: p.items }
      if (mode === 'replace') {
        // Modifiers limited to old items would otherwise point at nothing.
        const ids = new Set(p.items.map(i => i.id))
        next.modifiers = (d.modifiers || []).map(m => (m.itemIds ? { ...m, itemIds: m.itemIds.filter(id => ids.has(id)) } : m))
      }
      if (biz) next.business = { ...d.business, ...biz }
      return next
    })
    onImported?.({ added, skipped, mode, message: 'Imported. Review and save.' })
    onClose?.()
  }

  /* ── Steps ── */

  if (step === 'reading') {
    return (
      <Modal title="Import menu" onClose={close} width={880} footer={<Button onClick={cancelReading}>Cancel</Button>}>
        <div className="mi-reading">
          <Spinner />
          <span>{status}</span>
        </div>
      </Modal>
    )
  }

  if (step === 'upload') {
    const n = pastedCount?.items || 0
    return (
      <Modal
        title="Import menu" onClose={close} width={880}
        footer={<>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!n} onClick={() => openReview(pasted, 'pasted text')}>
            {n ? `Review ${plural(n, 'item')}` : 'Review'}
          </Button>
        </>}
      >
        <button
          type="button" className={cx('mi-drop', over && 'is-over')}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          Drop a PDF here, or click to choose one
        </button>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" hidden onChange={onPick} />
        {error && <p className="mi-error" role="alert">{error}</p>}

        <div className="mi-paste">
          <label className="mi-label" htmlFor="mi-paste">Or paste the menu text</label>
          <Textarea
            id="mi-paste" rows={10} value={text} onChange={e => setText(e.target.value)} spellCheck={false}
            placeholder={'STARTERS 小食\nSpring Rolls 春卷 4.50\nChow Mein: Chicken 7.50 / Beef 8.00'}
          />
          <p className="mi-hint">
            {!text.trim()
              ? 'One item per line with its price. Works for scans and photos: copy the text out first.'
              : n ? countLine(pastedCount) : 'No prices found yet.'}
          </p>
        </div>
      </Modal>
    )
  }

  // Review
  const note = mode === 'replace'
    ? (armed ? `This removes the ${plural(config.items.length, 'item')} on your menu now. Click again to replace.` : '')
    : skipped ? `${plural(skipped, 'item')} already on your menu will be skipped.` : ''

  return (
    <Modal
      title="Import menu" onClose={close} width={880}
      footer={<>
        <Button onClick={() => { setStep('upload'); setError('') }}>Back</Button>
        <div className={cx('mi-note', armed && 'is-warn')}>{note}</div>
        <div className="mi-mode">
          <Segmented
            size="sm" value={mode} onChange={setMode}
            options={[{ value: 'append', label: 'Add to menu' }, { value: 'replace', label: 'Replace menu' }]}
          />
        </div>
        <Button variant={armed ? 'danger' : 'primary'} disabled={!added} onClick={doImport}>
          {armed ? 'Replace menu' : `Import ${plural(added, 'item')}`}
        </Button>
      </>}
    >
      <div className="mi-summary">
        <span className="mi-summary__count">{countLine(counts)}</span>
        <span className="mi-muted">from {source}</span>
      </div>

      {business && (
        <div className="mi-business">
          <Toggle checked={useBusiness} onChange={setUseBusiness} label="Also use shop name and phone from the menu" />
          <span className="mi-muted">{[business.name, business.phone, business.address].filter(Boolean).join(' · ')}</span>
        </div>
      )}

      <div className={cx('mi-table', !showAlt && 'no-alt')}>
        <div className="mi-row mi-row--head" aria-hidden="true">
          <span />
          <span>Name</span>
          {showAlt && <span>Second name</span>}
          <span>Price</span>
          <span />
        </div>

        {menu.categories.map((c, ci) => (
          <section key={ci} className={cx('mi-cat', !c.include && 'is-off')}>
            <header className="mi-cat__head">
              <Toggle checked={c.include} onChange={v => setCat(ci, { include: v })} />
              <Input className="mi-cat__name" value={c.name} onChange={e => setCat(ci, { name: e.target.value })} aria-label="Category name" />
              {showAlt && <Input value={c.nameAlt} placeholder="Second name" onChange={e => setCat(ci, { nameAlt: e.target.value })} aria-label="Category second name" />}
              <span className="mi-cat__count">{plural(c.items.filter(i => i.include).length, 'item')}</span>
            </header>

            {c.include && c.items.map((it, ii) => (
              <div key={ii} className={cx('mi-item', !it.include && 'is-off')}>
                <div className="mi-row">
                  <input
                    type="checkbox" className="mi-check" checked={it.include}
                    onChange={e => setItem(ci, ii, { include: e.target.checked })} aria-label={`Include ${it.name}`}
                  />
                  <Input value={it.name} onChange={e => setItem(ci, ii, { name: e.target.value })} aria-label="Name" />
                  {showAlt && <Input value={it.nameAlt} onChange={e => setItem(ci, ii, { nameAlt: e.target.value })} aria-label="Second name" />}
                  <MoneyInput value={it.price} currency={currency} onChange={v => setItem(ci, ii, { price: v })} aria-label="Price" />
                  <span />
                </div>
                {it.description && (
                  <div className="mi-row mi-row--sub">
                    <span />
                    <Input
                      className="mi-input-sm mi-desc" value={it.description}
                      onChange={e => setItem(ci, ii, { description: e.target.value })} aria-label="Description"
                    />
                  </div>
                )}
                {it.choices.map((ch, hi) => (
                  <div key={hi} className="mi-row mi-row--sub">
                    <span />
                    <Input className="mi-input-sm" value={ch.name} onChange={e => setChoice(ci, ii, hi, { name: e.target.value })} aria-label="Choice name" />
                    {showAlt && <Input className="mi-input-sm" value={ch.nameAlt} onChange={e => setChoice(ci, ii, hi, { nameAlt: e.target.value })} aria-label="Choice second name" />}
                    <MoneyInput
                      className="mi-input-sm" value={ch.price} currency={`+${currency}`}
                      onChange={v => setChoice(ci, ii, hi, { price: v })} aria-label="Added to the item price" title="Added to the item price"
                    />
                    <IconButton icon="x" label="Remove choice" size="sm" onClick={() => dropChoice(ci, ii, hi)} />
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}
