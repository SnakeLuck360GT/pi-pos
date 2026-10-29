// Block registry: the contract between the POS runtime and the layout
// designer (docs/SPEC.md §6). Field keys are relative to `block.props`.
import { money } from '../../../shared/order.js'
import { sampleOrder } from '../../../shared/receipt.js'
import { emptyOrder } from '../useOrder.js'
import { ClockBlock, ImageBlock, SpacerBlock, TextBlock, TitleBlock } from './common.jsx'
import { ModeButtonBlock, NavButtonBlock, NewOrderButtonBlock } from './home.jsx'
import {
  BackButtonBlock, CategoriesBlock, ClearButtonBlock, CustomerBlock, DiscountButtonBlock,
  FeeButtonBlock, ItemsBlock, PrintButtonBlock, SearchBlock, TicketBlock, TotalBlock,
} from './order.jsx'

const BOTH = ['home', 'order']
const HOME = ['home']
const ORDER = ['order']

const showAltField = { key: 'showAlt', label: 'Second-language name', type: 'toggle' }
const labelField = (placeholder) => ({ key: 'label', label: 'Label', type: 'text', placeholder })

export const BLOCKS = {
  title: {
    label: 'Title', icon: 'type', screens: BOTH,
    size: { w: 12, h: 2 }, minSize: { w: 2, h: 1 },
    props: { text: '', showAlt: true },
    fields: [
      { key: 'text', label: 'Text', type: 'text', placeholder: 'Business name', hint: 'Leave empty to use the business name.' },
      showAltField,
    ],
    Component: TitleBlock,
  },
  text: {
    label: 'Text', icon: 'type', screens: BOTH,
    size: { w: 4, h: 2 }, minSize: { w: 1, h: 1 },
    props: { text: 'Text', muted: false },
    fields: [
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'muted', label: 'Muted colour', type: 'toggle' },
    ],
    Component: TextBlock,
  },
  clock: {
    label: 'Clock', icon: 'clock', screens: BOTH,
    size: { w: 3, h: 1 }, minSize: { w: 1, h: 1 },
    props: { seconds: false, showDate: false },
    fields: [
      { key: 'seconds', label: 'Show seconds', type: 'toggle' },
      { key: 'showDate', label: 'Show date', type: 'toggle' },
    ],
    Component: ClockBlock,
  },
  image: {
    label: 'Image', icon: 'image', screens: BOTH,
    size: { w: 4, h: 3 }, minSize: { w: 1, h: 1 },
    props: { src: '', fit: 'contain' },
    fields: [
      { key: 'src', label: 'Image', type: 'image' },
      { key: 'fit', label: 'Fit', type: 'segmented', options: [{ value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' }] },
    ],
    Component: ImageBlock,
  },
  spacer: {
    label: 'Spacer', icon: 'divider', screens: BOTH,
    size: { w: 2, h: 1 }, minSize: { w: 1, h: 1 },
    props: {},
    fields: [],
    Component: SpacerBlock,
  },

  'mode-button': {
    label: 'Order type button', icon: 'store', screens: HOME,
    size: { w: 6, h: 4 }, minSize: { w: 2, h: 1 },
    props: { modeId: '', showAlt: true, showEta: false },
    fields: [
      // Options come from config.modes; resolve with blockFields(type, config).
      { key: 'modeId', label: 'Order type', type: 'select', options: [], optionsFrom: 'modes' },
      showAltField,
      { key: 'showEta', label: 'Show ready time', type: 'toggle' },
    ],
    Component: ModeButtonBlock,
  },
  'new-order-button': {
    label: 'New order button', icon: 'plus', screens: HOME,
    size: { w: 6, h: 4 }, minSize: { w: 2, h: 1 },
    props: { label: 'New order' },
    fields: [labelField('New order')],
    Component: NewOrderButtonBlock,
  },
  'nav-button': {
    label: 'Navigation button', icon: 'chevronRight', screens: HOME,
    size: { w: 3, h: 1 }, minSize: { w: 1, h: 1 },
    props: { target: 'queue', label: '', showIcon: true },
    fields: [
      { key: 'target', label: 'Opens', type: 'select', options: [
        { value: 'queue', label: 'Print queue' },
        { value: 'summary', label: 'Daily summary' },
        { value: 'admin', label: 'Admin' },
      ] },
      labelField('Default for the target'),
      { key: 'showIcon', label: 'Icon', type: 'toggle' },
    ],
    Component: NavButtonBlock,
  },

  categories: {
    label: 'Categories', icon: 'list', screens: ORDER,
    size: { w: 2, h: 10 }, minSize: { w: 1, h: 1 },
    props: { orientation: 'vertical', showAlt: true, showAll: false },
    fields: [
      { key: 'orientation', label: 'Direction', type: 'segmented', options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] },
      showAltField,
      { key: 'showAll', label: 'Show "All"', type: 'toggle' },
    ],
    Component: CategoriesBlock,
  },
  items: {
    label: 'Item grid', icon: 'layout', screens: ORDER,
    size: { w: 6, h: 10 }, minSize: { w: 2, h: 2 },
    props: { columns: 3, showPrice: true, showAlt: true, tileHeight: 96 },
    fields: [
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 8 },
      { key: 'tileHeight', label: 'Tile height', type: 'number', min: 44, max: 320, step: 4, hint: 'Minimum, in px.' },
      { key: 'showPrice', label: 'Prices', type: 'toggle' },
      showAltField,
    ],
    Component: ItemsBlock,
  },
  ticket: {
    label: 'Ticket', icon: 'receipt', screens: ORDER,
    size: { w: 4, h: 8 }, minSize: { w: 2, h: 3 },
    props: { showAlt: true, showModifiers: true, showTotals: true },
    fields: [
      showAltField,
      { key: 'showModifiers', label: 'Modifiers and notes', type: 'toggle' },
      { key: 'showTotals', label: 'Totals', type: 'toggle' },
    ],
    Component: TicketBlock,
  },
  total: {
    label: 'Total', icon: 'tag', screens: ORDER,
    size: { w: 4, h: 1 }, minSize: { w: 1, h: 1 },
    props: { label: 'Total', showCount: true },
    fields: [labelField('Total'), { key: 'showCount', label: 'Item count', type: 'toggle' }],
    Component: TotalBlock,
  },
  'print-button': {
    label: 'Print button', icon: 'printer', screens: ORDER,
    size: { w: 4, h: 1 }, minSize: { w: 1, h: 1 },
    props: { label: 'Print', showTotal: true },
    fields: [labelField('Print'), { key: 'showTotal', label: 'Show total', type: 'toggle' }],
    Component: PrintButtonBlock,
  },
  'back-button': {
    label: 'Back button', icon: 'chevronLeft', screens: ORDER,
    size: { w: 2, h: 1 }, minSize: { w: 1, h: 1 },
    props: { label: 'Back' },
    fields: [labelField('Back')],
    Component: BackButtonBlock,
  },
  customer: {
    label: 'Customer', icon: 'phone', screens: ORDER,
    size: { w: 4, h: 1 }, minSize: { w: 1, h: 1 },
    props: { showAlt: true, showNumber: true },
    fields: [showAltField, { key: 'showNumber', label: 'Order number', type: 'toggle' }],
    Component: CustomerBlock,
  },
  search: {
    label: 'Search', icon: 'search', screens: ORDER,
    size: { w: 4, h: 1 }, minSize: { w: 2, h: 1 },
    props: { placeholder: 'Search' },
    fields: [{ key: 'placeholder', label: 'Placeholder', type: 'text' }],
    Component: SearchBlock,
  },
  'discount-button': {
    label: 'Discount button', icon: 'tag', screens: ORDER,
    size: { w: 2, h: 1 }, minSize: { w: 1, h: 1 },
    props: { label: 'Discount' },
    fields: [labelField('Discount')],
    Component: DiscountButtonBlock,
  },
  'fee-button': {
    label: 'Fee button', icon: 'truck', screens: ORDER,
    size: { w: 2, h: 1 }, minSize: { w: 1, h: 1 },
    props: { label: 'Fee' },
    fields: [labelField('Fee')],
    Component: FeeButtonBlock,
  },
  'clear-button': {
    label: 'Clear button', icon: 'trash', screens: ORDER,
    size: { w: 2, h: 1 }, minSize: { w: 1, h: 1 },
    props: { label: 'Clear' },
    fields: [labelField('Clear')],
    Component: ClearButtonBlock,
  },
}

// Fields with options that depend on the config (e.g. which mode a button starts).
export function blockFields(type, config) {
  const def = BLOCKS[type]
  if (!def) return []
  return def.fields.map(f => {
    if (f.optionsFrom !== 'modes') return f
    const { optionsFrom, ...rest } = f
    return { ...rest, options: (config?.modes || []).map(m => ({ value: m.id, label: m.enabled === false ? `${m.label} (off)` : m.label })) }
  })
}

// Every action is a no-op in the designer; a Proxy keeps that true for any
// action a block might call that isn't listed here.
const noop = () => {}
const noopActions = new Proxy({}, { get: () => noop })

export function makePreviewCtx(config, screen = 'home') {
  const mode = (config.modes || []).find(m => m.enabled !== false) || null
  let order
  try {
    order = { ...emptyOrder(), ...sampleOrder(config, config.features?.orderModes ? mode?.id : null) }
  } catch {
    order = emptyOrder(mode?.id ?? null)
  }
  return {
    config,
    screen,
    editing: true,
    order,
    actions: noopActions,
    ui: {
      category: null, setCategory: noop,
      search: '', setSearch: noop,
      printing: false, nextNumber: order.number || 1,
    },
    money: n => money(n, config),
  }
}
