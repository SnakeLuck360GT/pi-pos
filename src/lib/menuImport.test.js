import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMenuLines, parseMenuText, linesFromItems, toConfigPatch, splitAlt, tidyCase, slugify, countMenu, checkFile } from './menuImport.js'
import { DEFAULT_CONFIG } from '../../shared/defaults.js'

const cat = (menu, name) => menu.categories.find(c => c.name === name)
const item = (menu, name) => menu.categories.flatMap(c => c.items).find(i => i.name === name)

// Shaped like the Fortune House takeaway menu: bilingual names, numbered
// items, dot leaders, a banquet with a description, pick-one rows.
const FORTUNE = `FORTUNE HOUSE 福运楼
Tel: 0161 969 3838
12 Market Street, Manchester M1 1AA
Open Tuesday - Sunday 5pm - 11pm

SOUPS 汤类
1. Chicken Sweetcorn Soup 鸡粟汤 .......... £4.00
2. Wonton Soup 云吞汤 .......... £5.00
3. Peking Hot & Sour Soup 京汤 ……… £4.00

APPETISERS 前菜
4. 虾片 Prawn Crackers 2.00
5. Crispy Spring Rolls (4) 春卷 (4件) 5.00
6. OK鸡翅 OK Sauce Crispy Chicken Wings 7.70
A7 SALT & PEPPER SQUID 椒盐鱿鱼 8.70
Aromatic Crispy Duck 12.00
香酥鸭
Served with pancakes, cucumber and hoi sin sauce

HOUSE BANQUETS 富贵宴席
Banquet A A餐 £21.50pp
Set banquet (min 2), soups, appetisers & a main course each.

CHEF'S SPECIALS MAINS 厨师精选
Black Bean Sauce 豉汁: Chicken 8.50 / Beef 9.00 / King Prawn 10.00
Chow Mein 炒面
Chicken 7.50 / Beef 8.00 / Vegetable 7.00

Page 2
www.fortunehouse.co.uk
Minimum order £15.00 for delivery`

test('parses an English + Chinese takeaway menu', () => {
  const m = parseMenuText(FORTUNE)
  assert.deepEqual(m.categories.map(c => [c.name, c.nameAlt]), [
    ['Soups', '汤类'],
    ['Appetisers', '前菜'],
    ['House Banquets', '富贵宴席'],
    ["Chef's Specials Mains", '厨师精选'],
  ])
  assert.deepEqual(cat(m, 'Soups').items.map(i => [i.name, i.nameAlt, i.price]), [
    ['Chicken Sweetcorn Soup', '鸡粟汤', 4],
    ['Wonton Soup', '云吞汤', 5],
    ['Peking Hot & Sour Soup', '京汤', 4],
  ])
  assert.deepEqual(cat(m, 'Appetisers').items.map(i => [i.name, i.nameAlt, i.price]), [
    ['Prawn Crackers', '虾片', 2],
    ['Crispy Spring Rolls (4)', '春卷 (4件)', 5],
    ['OK Sauce Crispy Chicken Wings', 'OK鸡翅', 7.7],
    ['Salt & Pepper Squid', '椒盐鱿鱼', 8.7],
    ['Aromatic Crispy Duck', '香酥鸭', 12],
  ])
  assert.equal(item(m, 'Aromatic Crispy Duck').description, 'Served with pancakes, cucumber and hoi sin sauce')
  assert.equal(item(m, 'Banquet A').price, 21.5)
  assert.equal(item(m, 'Banquet A').nameAlt, 'A餐')
  assert.match(item(m, 'Banquet A').description, /^Set banquet \(min 2\)/)
  assert.equal(m.currency, '£')
  assert.deepEqual(m.business, { phone: '0161 969 3838', address: '12 Market Street, Manchester M1 1AA', name: 'Fortune House', nameAlt: '福运楼' })
  assert.deepEqual(countMenu(m), { items: 11, categories: 4 })
})

