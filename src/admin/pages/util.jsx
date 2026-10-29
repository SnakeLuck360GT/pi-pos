// Small pieces shared by the admin pages.
import { useEffect, useState } from 'react'
import { Button, Modal } from '../../ui/index.jsx'

export function Confirm({ title, children, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) {
  return (
    <Modal
      title={title} onClose={onClose} width={400}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button>
      </>}
    >
      <div className="pg-confirm">{children}</div>
    </Modal>
  )
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context; fall back for plain http on a LAN.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'secondary', disabled }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1500)
    return () => clearTimeout(t)
  }, [done])
  return (
    <Button size={size} variant={variant} icon={done ? 'check' : 'copy'} disabled={disabled}
      onClick={async () => setDone(await copyText(text))}>
      {done ? 'Copied' : label}
    </Button>
  )
}

// Monospace box with a copy button, for commands and env files.
export function CodeBox({ text, multiline }) {
  return (
    <div className={`pg-code${multiline ? ' is-multi' : ''}`}>
      <pre className="pg-code__text">{text}</pre>
      <div className="pg-code__copy"><CopyButton text={text} /></div>
    </div>
  )
}

export const nameOf = (x, fallback = 'Untitled') => (x?.name || x?.label || '').trim() || fallback

export function timeAgo(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const startOfDay = (ms = Date.now()) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
