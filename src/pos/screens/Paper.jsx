import ReceiptPaper from '../../receipt/ReceiptPaper.jsx'

export function Paper({ doc, width }) {
  if (!doc) return null
  return <div className="pos-paper"><ReceiptPaper doc={doc} width={width} /></div>
}
