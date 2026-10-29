// Field definitions drive every inspector form in the admin (POS blocks,
// receipt blocks, theme). A field is:
//   { key, label, type, ...opts }
//   type: 'text' | 'textarea' | 'number' | 'select' | 'segmented' | 'toggle' | 'color' | 'image'
//   opts: options [{ value, label }] (select/segmented), min, max, step, placeholder, hint
// `key` may be a dotted path into the edited object ("altLine.style.w").
// Render them with <Fields> from src/ui.

export const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

export const WEIGHT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
]

// Common style for every POS block. Empty = inherit from theme.
export const POS_STYLE_FIELDS = [
  { key: 'fontSize',    label: 'Text size',        type: 'number', min: 8, max: 160, placeholder: 'Theme' },
  { key: 'altFontSize', label: 'Second-language size', type: 'number', min: 8, max: 160, placeholder: 'Auto' },
  { key: 'fontWeight',  label: 'Weight',           type: 'select', options: WEIGHT_OPTIONS },
  { key: 'align',       label: 'Align',            type: 'segmented', options: ALIGN_OPTIONS },
  { key: 'color',       label: 'Text colour',      type: 'color' },
  { key: 'background',  label: 'Background',       type: 'color' },
  { key: 'borderColor', label: 'Border',           type: 'color' },
  { key: 'radius',      label: 'Corner radius',    type: 'number', min: 0, max: 64, placeholder: 'Theme' },
  { key: 'padding',     label: 'Padding',          type: 'number', min: 0, max: 64, placeholder: 'Auto' },
]

// Receipt text style (ESC/POS). Used for every styled line in a receipt block;
// prefix the keys with the line's path, e.g. withPrefix(RECEIPT_STYLE_FIELDS, 'altLine.style').
const MAG = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ value: n, label: `${n}×` }))
export const RECEIPT_STYLE_FIELDS = [
  { key: 'w',         label: 'Width',     type: 'select', options: MAG },
  { key: 'h',         label: 'Height',    type: 'select', options: MAG },
  { key: 'align',     label: 'Align',     type: 'segmented', options: ALIGN_OPTIONS },
  { key: 'bold',      label: 'Bold',      type: 'toggle' },
  { key: 'underline', label: 'Underline', type: 'toggle' },
  { key: 'invert',    label: 'White on black', type: 'toggle' },
]

export const withPrefix = (fields, prefix) => fields.map(f => ({ ...f, key: `${prefix}.${f.key}` }))

// Dotted-path helpers, immutable.
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

export function setPath(obj, path, value) {
  const [k, ...rest] = path.split('.')
  const base = Array.isArray(obj) ? [...obj] : { ...(obj || {}) }
  base[k] = rest.length ? setPath(base[k], rest.join('.'), value) : value
  return base
}
