import { useEffect } from 'react'
import { Icon } from '../../ui/icons.jsx'

// Centred dialog over the POS. `position: 'top'` keeps forms clear of the
// on-screen keyboard on tablets.
export function Sheet({ title, subtitle, onClose, children, footer, size = 'md', position = 'center', className = '' }) {
  useEffect(() => {
    if (!onClose) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`pos-scrim pos-scrim--${position}`}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className={`pos-sheet pos-sheet--${size} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {title || onClose ? (
          <header className="pos-sheet__head">
            <div className="pos-sheet__titles">
              {title ? <h2 className="pos-sheet__title">{title}</h2> : null}
              {subtitle ? <p className="pos-sheet__sub">{subtitle}</p> : null}
            </div>
            {onClose ? (
              <button type="button" className="pos-icon-btn" aria-label="Close" onClick={onClose}>
                <Icon name="x" size={20} />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className="pos-sheet__body pos-scroll">{children}</div>
        {footer ? <footer className="pos-sheet__foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

export function ConfirmSheet({ title, body, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel, extra }) {
  return (
    <Sheet
      title={title} size="sm" onClose={onCancel}
      footer={(
        <>
          <button type="button" className="pos-sbtn" onClick={onCancel}>{cancelLabel}</button>
          {extra}
          <button type="button" className={`pos-sbtn ${danger ? 'pos-sbtn--danger' : 'pos-sbtn--primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </>
      )}
    >
      {body ? <p className="pos-sheet__text">{body}</p> : null}
    </Sheet>
  )
}
