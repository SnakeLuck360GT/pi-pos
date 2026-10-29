// Small designer-only controls built on the UI kit.
import { useEffect, useState } from 'react'
import { NumberInput } from '../../ui/index.jsx'

// Number field that keeps its own text while focused. `live` commits every
// valid keystroke (position, theme sizes); without it, values commit on blur
// or Enter only, so typing "12" never passes through a destructive "1" (grid
// size, which clamps blocks). Empty or invalid input reverts on blur.
export function CommitNumber({ value, onCommit, min, max, step, live = true, ...rest }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])

  const valid = v => v != null && !Number.isNaN(v) && (min == null || v >= min) && (max == null || v <= max)

  function change(v) {
    setLocal(v)
    if (live && valid(v) && v !== value) onCommit(v)
  }
  function commit() {
    if (valid(local)) { if (local !== value) onCommit(local) } else setLocal(value)
  }

  return (
    <NumberInput
      value={local} min={min} max={max} step={step} onChange={change} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); e.currentTarget.blur() } }}
      {...rest}
    />
  )
}
