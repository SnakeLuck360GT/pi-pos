# PiPOS: build spec

An open-source POS for small shops and takeaways. Tablet POS + cloud admin on Netlify; orders print on an ESC/POS thermal printer through a Raspberry Pi. Each shop deploys its own copy (one Netlify site = one shop, one admin password).

The thing that makes it different is that **everything is editable from `/admin` with no code changes**: menu, modifiers and order types, the POS screens (drag blocks on a snap grid, resize them, set text sizes and colours), and the receipt (an ordered list of blocks, each with ESC/POS text sizes 1–8×, bold, underline, invert and alignment).

```
 Tablet (/)  ──GET /api/config──►  Netlify Functions + Blobs  ◄──PUT /api/config──  Admin (/admin)
     │  POST /api/jobs (order + rendered print ops)        ▲
     └──► ntfy.sh wake-up ──► Raspberry Pi bridge ─────────┘ GET /api/jobs?status=pending
                                   │  POST /api/jobs/:id/complete|fail
                                   ▼
                              USB / network thermal printer
```

## 0. Ground rules for everyone

- **Stack:** React 18 + Vite 5, plain CSS, Netlify Functions v2 (ESM, `export default async (req, context) => Response`, `export const config = { path }`), `@netlify/blobs`. **Do not add npm dependencies** (no DnD libraries, no router, no CSS framework). Drag and drop is done with Pointer Events, so it works with touch.
- **Design: very minimal and clean, nothing that looks vibecoded.** Concretely:
  - No emoji anywhere in the UI. Icons only from `src/ui/icons.jsx` (16px strokes); add a path there if you need a new one.
  - No gradients, glows, coloured shadows, text-shadows, glassmorphism or bouncy animation. Shadows only on floating overlays (`--ui-shadow-pop`). Motion ≤ 150ms, opacity/transform only.
  - Neutral greys, 1px hairline borders, one accent (near-black). Blue (`--ui-select`) only for selection and focus in designers.
  - Admin type: 13px base, 12px labels, 15px dialog titles, 20px page titles. Weights 400/500/600 only. Sentence case labels ("Text size", not "Text Size"). No exclamation marks, no "Awesome!" copy. Keep microcopy short and plain.
  - Generous, consistent spacing on a 4px scale. Align things. Empty states are one plain line plus one action.
  - Admin UI must use the kit in `src/ui/index.jsx` + `src/ui/ui.css` (Button, IconButton, Input, NumberInput, MoneyInput, Select, Segmented, Toggle, ColorInput, ImageInput, Field, Fields, Section, PageHeader, Modal, Empty, Badge, Spinner, and the `ui-row`, `ui-stack`, `ui-grid-2`, `ui-list` helpers). Put new admin styles in your own CSS file with your own class prefix, using the `--ui-*` tokens.
  - POS UI uses only the `--pos-*` theme variables (`src/lib/theme.js`), so a theme change restyles everything. Touch targets ≥ 44px. No hover-only affordances.
- Match the code style of the existing files: 2-space indent, no semicolons, single quotes, short comments that say *why*.
- `shared/` is plain ESM with no imports outside `shared/`, because the browser, the functions and the Pi bridge all import it.

## 1. Files and ownership

