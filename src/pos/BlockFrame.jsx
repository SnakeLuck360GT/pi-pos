import { blockStyle } from '../lib/theme.js'
import './pos.css'

// Places one block on the grid and applies its common style. `style` wins over
// the grid placement, so the designer can reuse this outside PosGrid. The frame
// is a size container, so it needs a definite size from its parent.
export function BlockFrame({ block, style, className = '', children }) {
  const s = block.style || {}
  const css = {
    gridColumn: `${(block.x || 0) + 1} / span ${block.w || 1}`,
    gridRow: `${(block.y || 0) + 1} / span ${block.h || 1}`,
    ...blockStyle(s),
    // Lets filled buttons honour a custom text colour instead of accent-text.
    ...(s.color ? { '--b-color': s.color } : null),
    ...style,
  }
  return (
    <div className={`pos-frame pos-frame--${block.type} ${className}`.trim()} data-block-id={block.id} style={css}>
      {children}
    </div>
  )
}

export default BlockFrame
