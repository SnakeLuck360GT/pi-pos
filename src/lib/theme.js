// POS theme -> CSS variables, and per-block style -> inline CSS. Shared by the
// POS runtime and the layout designer so the editor canvas renders exactly
// what the tablet shows.

export const FONTS = {
  system: { label: 'System', css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Noto Sans SC", sans-serif' },
  serif:  { label: 'Serif',  css: 'ui-serif, Georgia, "Times New Roman", "Songti SC", serif' },
  mono:   { label: 'Mono',   css: 'ui-monospace, "SF Mono", Menlo, Consolas, "PingFang SC", monospace' },
  rounded:{ label: 'Rounded',css: 'ui-rounded, "SF Pro Rounded", system-ui, "PingFang SC", sans-serif' },
}

export const THEME_PRESETS = {
  light: { bg: '#fafafa', surface: '#ffffff', surface2: '#f4f4f5', border: '#e4e4e7', text: '#18181b', muted: '#71717a', accent: '#18181b', accentText: '#ffffff', danger: '#dc2626' },
  dark:  { bg: '#0a0a0a', surface: '#141414', surface2: '#1c1c1c', border: '#262626', text: '#fafafa', muted: '#8a8a8a', accent: '#fafafa', accentText: '#0a0a0a', danger: '#ef4444' },
  paper: { bg: '#f5f3ee', surface: '#fbfaf7', surface2: '#efece5', border: '#e2ded4', text: '#1c1a17', muted: '#7a756b', accent: '#1c1a17', accentText: '#fbfaf7', danger: '#b42318' },
  slate: { bg: '#f8fafc', surface: '#ffffff', surface2: '#f1f5f9', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', accent: '#2563eb', accentText: '#ffffff', danger: '#dc2626' },
}

// Variables set on the POS root element. Blocks use these, never raw colours.
export function themeVars(t) {
  return {
    '--pos-bg': t.bg,
    '--pos-surface': t.surface,
    '--pos-surface-2': t.surface2,
    '--pos-border': t.border,
    '--pos-text': t.text,
    '--pos-muted': t.muted,
    '--pos-accent': t.accent,
    '--pos-accent-text': t.accentText,
    '--pos-danger': t.danger,
    '--pos-font': (FONTS[t.font] || FONTS.system).css,
    '--pos-fs': `${t.fontSize}px`,
    '--pos-radius': `${t.radius}px`,
    '--pos-gap': `${t.gap}px`,
    '--pos-pad': `${t.padding}px`,
  }
}

// A block's `style` (see styleFields.js) -> inline CSS for its frame. Unset
// keys fall through to the theme. `--alt-fs` sizes second-language text and
// `--b-align` lets blocks align their own content.
export function blockStyle(s = {}) {
  const css = {}
  if (s.fontSize)    css.fontSize = `${s.fontSize}px`
  if (s.altFontSize) css['--alt-fs'] = `${s.altFontSize}px`
  if (s.fontWeight)  css.fontWeight = s.fontWeight
  if (s.color)       css.color = s.color
  if (s.background)  css['--b-bg'] = s.background
  if (s.borderColor) css['--b-border'] = s.borderColor
  if (s.radius != null && s.radius !== '') css['--b-radius'] = `${s.radius}px`
  if (s.padding != null && s.padding !== '') css['--b-pad'] = `${s.padding}px`
  if (s.align)       { css.textAlign = s.align; css['--b-align'] = { left: 'flex-start', center: 'center', right: 'flex-end' }[s.align] }
  if (s.hidden)      css.display = 'none'
  return css
}