```
shared/defaults.js     CONFIG SCHEMA + defaults (written, read it first)        — lead
shared/order.js        totals, money, eta, modifiersFor (written)                — lead
shared/text.js         colWidth, wrap, padding helpers                            — receipt agent
shared/receipt.js      template -> print ops, summary builder, sample data        — receipt agent
shared/*.test.js       node:test tests                                            — receipt agent
pi-bridge/             Raspberry Pi bridge (print ops -> ESC/POS bytes)            — receipt agent
src/receipt/           <ReceiptPaper> on-screen preview of print ops               — receipt agent
src/admin/receipt/     Receipt designer (admin page)                              — receipt agent
src/lib/raster.js      browser image -> 1-bit raster (for logo blocks)             — receipt agent

netlify/functions/     config, login, jobs                                         — backend agent
netlify/lib/           auth, blobs, http helpers                                   — backend agent
src/lib/api.js         browser API client + token storage                          — backend agent
src/lib/useConfig.js   load/cache/refresh config hook                              — backend agent
src/admin/AdminApp.jsx admin shell: login, nav, draft/save, routing                — backend agent
src/admin/pages/       Business, Menu, Modifiers, Order types, Printer, Orders     — backend agent
README.md, SETUP.md    top-level docs                                              — backend agent

src/pos/               POS runtime: PosApp, grid, block registry, flows, modals    — pos agent

src/admin/designer/    POS layout designer (drag/resize grid, inspector, theme)    — designer agent

src/lib/theme.js, src/lib/fields.js, src/ui/*, src/main.jsx, src/styles/*         — lead (ask before changing)
```

Only edit files you own. If you need something from another area that doesn't exist yet, code against the contract below; don't create the other agent's files. Put a stub only if your page cannot build without it, and name it in your final report.

## 2. Config

`shared/defaults.js` holds the whole schema with comments. Always read config through `withDefaults(saved)`. Summary:

- `business` {name, nameAlt, phone, address, currency, locale}
- `features` {orderModes, modifiers, altNames, queue, summary}: when a feature is off, hide its UI everywhere (POS blocks render nothing, and so on). `altNames: false` hides every `nameAlt`/`labelAlt` on screen and makes `{…Alt}` tokens resolve empty on paper.
- `modes[]` {id, label, labelAlt, short, eta[], fields[] ⊆ name|phone|address, fee, copies, enabled}
- `categories[]` {id, name, nameAlt}; `items[]` {id, categoryId, name, nameAlt, price, color, choices[], modifierIds}
- `modifiers[]` {id, name, nameAlt, kind: add|remove, price, itemIds}
- `theme` (see `THEME_PRESETS`, `themeVars` in `src/lib/theme.js`)
- `layouts.home`, `layouts.order`: `{ cols, rows, blocks: [{ id, type, x, y, w, h, props, style }] }`
- `receipt` {paperCols, lineSpacing, blocks[]}, `summary` {blocks[]}
- `printer` {encoding, ntfyUrl, ntfyTopic}, `security` {summaryPin}

Ids: `newId(prefix)` from `shared/defaults.js`.

## 3. Order

Shape documented at the top of `shared/order.js`. `number` is a per-device daily counter (1, 2, 3… reset at midnight, stored in localStorage by the POS). `createdAt` is ms. Totals always come from `orderTotals(order)`, never stored separately (the job also stores `total` for the summary).

## 4. Receipt rendering

### 4.1 Template → print ops

```js
// shared/receipt.js
renderReceipt(config, order, { now })   -> PrintDoc
renderSummary(config, summary, { now }) -> PrintDoc
buildSummary(config, jobs, dayMs)       -> summary   // from GET /api/jobs results (type 'order', status printed|pending), local day containing dayMs
sampleOrder(config, modeId)             -> order     // realistic preview data: 4-5 lines, a choice, modifiers, a note, customer
sampleSummary(config)                   -> summary
TOKENS                                  -> [{ token, label, scope: 'order'|'summary'|'both' }]   // for the designer's token picker
RECEIPT_BLOCK_TYPES                     -> metadata per block type (label, icon, which templates it is valid in, default block)

PrintDoc = { cols, lineSpacing, encoding, ops: Op[] }
```

The render runs **in the browser** at order time. The job carries the finished `PrintDoc`, and the Pi only turns ops into bytes. A receipt redesign therefore never needs a Pi update, and the preview and the paper come from the same ops.

