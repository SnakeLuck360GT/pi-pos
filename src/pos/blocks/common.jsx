import { useEffect, useState } from 'react'
import { Names, Placeholder, altText } from './shared.jsx'

export function TitleBlock({ block, ctx }) {
  const { business } = ctx.config
  const name = block.props.text || business.name
  const alt = block.props.text ? '' : altText(ctx, business.nameAlt, block.props.showAlt)
  return (
    <div className="pos-b pos-title">
      <Names name={name} alt={alt} />
    </div>
  )
}

export function TextBlock({ block, ctx }) {
  const text = block.props.text || ''
  if (!text) return <Placeholder ctx={ctx} label="Empty text" />
  return <div className={`pos-b pos-text${block.props.muted ? ' pos-text--muted' : ''}`}><p>{text}</p></div>
}

function useNow(seconds) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Tick on the boundary so the minute flips when the wall clock does.
    const step = seconds ? 1000 : 60000
    let t = setTimeout(function tick() {
      setNow(new Date())
      t = setTimeout(tick, step - (Date.now() % step))
    }, step - (Date.now() % step))
    return () => clearTimeout(t)
  }, [seconds])
  return now
}

export function ClockBlock({ block, ctx }) {
  const { seconds, showDate } = block.props
  const now = useNow(seconds)
  const locale = ctx.config.business.locale || 'en-GB'
  const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : null) })
  const date = now.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="pos-b pos-clock">
      <span className="pos-clock__time pos-num">{time}</span>
      {showDate ? <span className="pos-clock__date">{date}</span> : null}
    </div>
  )
}

export function ImageBlock({ block, ctx }) {
  const { src, fit } = block.props
  if (!src) return <Placeholder ctx={ctx} label="No image" />
  return (
    <div className="pos-b pos-image">
      <img src={src} alt="" draggable="false" style={{ objectFit: fit === 'cover' ? 'cover' : 'contain' }} />
    </div>
  )
}

export function SpacerBlock() {
  return <div className="pos-b pos-spacer" />
}
