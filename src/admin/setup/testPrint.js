// Queues a sample receipt as a 'test' job, rendered from the config passed in
// (the draft, so unsaved receipt changes can be tried on paper).
import { renderReceipt, sampleOrder } from '../../../shared/receipt.js'
import { orderTotals } from '../../../shared/order.js'
import { createJob, getJob, wakePrinter } from '../../lib/api.js'

// `wake` = { printer: { ntfyUrl, ntfyTopic } } with the saved topic, which is
// the one the Pi listens on.
export async function sendTestPrint(config, wake) {
  const now = Date.now()
  const order = sampleOrder(config, undefined, { now })
  const doc = renderReceipt(config, order, { now })
  const { id } = await createJob({ type: 'test', order, total: orderTotals(order).total, copies: 1, doc })
  wakePrinter(wake || config, id)
  return id
}

// Polls a job until it prints or fails, up to `timeout` ms.
export async function waitForJob(id, { timeout = 45000, every = 2000, onUpdate } = {}) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, every))
    const job = await getJob(id)
    onUpdate?.(job)
    if (job.status !== 'pending') return job
  }
  return null
}
