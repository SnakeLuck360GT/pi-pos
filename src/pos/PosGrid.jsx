import { BlockFrame } from './BlockFrame.jsx'
import { BLOCKS } from './blocks/index.js'
import { Placeholder } from './blocks/shared.jsx'

// Renders one block's content with its registry defaults filled in, so a
// layout saved before a new prop existed still gets a sensible value.
export function BlockContent({ block, ctx }) {
  const def = BLOCKS[block.type]
  if (!def) return <Placeholder ctx={ctx} label={`Unknown block "${block.type}"`} />
  const C = def.Component
  return <C block={{ ...block, props: { ...def.props, ...block.props } }} ctx={ctx} />
}

export function PosGrid({ layout, ctx, className = '' }) {
  const cols = layout?.cols || 12
  const rows = layout?.rows || 8
  const style = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  }
  return (
    <div className={`pos-grid ${className}`.trim()} style={style}>
      {(layout?.blocks || []).map(b => (
        <BlockFrame key={b.id} block={b}>
          <BlockContent block={b} ctx={ctx} />
        </BlockFrame>
      ))}
    </div>
  )
}

export default PosGrid