test('pick-one rows become choices priced from the cheapest', () => {
  const m = parseMenuText(FORTUNE)
  const bb = item(m, 'Black Bean Sauce')
  assert.equal(bb.nameAlt, '豉汁')
  assert.equal(bb.price, 8.5)
  assert.deepEqual(bb.choices.map(c => [c.name, c.price]), [['Chicken', 0], ['Beef', 0.5], ['King Prawn', 1.5]])
  // Name on the line above, options below.
  const cm = item(m, 'Chow Mein')
  assert.equal(cm.nameAlt, '炒面')
  assert.equal(cm.price, 7)
  assert.deepEqual(cm.choices.map(c => [c.name, c.price]), [['Chicken', 0.5], ['Beef', 1], ['Vegetable', 0]])
})

test('several prices take their names from a header row or a list', () => {
  const m = parseMenuText(`Fried Rice
Small    Large
Egg Fried Rice 蛋炒饭 3.00 4.50
Special Fried Rice 5.00 7.00
Curry Sauce (Small/Large) 2.00 3.50
Chicken / Beef / Prawn 7.50 / 8.00 / 9.00
Chips 2.00 3.00 4.00`)
  assert.deepEqual(m.categories.map(c => c.name), ['Fried Rice'])
  assert.deepEqual(item(m, 'Egg Fried Rice').choices.map(c => [c.name, c.price]), [['Small', 0], ['Large', 1.5]])
  assert.deepEqual(item(m, 'Special Fried Rice').choices.map(c => [c.name, c.price]), [['Small', 0], ['Large', 2]])
  assert.deepEqual(item(m, 'Curry Sauce').choices.map(c => [c.name, c.price]), [['Small', 0], ['Large', 1.5]])
  assert.deepEqual(item(m, 'Chicken / Beef / Prawn').choices.map(c => c.name), ['Chicken', 'Beef', 'Prawn'])
  assert.deepEqual(item(m, 'Chips').choices.map(c => c.name), ['Option 1', 'Option 2', 'Option 3'])
})

test('price formats and positions', () => {
  const m = parseMenuText(`Starters
4.50  Spring Rolls
Seaweed £4
Prawn Toast ..... 5,50
Wings - - - - £6.50 (v)
Frites 3,50 €
Spare Ribs £8.90 each
Opening 5.30pm till late`)
  assert.deepEqual(cat(m, 'Starters').items.map(i => [i.name, i.price]), [
    ['Spring Rolls', 4.5], ['Seaweed', 4], ['Prawn Toast', 5.5], ['Wings', 6.5], ['Frites', 3.5], ['Spare Ribs', 8.9],
  ])
})

test('item numbers are stripped, bare numbers only when the menu numbers everything', () => {
  const numbered = parseMenuText('1 Chicken Soup 4.00\n2 Wonton Soup 5.00\n3 Hot & Sour Soup 4.50\n12b Duck Soup 6.00')
  assert.deepEqual(numbered.categories[0].items.map(i => i.name), ['Chicken Soup', 'Wonton Soup', 'Hot & Sour Soup', 'Duck Soup'])
  const plain = parseMenuText('Pizza\n4 Seasons Pizza 9.00\nMargherita 7.00\nHawaiian 8.00')
  assert.deepEqual(plain.categories[0].items.map(i => i.name), ['4 Seasons Pizza', 'Margherita', 'Hawaiian'])
  const codes = parseMenuText('#12 Spring Rolls 4.00\nNo. 13 Seaweed 3.00\nSP1 Ribs 8.00\n14) Wings 6.00')
  assert.deepEqual(codes.categories[0].items.map(i => i.name), ['Spring Rolls', 'Seaweed', 'Ribs', 'Wings'])
})

