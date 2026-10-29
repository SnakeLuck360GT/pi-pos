// The whole shop lives in one config document, stored in Netlify Blobs and
// edited from /admin. This file is the schema: every key the app reads has a
// default here, and `withDefaults` fills in anything an older saved config is
// missing. Plain ESM with no imports, so the browser, the Netlify functions
// and the Pi bridge can all use it.

export const CONFIG_VERSION = 1

// Receipt text style. w/h are ESC/POS character magnification (1-8).
const S = (o = {}) => ({ w: 1, h: 1, bold: false, underline: false, invert: false, align: 'left', ...o })

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,

  business: {
    name: 'My Shop',
    nameAlt: '',            // optional second-language name
    phone: '',
    address: '',
    currency: '£',
    locale: 'en-GB',
  },

  features: {
    orderModes: true,       // takeaway / delivery etc. Off = a single plain order flow
    modifiers: true,        // add / remove options on order lines
    altNames: true,         // second-language names on screen and on paper
    queue: true,            // print queue screen on the POS
    summary: true,          // end-of-day summary
  },

  // Order types. `fields` are asked for before the order starts.
  // `eta` is minutes from order time: [20] -> "18:40", [40, 60] -> "19:00-19:20".
  modes: [
    { id: 'takeaway', label: 'Takeaway', labelAlt: '自取', short: 'T/A', eta: [20],     fields: ['name', 'phone'],            fee: 0, copies: 3, enabled: true },
    { id: 'delivery', label: 'Delivery', labelAlt: '外送', short: 'DEL', eta: [40, 60], fields: ['name', 'phone', 'address'], fee: 0, copies: 1, enabled: true },
  ],

  categories: [
    { id: 'starters', name: 'Starters',       nameAlt: '小食' },
    { id: 'mains',    name: 'Mains',          nameAlt: '主菜' },
    { id: 'rice',     name: 'Rice & Noodles', nameAlt: '饭面' },
    { id: 'drinks',   name: 'Drinks',         nameAlt: '饮料' },
  ],

  // `choices`: pick exactly one before the item is added; choice.price is
  // added to the item price. `modifierIds`: null = every modifier applies,
  // [] = none, [ids] = only those.
  items: [
    { id: 'spring-rolls', categoryId: 'starters', name: 'Spring Rolls',             nameAlt: '春卷',     price: 4.5, color: '', choices: [], modifierIds: null },
    { id: 'sp-wings',     categoryId: 'starters', name: 'Salt & Pepper Wings',      nameAlt: '椒盐鸡翼', price: 6.5, color: '', choices: [], modifierIds: null },
    { id: 'seaweed',      categoryId: 'starters', name: 'Crispy Seaweed',           nameAlt: '脆紫菜',   price: 4,   color: '', choices: [], modifierIds: null },
    { id: 'crackers',     categoryId: 'starters', name: 'Prawn Crackers',           nameAlt: '虾片',     price: 2.5, color: '', choices: [], modifierIds: [] },
    { id: 'sweet-sour',   categoryId: 'mains',    name: 'Sweet & Sour Chicken',     nameAlt: '咕噜鸡',   price: 8.5, color: '', choices: [], modifierIds: null },
    { id: 'black-bean',   categoryId: 'mains',    name: 'Black Bean Sauce',         nameAlt: '豉汁',     price: 8.5, color: '',
      choices: [
        { id: 'chicken', name: 'Chicken',    nameAlt: '鸡', price: 0 },
        { id: 'beef',    name: 'Beef',       nameAlt: '牛', price: 0.5 },
        { id: 'prawn',   name: 'King Prawn', nameAlt: '虾', price: 1.5 },
      ], modifierIds: null },
    { id: 'kung-po',      categoryId: 'mains',    name: 'Kung Po Chicken',          nameAlt: '宫保鸡',   price: 8.5, color: '', choices: [], modifierIds: null },
    { id: 'oyster-beef',  categoryId: 'mains',    name: 'Beef in Oyster Sauce',     nameAlt: '蚝油牛',   price: 9,   color: '', choices: [], modifierIds: null },
    { id: 'egg-rice',     categoryId: 'rice',     name: 'Egg Fried Rice',           nameAlt: '蛋炒饭',   price: 3.5, color: '', choices: [], modifierIds: null },
    { id: 'boiled-rice',  categoryId: 'rice',     name: 'Boiled Rice',              nameAlt: '白饭',     price: 3,   color: '', choices: [], modifierIds: [] },
    { id: 'chow-mein',    categoryId: 'rice',     name: 'Chow Mein',                nameAlt: '炒面',     price: 7.5, color: '',
      choices: [
        { id: 'chicken', name: 'Chicken',    nameAlt: '鸡',   price: 0 },
        { id: 'beef',    name: 'Beef',       nameAlt: '牛',   price: 0.5 },
        { id: 'veg',     name: 'Vegetable',  nameAlt: '菜',   price: -0.5 },
      ], modifierIds: null },
    { id: 'chips',        categoryId: 'rice',     name: 'Chips',                    nameAlt: '薯条',     price: 3,   color: '', choices: [], modifierIds: [] },
    { id: 'coke',         categoryId: 'drinks',   name: 'Coke',                     nameAlt: '可乐',     price: 1.5, color: '', choices: [], modifierIds: [] },
    { id: 'water',        categoryId: 'drinks',   name: 'Water',                    nameAlt: '水',       price: 1,   color: '', choices: [], modifierIds: [] },
  ],

  // Add / remove options for order lines. `itemIds`: null = offered on every
  // item (subject to item.modifierIds), [ids] = only on those items.
  modifiers: [
    { id: 'no-chilli',   name: 'No Chilli',   nameAlt: '不加辣',   kind: 'remove', price: 0,   itemIds: null },
    { id: 'no-onion',    name: 'No Onion',    nameAlt: '不加洋葱', kind: 'remove', price: 0,   itemIds: null },
    { id: 'no-msg',      name: 'No MSG',      nameAlt: '不加味精', kind: 'remove', price: 0,   itemIds: null },
    { id: 'extra-spicy', name: 'Extra Spicy', nameAlt: '加辣',     kind: 'add',    price: 0,   itemIds: null },
    { id: 'extra-sauce', name: 'Extra Sauce', nameAlt: '多加酱',   kind: 'add',    price: 0.5, itemIds: null },
  ],

  // POS colours and type. Applied as CSS variables (see src/lib/theme.js).
  theme: {
    preset: 'light',
    bg: '#fafafa',
    surface: '#ffffff',
    surface2: '#f4f4f5',
    border: '#e4e4e7',
    text: '#18181b',
    muted: '#71717a',
    accent: '#18181b',
    accentText: '#ffffff',
    danger: '#dc2626',
    font: 'system',          // key of FONTS in src/lib/theme.js
    fontSize: 16,            // base px; block font sizes are absolute px overrides
    radius: 8,
    gap: 10,                 // grid gap in px
    padding: 16,             // screen padding in px
  },

  // POS screens on a snap grid. x/y are 0-based cells, w/h are spans.
  // `props` are per-block-type settings, `style` the common style overrides
  // (src/lib/styleFields.js). The grid always fills the screen.
  layouts: {
    home: {
      cols: 12, rows: 8,
      blocks: [
        { id: 'h-title',    type: 'title',       x: 0, y: 0, w: 12, h: 2, props: { showAlt: true }, style: { fontSize: 44, fontWeight: 600 } },
        { id: 'h-takeaway', type: 'mode-button', x: 0, y: 2, w: 6,  h: 4, props: { modeId: 'takeaway', showAlt: true }, style: { fontSize: 28 } },
        { id: 'h-delivery', type: 'mode-button', x: 6, y: 2, w: 6,  h: 4, props: { modeId: 'delivery', showAlt: true }, style: { fontSize: 28 } },
        { id: 'h-queue',    type: 'nav-button',  x: 0, y: 7, w: 3,  h: 1, props: { target: 'queue',   label: 'Print queue' }, style: {} },
        { id: 'h-summary',  type: 'nav-button',  x: 3, y: 7, w: 3,  h: 1, props: { target: 'summary', label: 'Today' }, style: {} },
        { id: 'h-clock',    type: 'clock',       x: 6, y: 7, w: 3,  h: 1, props: { seconds: false }, style: { align: 'center' } },
        { id: 'h-admin',    type: 'nav-button',  x: 9, y: 7, w: 3,  h: 1, props: { target: 'admin',   label: 'Admin' }, style: {} },
      ],
    },
    order: {
      cols: 12, rows: 12,
      blocks: [
        { id: 'o-back',     type: 'back-button',     x: 0, y: 0,  w: 2, h: 1,  props: { label: 'Back' }, style: {} },
        { id: 'o-search',   type: 'search',          x: 2, y: 0,  w: 6, h: 1,  props: { placeholder: 'Search' }, style: {} },
        { id: 'o-customer', type: 'customer',        x: 8, y: 0,  w: 4, h: 1,  props: {}, style: {} },
        { id: 'o-cats',     type: 'categories',      x: 0, y: 1,  w: 2, h: 11, props: { orientation: 'vertical', showAlt: true }, style: {} },
        { id: 'o-items',    type: 'items',           x: 2, y: 1,  w: 6, h: 11, props: { columns: 3, showPrice: true, showAlt: true, tileHeight: 96 }, style: {} },
        { id: 'o-ticket',   type: 'ticket',          x: 8, y: 1,  w: 4, h: 9,  props: { showAlt: true, showModifiers: true }, style: {} },
        { id: 'o-discount', type: 'discount-button', x: 8, y: 10, w: 2, h: 1,  props: { label: 'Discount' }, style: {} },
        { id: 'o-clear',    type: 'clear-button',    x: 10, y: 10, w: 2, h: 1, props: { label: 'Clear' }, style: {} },
        { id: 'o-print',    type: 'print-button',    x: 8, y: 11, w: 4, h: 1,  props: { label: 'Print', showTotal: true }, style: { fontSize: 20, fontWeight: 600 } },
      ],
    },
  },

  // Order receipt template. Rendered by shared/receipt.js into print ops
  // (docs/SPEC.md#print-ops). `show`: 'always' or an array of mode ids.
  receipt: {
    paperCols: 48,           // normal-size characters per line: 48 = 80mm, 32 = 58mm
    lineSpacing: 24,         // dots per normal-height line; 0 = printer default
    blocks: [
      { id: 'r-banner',  type: 'text', show: 'always', text: '{mode.labelAlt|mode.label} {eta}', hideIfEmpty: true, style: S({ w: 2, h: 2, bold: true, align: 'center' }) },
      { id: 'r-date',    type: 'text', show: 'always', text: '{date} {time}', hideIfEmpty: true, style: S({ align: 'center' }) },
      { id: 'r-name',    type: 'text', show: 'always', text: '{customer.name}', hideIfEmpty: true, style: S({ align: 'center' }) },
      { id: 'r-address', type: 'text', show: 'always', text: '{customer.address}', hideIfEmpty: true, style: S({ align: 'center' }) },
      { id: 'r-phone',   type: 'text', show: 'always', text: 'Tel: {customer.phone}', hideIfEmpty: true, style: S({ align: 'center', bold: true }) },
      { id: 'r-rule1',   type: 'divider', show: 'always', thickness: 4, pad: 3 },
      {
        id: 'r-items', type: 'items', show: 'always',
        // Line formats. Tokens: {qty} {name} {nameAlt} {choice} {choiceAlt}
        // {mods} {modsAlt} (" (No Chilli, Extra Sauce)" when beside) {price}
        altLine:  { show: true, format: '{qty}× {nameAlt}{choiceAlt}{modsAlt}', style: S({ w: 2, h: 2 }) },
        mainLine: { show: true, format: '  {qty}× {name}{choice}{mods}', price: true, style: S() },
        modsPosition: 'beside',  // 'beside' = in brackets after the name, 'below' = own lines
        modLine:  { format: '{sign} {nameAlt|name}', style: S({ w: 2, h: 2 }) },
        noteLine: { format: '* {note}', style: S({ w: 2, h: 2 }) },
        gap: 0,                  // blank lines between items
      },
      { id: 'r-rule2',   type: 'divider', show: 'always', thickness: 2, pad: 3 },
      {
        id: 'r-totals', type: 'totals', show: 'always',
        subtotal: { show: 'auto', label: 'SUBTOTAL', style: S({ bold: true }) },   // auto = only when there is a fee or discount
        fee:      { label: 'DELIVERY', style: S({ bold: true }) },
        discount: { label: 'DISCOUNT', style: S({ bold: true }) },
        total:    { label: 'TOTAL', style: S({ w: 2, h: 1, bold: true }) },
      },
    ],
  },

  // End-of-day summary template, same block system plus summary-* blocks.
  summary: {
    blocks: [
      { id: 's-name',   type: 'text', show: 'always', text: '{business.name}', hideIfEmpty: true, style: S({ w: 2, h: 2, bold: true, invert: true, align: 'center' }) },
      { id: 's-alt',    type: 'text', show: 'always', text: '{business.nameAlt}', hideIfEmpty: true, style: S({ w: 2, h: 2, bold: true, invert: true, align: 'center' }) },
      { id: 's-date',   type: 'text', show: 'always', text: '{summary.date}  {time}', hideIfEmpty: true, style: S({ invert: true, align: 'center' }) },
      { id: 's-title',  type: 'text', show: 'always', text: 'DAILY SUMMARY', hideIfEmpty: true, style: S({ w: 2, h: 2, bold: true, align: 'center' }) },
      { id: 's-feed',   type: 'feed', show: 'always', lines: 1 },
      { id: 's-modes',  type: 'summary-modes', show: 'always', format: '{label}  {count} orders', style: S({ bold: true }) },
      { id: 's-rule1',  type: 'divider', show: 'always', thickness: 2, pad: 3 },
      { id: 's-orders', type: 'summary-orders', show: 'always',
        rowLine:   { format: '{time}  [{short}]  #{number}', style: S({ bold: true }) },
        itemsLine: { show: true, format: '  {items}', style: S() } },
      { id: 's-rule2',  type: 'divider', show: 'always', thickness: 4, pad: 3 },
      { id: 's-total',  type: 'text', show: 'always', text: 'TOTAL {summary.total}', hideIfEmpty: true, style: S({ w: 2, h: 2, bold: true, invert: true, align: 'center' }) },
    ],
  },

  printer: {
    encoding: 'utf8',        // 'utf8' | 'gb2312' (cheap 58mm printers that print Chinese as garbage)
    ntfyUrl: 'https://ntfy.sh',
    ntfyTopic: '',           // generated on first save if empty; must match NTFY_TOPIC on the Pi
  },

  security: {
    summaryPin: '',          // optional PIN on the POS before the summary opens
  },
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

// Deep-merge plain objects; arrays and scalars from `saved` replace defaults.
function merge(base, saved) {
  if (!isObj(base) || !isObj(saved)) return saved === undefined ? base : saved
  const out = { ...base }
  for (const k of Object.keys(saved)) out[k] = merge(base[k], saved[k])
  return out
}

export function withDefaults(saved) {
  return merge(structuredClone(DEFAULT_CONFIG), saved || {})
}

export const newId = (prefix = 'x') =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
