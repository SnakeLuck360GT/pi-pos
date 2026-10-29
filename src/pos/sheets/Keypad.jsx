import { Icon } from '../../ui/icons.jsx'

// On-screen number pad. A real keypad beats the system keyboard here: it is
// always the same size and position, and it can't type letters.
export function Keypad({ value, onChange, decimals = true, maxLength = 8 }) {
  const press = k => {
    if (k === 'back') return onChange(value.slice(0, -1))
    if (k === 'clear') return onChange('')
    if (value.length >= maxLength) return
    if (k === '.') {
      if (!decimals || value.includes('.')) return
      return onChange(value ? `${value}.` : '0.')
    }
    // Two decimal places at most; no leading zeros.
    if (decimals && /\.\d{2}$/.test(value)) return
    onChange(value === '0' ? k : value + k)
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimals ? '.' : 'clear', '0', 'back']
  return (
    <div className="pos-keypad">
      {keys.map(k => (
        <button key={k} type="button" className="pos-key" onClick={() => press(k)} aria-label={k === 'back' ? 'Delete' : k === 'clear' ? 'Clear' : k}>
          {k === 'back' ? <Icon name="backspace" size={22} /> : k === 'clear' ? <span className="pos-key__word">Clear</span> : k}
        </button>
      ))}
    </div>
  )
}