test('name and price on separate lines, as copied out of some PDFs', () => {
  const m = parseMenuText('STARTERS\nSpring Rolls\n春卷\n4.50\nSeaweed\n£4.00\nDRINKS\nCoke\n1.50')
  assert.deepEqual(m.categories.map(c => [c.name, c.items.map(i => [i.name, i.nameAlt, i.price])]), [
    ['Starters', [['Spring Rolls', '春卷', 4.5], ['Seaweed', '', 4]]],
    ['Drinks', [['Coke', '', 1.5]]],
  ])
})

test('Chinese-only headings and alt names above items', () => {
  const m = parseMenuText('小食\n春卷 Spring Rolls 4.50\n炒饭\n蛋炒饭\nEgg Fried Rice 3.50')
  assert.deepEqual(m.categories.map(c => c.name), ['小食', '炒饭'])
  assert.equal(item(m, 'Egg Fried Rice').nameAlt, '蛋炒饭')
  const zh = parseMenuText('汤类\n鸡粟汤 4.00')
  assert.deepEqual([zh.categories[0].name, zh.categories[0].items[0].name, zh.categories[0].items[0].nameAlt], ['汤类', '鸡粟汤', ''])
})

test('items before any heading land in "Menu", repeated headings merge', () => {
  const m = parseMenuText('Chips 2.00\n\nMAINS\nCurry 8.00\n\nMAINS (cont.)\nStew 9.00')
  assert.deepEqual(m.categories.map(c => [c.name, c.items.length]), [['Menu', 1], ['Mains', 2]])
})

test('page furniture is skipped', () => {
  const m = parseMenuText(`Mains
Curry 8.00
Please tell us about any allergies before ordering.
Free delivery on orders over £20.00
3
www.example.com
Stew 9.00`)
  assert.deepEqual(m.categories[0].items.map(i => i.name), ['Curry', 'Stew'])
})

test('a body-size line between items from a PDF is a wrapped name', () => {
  const m = parseMenuLines([
    { text: 'SOUPS', size: 14 },
    { text: 'Wonton Soup 5.00', size: 10 },
    { text: 'Shredded Duckling & Chinese', size: 10 },
    { text: 'Mushroom Soup 5.00', size: 10 },
    { text: 'Rainbow Seafood Soup 5.00', size: 10 },
  ])
  assert.deepEqual(m.categories[0].items.map(i => i.name), ['Wonton Soup', 'Shredded Duckling & Chinese Mushroom Soup', 'Rainbow Seafood Soup'])
})

test('splitAlt and tidyCase', () => {
  assert.deepEqual(splitAlt('春卷Spring Rolls'), { name: 'Spring Rolls', nameAlt: '春卷' })
  assert.deepEqual(splitAlt('Spring Rolls - 春卷'), { name: 'Spring Rolls', nameAlt: '春卷' })
  assert.deepEqual(splitAlt('Garlic / Black Bean Steamed Mussels 蒜蓉/豆豉蒸青口'), { name: 'Garlic / Black Bean Steamed Mussels', nameAlt: '蒜蓉/豆豉蒸青口' })
  assert.equal(tidyCase('KING PRAWN IN BATTER WITH SPRING ONION'), 'King Prawn in Batter with Spring Onion')
  assert.equal(tidyCase('XO SEAFOOD FRIED RICE'), 'XO Seafood Fried Rice')
  assert.equal(tidyCase('BBQ RIBS'), 'BBQ Ribs')
  assert.equal(tidyCase('Mixed Case Stays'), 'Mixed Case Stays')
})

// Synthetic pdf.js items: two columns, a full-width title, and in each
// column a Chinese name, an English name and a right-aligned price.
function row(y, cells, h = 10) {
  return cells.map(([x, str]) => ({ str, x, y, w: str.length * h * 0.5, h }))
}

