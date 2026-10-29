// One draft config plus undo/redo history. Pages change the draft with
// update(draft => next); nothing reaches the server until save.
import { useCallback, useMemo, useReducer } from 'react'

const LIMIT = 100
// Changes closer together than this share one undo step, so typing a word
// or dragging a block undoes in one go rather than per keystroke or pixel.
const MERGE_MS = 500

const EMPTY = { saved: null, draft: null, past: [], future: [], lastAt: 0 }

function withTopic(draft, saved) {
  const topic = saved?.printer?.ntfyTopic
  if (!topic || draft?.printer?.ntfyTopic) return draft
  return { ...draft, printer: { ...draft.printer, ntfyTopic: topic } }
}

export function reducer(s, a) {
  switch (a.type) {
    case 'load':
      return { ...EMPTY, saved: a.saved, draft: a.draft ?? a.saved }

    case 'update': {
      const next = typeof a.fn === 'function' ? a.fn(s.draft) : a.fn
      if (next == null || next === s.draft) return s
      const merge = s.past.length > 0 && a.at - s.lastAt < MERGE_MS
      return {
        ...s,
        draft: next,
        past: merge ? s.past : [...s.past, s.draft].slice(-LIMIT),
        future: [],
        lastAt: a.at,
      }
    }

    case 'undo':
      if (!s.past.length) return s
      return { ...s, draft: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.draft, ...s.future].slice(0, LIMIT), lastAt: 0 }

    case 'redo':
      if (!s.future.length) return s
      return { ...s, draft: s.future[0], future: s.future.slice(1), past: [...s.past, s.draft].slice(-LIMIT), lastAt: 0 }

    // Discard is undoable, in case it was a misclick.
    case 'discard':
      if (s.draft === s.saved) return s
      return { ...s, draft: s.saved, past: [...s.past, s.draft].slice(-LIMIT), future: [], lastAt: 0 }

    // `sent` is the draft that was saved. If nothing changed meanwhile, adopt
    // the server's copy (it may carry a new ntfy topic); otherwise keep the
    // newer edits and only take the topic.
    case 'saved':
      return { ...s, saved: a.saved, draft: s.draft === a.sent ? a.saved : withTopic(s.draft, a.saved), lastAt: 0 }

    default:
      return s
  }
}

export function useDraft() {
  const [s, dispatch] = useReducer(reducer, EMPTY)

  const update = useCallback(fn => dispatch({ type: 'update', fn, at: performance.now() }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const discard = useCallback(() => dispatch({ type: 'discard' }), [])
  const load = useCallback((saved, draft) => dispatch({ type: 'load', saved, draft }), [])
  const markSaved = useCallback((saved, sent) => dispatch({ type: 'saved', saved, sent }), [])

  // Reference check first; the JSON compare catches edits that were typed
  // and then typed back.
  const dirty = useMemo(
    () => !!s.draft && s.draft !== s.saved && JSON.stringify(s.draft) !== JSON.stringify(s.saved),
    [s.draft, s.saved],
  )

  return {
    draft: s.draft, saved: s.saved, dirty,
    canUndo: s.past.length > 0, canRedo: s.future.length > 0,
    update, undo, redo, discard, load, markSaved,
  }
}