Block rules:
- `show`: `'always'` or an array of mode ids. Skip the block when `order.mode` isn't listed. Summary templates ignore `show`.
- `text`: `text` is a template, and `\n` makes several lines. Tokens are `{path}` with fallbacks `{a|b|c}`. If a line contains tokens that all resolve empty and `hideIfEmpty`, drop that line. Each line is word-wrapped to `floor(cols / style.w)` columns.
- `divider` {thickness (dots, 1–8), pad (dots above and below)} → `rule` op.
- `feed` {lines} → `feed` op.
- `image` {data (base64 1-bit raster), width, height, align} → `image` op (see `src/lib/raster.js`).
- `qr` {text (template), size 1–16, align} → `qr` op.
- `items`: per line, alt line (skip when no `nameAlt`, `altLine.show` false, or altNames off) then main line with right-aligned price on the first wrapped line (continuation lines indent under the name, as in the old Fortune House bridge `priceLines`). `{choice}` = `" Beef"` style suffix, `{mods}` = `" (No Chilli, Extra Sauce)"` when `modsPosition: 'beside'`, else empty with one `modLine` per modifier (`{sign}` = `+` for add, `-` for remove). A free-text `note` always gets its own `noteLine`. `gap` feed lines between items.
- `totals`: subtotal row (`show: 'auto'` = only when fee or discount > 0, `'always'`, `'never'`), fee row when fee > 0 (label from the block; the mode's own label is available as `{mode.label}`), discount row when > 0 (shown negative), total row. Each row is label on the left and amount on the right, filling `floor(cols / style.w)` columns.
- `summary-modes`: one row per mode with orders, `format` tokens `{label} {labelAlt} {short} {count}`, amount right-aligned.
- `summary-orders`: per order a `rowLine` (`{time} {short} {number} {label}`, total right-aligned) and an optional `itemsLine` (`{items}` = "2× Spring Rolls, Coke…" truncated to one line).

Tokens: `{business.name} {business.nameAlt} {business.phone} {business.address} {mode.label} {mode.labelAlt} {mode.short} {eta} {date} (dd/mm) {dateLong} (dd/mm/yyyy) {time} (HH:MM) {order.number} {order.id} {customer.name} {customer.phone} {customer.address} {items.count} {total} {summary.date} {summary.count} {summary.total}`. Dates use `business.locale`. Money uses `money()`.

### 4.2 Text width

`colWidth(str)`: East Asian wide/fullwidth characters (CJK, Hangul, kana, fullwidth forms) count 2 columns; everything else counts 1. Emoji are stripped before printing. All wrapping and padding uses `colWidth`, so mixed English/Chinese lines align on paper and in the preview.

### 4.3 Print ops

```js
{ op: 'text', text, w, h, bold, underline, invert, align }   // ONE physical line, already wrapped. Two-column rows are pre-padded to full width (align left). Inverted lines are padded to full width so the band spans the paper.
{ op: 'rule', thickness, pad }                                // full-width raster line (GS v 0)
{ op: 'feed', lines }
{ op: 'image', width, height, data, align }                   // width multiple of 8, data = base64 of packed 1-bit rows, MSB first, 1 = black
{ op: 'qr', data, size, align }
{ op: 'cut' }                                                 // always last; the renderer appends it
```

### 4.4 Preview

`src/receipt/ReceiptPaper.jsx`: `<ReceiptPaper doc={PrintDoc} width={px?} />` draws the ops at true proportions: monospace cell = paperWidthPx / cols, a w×h line scales its glyphs by w and h, wide chars take 2 cells, rules are drawn at their dot thickness (paper 576 dots for 48 cols, 384 for 32), inverted lines are white on black. White paper, subtle edge, no fake torn-paper effects. Used by the receipt designer, the POS print confirmation and the order list.

## 5. Backend

Blobs store `pipos`, keys `config`, `config-backup`, `jobs/<id>`, `pending/<id>` (empty marker). Job ids sort by time: `${Date.now().toString(36).padStart(9,'0')}-${rand4}`.

Env: `ADMIN_PASSWORD` (required; the Netlify deploy button prompts for it), `PRINTER_KEY` (optional; generated and stored in `meta/secrets` when unset), `SESSION_SECRET` (optional; defaults to sha256(`pipos:` + ADMIN_PASSWORD)), `PIPOS_REPO` (optional; the repo the Pi installer clones).

Easy setup: the admin's setup wizard calls `POST /api/pi/pair` (admin) → `{ code, expiresAt }` (6 chars, 15 min) and shows `curl -fsSL '<origin>/api/pi/install?code=XXXXXX' | bash`. That route returns a bash wrapper that exports `PIPOS_API_BASE/PRINTER_KEY/NTFY_URL/NTFY_TOPIC/REPO` and runs `pi-bridge/install.sh` from the repo. The bridge posts `POST /api/printer/heartbeat` (printer key) on start, every 5 min and after jobs; `GET /api/printer` (admin) returns the key, the ntfy settings and the last heartbeat, which drives the "Waiting for the Pi… / Connected" status.

Auth: HMAC-SHA256 tokens `base64url(JSON{role, exp}).base64url(sig)`, sent as `Authorization: Bearer <t>`. Roles: `admin` (30 days, admin panel) and `device` (1 year, a POS tablet connected with the admin password). The Pi sends `X-Printer-Key: <PRINTER_KEY>`. Compare secrets in constant time.

| Method & path | Who | Body / query | Response |
|---|---|---|---|
| `POST /api/login` | anyone | `{ password, role: 'admin'\|'device' }` | `{ token, role, exp }` or 401 |
| `GET /api/config` | anyone | | `{ config \| null, updatedAt }` (null = never saved; client uses defaults) |
| `PUT /api/config` | admin | `{ config }` | `{ ok, updatedAt }`; previous copy saved to `config-backup`; generates `printer.ntfyTopic` (`pipos-` + 16 random chars) if empty |
| `POST /api/jobs` | device, admin | `{ type: 'order'\|'summary'\|'test', order?, summary?, total?, copies, doc: PrintDoc }` | `{ id }`; job saved with `status: 'pending', createdAt, error: null` + pending marker |
| `GET /api/jobs` | device, admin, printer | `?status=pending\|printed\|failed\|all&since=<ms>&limit=` | `{ jobs }` newest first. `status=pending` reads the `pending/` prefix only (fast path for the Pi) |
| `POST /api/jobs/:id/complete` | printer, device, admin | | status printed, `printedAt`, marker removed |
| `POST /api/jobs/:id/fail` | printer, device, admin | `{ error }` | status failed, marker removed |
| `POST /api/jobs/:id/retry` | device, admin | | status pending, marker re-added |
| `DELETE /api/jobs/:id` | device, admin | | removed |

JSON errors: `{ error: 'message' }` with a proper status. CORS isn't needed (same origin) except for the Pi, which is a server-to-server call. Prune jobs older than 30 days during `POST /api/jobs`, at most once an hour (track with a `meta/pruned` key).

`src/lib/api.js` (browser):
```js
getConfig() -> { config (withDefaults applied), updatedAt, saved: bool }
saveConfig(config) -> { updatedAt }
login(password, role) -> stores token in localStorage ('pipos.adminToken' | 'pipos.deviceToken')
logout(role), hasToken(role)
createJob(job) -> { id }; then wakePrinter(config, id) (fire-and-forget POST to `${ntfyUrl}/${ntfyTopic}`)
listJobs({ status, since, limit }), jobAction(id, 'complete'|'fail'|'retry'|'delete')
// requests use the admin token if present, else the device token. A 401 throws ApiError with .status = 401.
```
`src/lib/useConfig.js`: `useConfig({ poll })` → `{ config, loading, error, refresh, updatedAt }`. Caches the last config in localStorage (`pipos.config`), so the POS works offline and starts instantly, and refetches on `poll` ms (POS: 60 000) and on window focus.

## 6. POS runtime (`src/pos/`)

`PosApp.jsx` (default export): loads config with `useConfig({ poll: 60000 })`, applies `themeVars(config.theme)` to a full-viewport root `.pos-root` (100dvh, no page scroll, `--pos-*` vars), and runs the screens:

1. **Connect**: when there's no device or admin token, a centred minimal card with an admin password field ("Connect this tablet"), which calls `login(pw, 'device')`.
2. **Home**: renders `layouts.home`.
3. Choose a mode → if the mode has `fields`, a **customer details** sheet (name / phone / address, big inputs, Continue/Skip) → **Order**: renders `layouts.order`. With `features.orderModes` off, a single "New order" path skips mode and customer.
4. Item tap → if `choices`, a **choice** sheet → line added (identical item + choice + no modifiers merges qty). Ticket line tap → **line** sheet: qty −/+, modifiers as toggle chips (from `modifiersFor`), free-text note, remove.
5. **Print**: `renderReceipt(config, order, { now })`, then `createJob({ type: 'order', order, total, copies: mode.copies, doc })`, then `wakePrinter`. Show a brief confirmation (ReceiptPaper thumbnail optional), clear the order and go home. Offline or failed: show the error, keep the order, allow retry.
6. **Queue** (`features.queue`): list today's jobs with status badges; retry failed ones, reprint printed ones (POST the same doc as a new job).
7. **Summary** (`features.summary`, optional `security.summaryPin`): totals by mode, order list, Print button (`buildSummary`, `renderSummary`, job type `summary`, copies 1).
8. **Admin** nav-button target: `location.href = '/admin'`.

Grid renderer `PosGrid.jsx`: `<PosGrid layout ctx />`, a CSS grid filling the viewport inside `--pos-pad`, `grid-template-columns: repeat(cols, minmax(0,1fr))`, `grid-template-rows: repeat(rows, minmax(0,1fr))`, gap `--pos-gap`. Each block goes in `<BlockFrame block>`, which places it (`grid-column: x+1 / span w`), applies `blockStyle(block.style)` and clips overflow. Blocks scroll internally when needed (items, ticket, categories).

**Block registry** `src/pos/blocks/index.js`, the contract the designer uses:
```js
export const BLOCKS = {
  [type]: {
    label: 'Item grid',               // sentence case
    icon: 'layout',                   // name from src/ui/icons.jsx
    screens: ['order'],               // 'home' | 'order'
    size: { w: 6, h: 6 },             // default span when dropped
    minSize: { w: 2, h: 2 },
    props: { columns: 3, ... },       // defaults
    fields: [ ...field defs ],        // block-specific inspector fields (src/lib/fields.js format)
    Component,                        // ({ block, ctx }) => JSX
  },
}
export function makePreviewCtx(config, screen)  // ctx with sampleOrder filled in, no-op actions, editing: true
```
Block types. Home: `title`, `text` (props.text, multiline), `mode-button` (props.modeId, showAlt), `new-order-button` (used when orderModes is off), `nav-button` (props.target queue|summary|admin, label), `clock` (props.seconds, showDate), `image` (props.src, fit contain|cover), `spacer`. Order: `categories` (orientation vertical|horizontal, showAlt), `items` (columns, showPrice, showAlt, tileHeight), `ticket` (showAlt, showModifiers), `total`, `print-button` (label, showTotal), `back-button`, `customer` (mode label + customer, tap to edit), `search`, `discount-button`, `fee-button`, `clear-button`, plus `text`, `clock`, `image`, `spacer` on both screens.

`ctx` = `{ config, screen, editing, order, actions, ui, money }`:
- `order`: current order object (`orderTotals` available)
- `actions`: `{ go(screen), startMode(modeId), newOrder(), addItem(item), openLine(lineId), inc(lineId), dec(lineId), clear(), setDiscount(n), setFee(n), editCustomer(), print(), openQueue(), openSummary(), openAdmin() }`
- `ui`: `{ category, setCategory, search, setSearch }`
- `money(n)`: formats with the config currency
- `editing: true` in the designer. Blocks still render the sample data, but the designer covers them so taps don't fire.

Block visuals: surfaces `--pos-surface`, 1px `--pos-border`, radius `var(--b-radius, var(--pos-radius))`, padding `var(--b-pad, …)`, background `var(--b-bg, …)`, border colour `var(--b-border, …)`, second-language text `font-size: var(--alt-fs, 0.75em)` in `--pos-muted`. Primary actions (print, mode buttons) use `--pos-accent`/`--pos-accent-text`. Item tiles: name, alt name and price stacked left-aligned, with the item `color` (if set) as a 3px left edge, never a full fill. Text sizes come from the block's `style.fontSize` (frame font-size), so internal sizes are `em`-relative.

## 7. Admin (`/admin`)

`AdminApp.jsx`: login screen (password → `login(pw, 'admin')`) → shell:
- Left sidebar (220px): app name at the top, nav groups **Shop** (Business, Menu, Modifiers, Order types), **Design** (POS layout, Receipt), **Operations** (Orders, Printer), and a "Open POS" link and Sign out at the bottom. Icons from the kit, active item `--ui-subtle` background.
- Top bar: page title, save state ("Saved", "Unsaved changes", "Saving…", plus an error), **Discard** and **Save** (primary, ⌘S). It warns on unload with unsaved changes.
- Holds one `draft` config. Pages get `{ config, update, savedConfig }` where `update(fn)` takes `draft => newDraft` (immutable). Undo/redo history of drafts (⌘Z / ⇧⌘Z, cap 100), exposed to pages as `{ undo, redo, canUndo, canRedo }`, which the designers use in their toolbars.
- Routing by `location.pathname` (`/admin/menu`, `/admin/layout`, `/admin/receipt`…) with pushState. Default `/admin` → Business.
- Pages that need the full width (`layout`, `receipt`) render edge-to-edge under the top bar with no page padding. Other pages: max-width 880px, 32px padding.
- Lazy imports: `./designer/PosDesigner.jsx` (default export, props above) and `./receipt/ReceiptDesigner.jsx` (default export, props above).

Pages (backend agent):
- **Business**: name, alt name, phone, address, currency symbol, locale; feature toggles with one-line descriptions.
- **Menu**: categories (reorderable list, inline edit) and items (list filtered by category, drag to reorder, detail panel: name, alt, price, colour, category, choices editor, allowed modifiers: All / None / Pick).
- **Modifiers**: list with name, alt, add/remove, price, applies to all items or only some.
- **Order types**: modes list with label, alt, short code, ETA minutes (one value or a range), fields asked, fee, copies, enabled.
- **Printer**: paper width (80mm/58mm, which sets `receipt.paperCols` 48/32), encoding, line spacing, ntfy URL/topic (regenerate), a status line (last job printed time), a **Test print** button (renders a sample order and queues a `test` job), and the Pi setup snippet (`.env` with the values filled in, copyable).
- **Orders**: job history (date filter today/7 days), status, total, reprint, retry, delete, and a receipt preview on click.

## 8. Pi bridge (`pi-bridge/`)

Node ≥ 20, ESM, single dependency `iconv-lite`. Env: `API_BASE`, `PRINTER_KEY`, `NTFY_URL`, `NTFY_TOPIC`, `PRINTER` (`/dev/usb/lp0` default, or `tcp://host:9100`), `ENCODING` (overrides `doc.encoding`), `FALLBACK_POLL_MS` (default 5 min), `CUT` (`partial|full|none`). Same behaviour as the Fortune House bridge: a long-lived ntfy JSON stream with stall detection and backoff, polling on connect and on each message, a serialised print loop, `copies` with a 600ms gap between them, then complete or fail. ESC/POS: `GS !` for size, `ESC 3` line spacing (`lineSpacing × h`), `ESC E` bold, `ESC -` underline, `GS B` invert, `ESC a` align, `GS v 0` for rules and images, `GS ( k` for QR, `GS V` for cut, and GB2312 mode (`FS &`) plus iconv when the encoding is gb2312 (`£` → `￡`). Includes `README.md` (setup steps adapted from the old SETUP.md), `.env.example` and `pipos-bridge.service`. Also `node index.js --test` prints a built-in test page.