test('linesFromItems reads two columns in order and keeps name columns together', () => {
  const items = [
    ...row(800, [[220, 'FORTUNE HOUSE']], 18),
    ...row(770, [[40, 'STARTERS 小食'], [320, 'MAINS 主菜']], 13),
    ...row(750, [[40, '春卷'], [90, 'Spring Rolls'], [240, '4.50'], [320, '咕噜鸡'], [380, 'Sweet & Sour Chicken'], [530, '8.50']]),
    ...row(736, [[40, '紫菜'], [90, 'Crispy Seaweed'], [240, '4.00'], [320, '宫保鸡'], [380, 'Kung Po Chicken'], [530, '8.50']]),
    ...row(722, [[40, '虾片'], [90, 'Prawn Crackers'], [240, '2.50'], [320, '蚝油牛'], [380, 'Beef in Oyster Sauce'], [530, '9.00']]),
  ]
  const lines = linesFromItems(items).map(l => l.text.replace(/\s+/g, ' '))
  assert.deepEqual(lines.filter(Boolean), [
    'FORTUNE HOUSE',
    'STARTERS 小食', '春卷 Spring Rolls 4.50', '紫菜 Crispy Seaweed 4.00', '虾片 Prawn Crackers 2.50',
    'MAINS 主菜', '咕噜鸡 Sweet & Sour Chicken 8.50', '宫保鸡 Kung Po Chicken 8.50', '蚝油牛 Beef in Oyster Sauce 9.00',
  ])
  const m = parseMenuLines(linesFromItems(items))
  assert.deepEqual(m.categories.map(c => [c.name, c.items.length]), [['Starters', 3], ['Mains', 3]])
  assert.equal(m.business.name, 'Fortune House')
  assert.deepEqual([item(m, 'Kung Po Chicken').nameAlt, item(m, 'Kung Po Chicken').price], ['宫保鸡', 8.5])
})

test('linesFromItems: prices before names and a gap before a heading', () => {
  const items = [
    ...row(800, [[40, 'DRINKS']], 14),
    ...row(780, [[40, '1.50'], [100, 'Coke']]),
    ...row(766, [[40, '1.00'], [100, 'Water']]),
    ...row(720, [[40, 'DESSERTS']], 14),
    ...row(700, [[40, '3.50'], [100, 'Ice Cream']]),
  ]
  const m = parseMenuLines(linesFromItems(items))
  assert.deepEqual(m.categories.map(c => [c.name, c.items.map(i => [i.name, i.price])]), [
    ['Drinks', [['Coke', 1.5], ['Water', 1]]],
    ['Desserts', [['Ice Cream', 3.5]]],
  ])
})

test('checkFile accepts PDFs only, up to 30 MB', () => {
  assert.equal(checkFile({ name: 'menu.pdf', type: 'application/pdf', size: 1000 }), '')
  assert.match(checkFile({ name: 'menu.jpg', type: 'image/jpeg', size: 1000 }), /paste the menu text/)
  assert.match(checkFile({ name: 'menu.pdf', type: 'application/pdf', size: 31 * 1024 * 1024 }), /30 MB/)
})

/* ── toConfigPatch ────────────────────────────────────────────────────── */

const IMPORTED = {
  categories: [
    { name: 'Starters', nameAlt: '小食', items: [
      { name: 'Spring Rolls', nameAlt: '春卷', price: 4.5, description: '', choices: [] },
      { name: 'Prawn Toast', nameAlt: '虾多士', price: 5.5, description: '', choices: [] },
      { name: 'Ribs', nameAlt: '', price: 8.9, description: '', choices: [], include: false },
    ] },
    { name: 'Chow Mein', nameAlt: '炒面', items: [
      { name: 'Chow Mein', nameAlt: '', price: 7, description: '', choices: [
        { name: 'Chicken', nameAlt: '鸡', price: 0.5 }, { name: 'Chicken', nameAlt: '', price: 0.5 }, { name: 'Vegetable', nameAlt: '', price: 0 },
      ] },
    ] },
    { name: 'House Banquets', nameAlt: '', include: false, items: [
      { name: 'Banquet A', nameAlt: '', price: 21.5, description: 'For two', choices: [] },
    ] },
    { name: '', nameAlt: '套餐', items: [
      { name: 'Set Meal 1', nameAlt: '', price: 24, description: '2-course meal', choices: [] },
    ] },
  ],
}

