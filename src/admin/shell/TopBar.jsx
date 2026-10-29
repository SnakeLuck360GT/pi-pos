import { Button, IconButton, Spinner } from '../../ui/index.jsx'

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const MOD = MAC ? '⌘' : 'Ctrl+'

function SaveState({ saving, error, dirty }) {
  if (saving) return <span className="adm-state"><Spinner /> Saving…</span>
  if (error) return <span className="adm-state is-error" title={error}>Not saved: {error}</span>
  if (dirty) return <span className="adm-state is-dirty"><span className="adm-state__dot" />Unsaved changes</span>
  return <span className="adm-state">Saved</span>
}

export default function TopBar({ route, dirty, saving, error, onSave, onDiscard, onMenu, history }) {
  return (
    <header className="adm-top">
      <IconButton icon="list" label="Menu" className="adm-top__menu" onClick={onMenu} />
      <div className="adm-top__title">
        {route.group && <span className="adm-top__group">{route.group}</span>}
        {route.group && <span className="adm-top__sep">/</span>}
        <span>{route.label}</span>
      </div>
      <div className="ui-spacer" />
      <SaveState saving={saving} error={error} dirty={dirty} />
      {history && (
        <div className="adm-top__history">
          <IconButton icon="undo" label={`Undo (${MOD}Z)`} size="sm" disabled={!history.canUndo} onClick={history.undo} />
          <IconButton icon="redo" label={`Redo (${MAC ? '⇧⌘Z' : 'Ctrl+Y'})`} size="sm" disabled={!history.canRedo} onClick={history.redo} />
        </div>
      )}
      <Button onClick={onDiscard} disabled={!dirty || saving}>Discard</Button>
      <Button variant="primary" onClick={onSave} disabled={!dirty || saving} title={`Save (${MOD}S)`} data-tour="save">Save</Button>
    </header>
  )
}
