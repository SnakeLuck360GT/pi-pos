// Minimal 16px stroke icons. Add new ones here rather than inline SVG elsewhere.
const P = {
  plus:     'M8 3v10M3 8h10',
  minus:    'M3 8h10',
  x:        'M4 4l8 8M12 4l-8 8',
  check:    'M3 8.5l3 3 7-7',
  trash:    'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5',
  copy:     'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  grip:     'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  chevronDown: 'M4 6l4 4 4-4',
  chevronRight:'M6 4l4 4-4 4',
  chevronLeft: 'M10 4l-4 4 4 4',
  arrowUp:  'M8 13V3M4 7l4-4 4 4',
  arrowDown:'M8 3v10M4 9l4 4 4-4',
  eye:      'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 9.75a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5z',
  eyeOff:   'M2 2l12 12M6.6 6.6a1.75 1.75 0 002.8 2.8M4.2 4.6C2.5 5.8 1.5 8 1.5 8S4 12.5 8 12.5c1.3 0 2.4-.4 3.4-1M7 3.6c.3 0 .7-.1 1-.1 4 0 6.5 4.5 6.5 4.5s-.5.9-1.4 2',
  printer:  'M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z',
  layout:   'M2.5 2.5h11v11h-11zM2.5 6h11M6.5 6v7.5',
  receipt:  'M3.5 1.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1zM6 5h4M6 8h4M6 11h2',
  list:     'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  tag:      'M2 2h5.5L14 8.5 8.5 14 2 7.5zM5 5h.01',
  sliders:  'M3 4h6M12 4h1M3 8h1M7 8h6M3 12h7M13 12h0M10.5 2.5v3M5.5 6.5v3M11.5 10.5v3',
  store:    'M2 6l1-3.5h10L14 6M2 6v7.5h12V6M2 6c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2',
  truck:    'M1.5 3.5h8v7h-8zM9.5 6h3l2 2.5v2h-5M4 12.5a1.25 1.25 0 100-.01M12 12.5a1.25 1.25 0 100-.01',
  clock:    'M8 14.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM8 4.5V8l2.5 1.5',
  logout:   'M6 2.5H3v11h3M10.5 5l3 3-3 3M13.5 8H6',
  undo:     'M5 3L2 6l3 3M2 6h7.5a4 4 0 010 8H6',
  redo:     'M11 3l3 3-3 3M14 6H6.5a4 4 0 000 8H10',
  image:    'M2.5 2.5h11v11h-11zM2.5 11l3.5-3.5 3 3 2-2 2.5 2.5M10.5 5.5h.01',
  type:     'M3 4V2.5h10V4M8 2.5v11M6 13.5h4',
  divider:  'M1.5 8h13',
  qr:       'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h1.5v1.5M13.5 9.5v.01M12 12h1.5v1.5M9.5 13.5h.01',
  external: 'M9 2.5h4.5V7M13.5 2.5L7 9M11.5 9.5v4h-9v-9h4',
  refresh:  'M13.5 3v3.5H10M2.5 13V9.5H6M3.3 6a5 5 0 018.9-1.5l1.3 2M12.7 10a5 5 0 01-8.9 1.5l-1.3-2',
  search:   'M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-3.5-3.5',
  move:     'M8 1.5v13M1.5 8h13M8 1.5L6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2',
  phone:    'M4.5 1.5h7v13h-7zM7.5 12.5h1',
  upload:   'M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v3.5h11V10',
  file:     'M4 1.5h5l3 3v10H4zM9 1.5v3h3',
  backspace:'M5.5 3.5h8v9h-8L2 8zM8 6l3 3M11 6l-3 3',
}

export function Icon({ name, size = 16, className = '', ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      className={`ui-icon ${className}`} aria-hidden="true" {...rest}
    >
      <path d={P[name] || ''} />
    </svg>
  )
}