test('toConfigPatch replace builds the full schema with readable ids', () => {
  const { categories, items } = toConfigPatch(IMPORTED, DEFAULT_CONFIG, { mode: 'replace' })
  assert.deepEqual(categories.map(c => c.name), ['Starters', 'Chow Mein', '套餐'])
  // "starters" is taken by the old menu, so it gets a fresh id.
  assert.notEqual(categories[0].id, 'starters')
  assert.match(categories[0].id, /^starters-/)
  assert.equal(categories[1].id, 'chow-mein')
  assert.equal(categories[2].nameAlt, '')
  assert.deepEqual(items.map(i => i.name), ['Spring Rolls', 'Prawn Toast', 'Chow Mein', 'Set Meal 1'])
  const toast = items[1]
  assert.deepEqual(toast, { id: 'prawn-toast', categoryId: categories[0].id, name: 'Prawn Toast', nameAlt: '虾多士', price: 5.5, color: '', choices: [], modifierIds: null })
  assert.notEqual(items[0].id, 'spring-rolls')
  const cm = items[2]
  assert.deepEqual(cm.choices.map(c => [c.name, c.price]), [['Chicken', 0.5], ['Chicken', 0.5], ['Vegetable', 0]])
  assert.equal(new Set(cm.choices.map(c => c.id)).size, 3)
  assert.equal(cm.choices[0].id, 'chicken')
  assert.equal(items[3].description, '2-course meal')
  assert.equal(new Set(items.map(i => i.id)).size, items.length)
})

test('toConfigPatch append merges by category name and skips duplicates', () => {
  const config = {
    categories: [{ id: 'starters', name: 'STARTERS', nameAlt: '' }],
    items: [
      { id: 'spring-rolls', categoryId: 'starters', name: 'spring rolls', nameAlt: '', price: 4, color: '', choices: [], modifierIds: null },
      { id: 'egg-rice', categoryId: 'rice', name: 'Egg Fried Rice', nameAlt: '', price: 3.5, color: '', choices: [], modifierIds: null },
    ],
  }
  const imported = {
    categories: [
      { name: 'Starters', nameAlt: '', items: [
        { name: 'Spring Rolls', price: 4.5, choices: [] },
        { name: 'Seaweed', price: 4, choices: [] },
        { name: 'Seaweed', price: 4, choices: [] },
      ] },
      { name: 'Specials', nameAlt: '', items: [{ name: 'Egg Fried Rice', price: 3.5, choices: [] }, { name: 'Duck', price: 12, choices: [] }] },
    ],
  }
  const { categories, items } = toConfigPatch(imported, config, { mode: 'append' })
  assert.deepEqual(categories.map(c => c.id), ['starters', 'specials'])
  assert.equal(categories[0], config.categories[0])
  assert.deepEqual(items.map(i => [i.categoryId, i.name]), [
    ['starters', 'spring rolls'], ['rice', 'Egg Fried Rice'], ['starters', 'Seaweed'], ['specials', 'Duck'],
  ])
  assert.equal(items[0], config.items[0])
})

test('toConfigPatch takes an include function', () => {
  const { items } = toConfigPatch(IMPORTED, { categories: [], items: [] }, { mode: 'replace', include: it => it.price < 6 })
  assert.deepEqual(items.map(i => i.name), ['Spring Rolls', 'Prawn Toast'])
})

test('slugify', () => {
  assert.equal(slugify('Salt & Pepper Wings'), 'salt-and-pepper-wings')
  assert.equal(slugify('Sautéed Fillet Steak'), 'sauteed-fillet-steak')
  assert.equal(slugify('春卷'), '')
})
