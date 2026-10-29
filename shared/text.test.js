import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colWidth, wrap, padRight, padLeft, center, twoCol, truncate, stripEmoji, printable } from './text.js'

test('colWidth counts CJK, kana, Hangul and fullwidth as 2', () => {
  assert.equal(colWidth('abc'), 3)
  assert.equal(colWidth('春卷'), 4)
  assert.equal(colWidth('2× 春卷'), 7)
  assert.equal(colWidth('カナ한글'), 8)
  assert.equal(colWidth('￡１'), 4)
  assert.equal(colWidth(''), 0)
  assert.equal(colWidth(null), 0)
})

test('colWidth with ambiguousWide counts GB2312 two-byte symbols', () => {
  assert.equal(colWidth('2×', { ambiguousWide: true }), 3)
  assert.equal(colWidth('£5', { ambiguousWide: true }), 3)
  assert.equal(colWidth('2×'), 2)
})

test('stripEmoji drops emoji but keeps text and printable symbols', () => {
  assert.equal(stripEmoji('🛵 外送 Delivery 👍🏽'), ' 外送 Delivery ')
  assert.equal(stripEmoji('© Shop ★'), '© Shop ★')
  assert.equal(printable('½ – done', 'utf8'), '1/2 - done')
  assert.equal(printable('£3', 'gb2312'), '￡3')
})

test('wrap breaks English at spaces', () => {
  assert.deepEqual(wrap('the quick brown fox jumps', 10), ['the quick', 'brown fox', 'jumps'])
  assert.deepEqual(wrap('a\nb', 10), ['a', 'b'])
})

test('wrap breaks CJK anywhere, counting 2 columns each', () => {
  assert.deepEqual(wrap('椒盐鸡翼椒盐鸡翼', 6), ['椒盐鸡', '翼椒盐', '鸡翼'])
  // Mixed: the English word moves down whole, the Chinese fills the line.
  assert.deepEqual(wrap('1× 豉汁牛 (不加辣, 多加酱)', 12), ['1× 豉汁牛 (', '不加辣, 多加', '酱)'])
  for (const l of wrap('1× 豉汁牛 (不加辣, 多加酱) and some English', 11)) assert.ok(colWidth(l) <= 11, l)
})

test('wrap breaks a word longer than the line', () => {
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
})

test('wrap keeps first-line indentation, not continuation spaces', () => {
  assert.deepEqual(wrap('  one two three', 9), ['  one two', 'three'])
})

test('padding and two-column rows use display width', () => {
  assert.equal(padRight('春', 4), '春  ')
  assert.equal(padLeft('a', 3), '  a')
  assert.equal(center('ab', 6), '  ab  ')
  assert.equal(center('abc', 6), ' abc  ')
  assert.equal(twoCol('TOTAL', '£9.00', 16), 'TOTAL      £9.00')
  assert.equal(colWidth(twoCol('总计', '£9.00', 16)), 16)
  assert.equal(twoCol('A very long label here', '£9.00', 14), 'A very…  £9.00')
})

test('truncate adds an ellipsis only when cutting', () => {
  assert.equal(truncate('short', 10), 'short')
  assert.equal(truncate('Spring Rolls, Coke', 10), 'Spring Ro…')
  assert.equal(colWidth(truncate('春卷春卷春卷', 7)), 7)
})
