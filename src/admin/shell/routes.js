// Admin pages by URL segment: /admin/<path>. '' is the overview.
// `full` pages fill the area under the top bar with no padding.
export const NAV = [
  { group: null, items: [
    { path: '', label: 'Overview', icon: 'home' },
  ] },
  { group: 'Shop', tour: 'nav-shop', items: [
    { path: 'business', label: 'Business', icon: 'store' },
    { path: 'menu', label: 'Menu', icon: 'list' },
    { path: 'modifiers', label: 'Modifiers', icon: 'tag' },
    { path: 'order-types', label: 'Order types', icon: 'truck' },
  ] },
  { group: 'Design', tour: 'nav-design', items: [
    { path: 'layout', label: 'POS layout', icon: 'layout', full: true },
    { path: 'receipt', label: 'Receipt', icon: 'receipt', full: true },
  ] },
  { group: 'Operations', tour: 'nav-ops', items: [
    { path: 'orders', label: 'Orders', icon: 'clock' },
    { path: 'printer', label: 'Printer', icon: 'printer' },
  ] },
]

export const ROUTES = NAV.flatMap(g => g.items.map(r => ({ ...r, group: g.group })))

export const findRoute = path => ROUTES.find(r => r.path === path) || null

export const hrefFor = path => (path ? `/admin/${path}` : '/admin')

export const currentPath = () => location.pathname.replace(/^\/admin\/?/, '').replace(/\/+$/, '')
