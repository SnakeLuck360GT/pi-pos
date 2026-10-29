import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeDoc, encodeText, ruleBytes } from './escpos.js'

const hex = buf => Buffer.from(buf).toString('hex')
const doc = (ops, o = {}) => ({ cols: 48, lineSpacing: 24, encoding: 'utf8', ops, ...o })

test('starts with ESC @ and ends with a partial cut', () => {
  const buf = encodeDoc(doc([{ op: 'cut' }]))
  assert.equal(hex(buf.subarray(0, 2)), '1b40')
  assert.equal(hex(buf.subarray(-4)), '1d564200')
  assert.equal(hex(encodeDoc(doc([]), { cut: 'full' }).subarray(-4)), '1d564100')
  assert.equal(hex(encodeDoc(doc([]), { cut: 'none' }).subarray(-3)), '1b6404')
})

test('a 2x2 bold centred line: GS !, ESC 3 scaled by height, ESC E, then text and LF', () => {
  const buf = encodeDoc(doc([{ op: 'text', text: 'Hi', w: 2, h: 2, bold: true, underline: false, invert: true, align: 'center' }]))
  const expected = '1b6101' + '1d2111' + '1b3330' + '1b4501' + '1b2d00' + '1d4201' + hex(Buffer.from('Hi')) + '0a'
  assert.ok(hex(buf).includes(expected), hex(buf))
})

test('rule is a full-width GS v 0 raster with padding rows', () => {
  const [head, data] = ruleBytes(576, 2, 3)
  assert.equal(hex(head), '1d7630004800' + '0800')   // 72 bytes wide, 8 rows
  assert.equal(data.length, 72 * 8)
  assert.equal(data[72 * 3], 0xff)
  assert.equal(data[72 * 3 - 1], 0x00)
  assert.equal(data[72 * 5], 0x00)
})

test('image op sends the raster as given', () => {
  const data = Buffer.from([0xff, 0x00, 0x81, 0x18]).toString('base64')
  const buf = encodeDoc(doc([{ op: 'image', width: 16, height: 2, data, align: 'center' }]))
  assert.ok(hex(buf).includes('1b6101' + '1d7630000200' + '0200' + 'ff008118'))
})

test('qr op uses GS ( k model 2', () => {
  const buf = hex(encodeDoc(doc([{ op: 'qr', data: 'abc', size: 5, align: 'center' }])))
  assert.ok(buf.includes('1d286b0400314132' + '00'))
  assert.ok(buf.includes('1d286b03003143' + '05'))
  assert.ok(buf.includes('1d286b0600315030' + hex(Buffer.from('abc'))))
  assert.ok(buf.includes('1d286b0300315130'))
})

test('gb2312: FS & after init, Chinese as two bytes, £ as fullwidth', () => {
  const buf = encodeDoc(doc([{ op: 'text', text: '春卷 £4.50', w: 1, h: 1 }], { encoding: 'gb2312' }))
  assert.equal(hex(buf.subarray(0, 4)), '1b401c26')
  assert.ok(hex(buf).includes('b4babeed20a1ea342e3530'), hex(buf))   // 春卷 ￡4.50
  assert.equal(hex(encodeText('🛵 Hi', 'utf8')), hex(Buffer.from(' Hi')))
})

test('ENCODING override wins over the doc', () => {
  const buf = encodeDoc(doc([]), { encoding: 'gb2312' })
  assert.equal(hex(buf.subarray(2, 4)), '1c26')
})
