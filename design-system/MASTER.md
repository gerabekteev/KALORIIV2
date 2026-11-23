# KaloriiAI — Nothing X Design System (`MASTER.md`)

> Single source of truth for KaloriiAI UI/UX (Mobile Android APK / PWA + Adaptive Desktop Bento).

## 1. Visual Philosophy
- **Aesthetic**: Strict **Nothing X OLED Dark** monochrome (`#000000` canvas, `#1A1A1D` matte bento surfaces, pure `#FFFFFF` & calm neutral grays).
- **Surgical Accent Rule (`Nothing Red #E02424`)**: Used **only** for the single highest-priority signal on screen:
  - Primary calorie arc / indicator dot
  - Detached floating `+` action button in Split Dock & desktop sidebar
  - Active micro-tick (`|`) or live recording/AI pulse
  - Over-budget / over-limit days on heatmap tiles & bar charts
  - Destructive actions (delete, logout, unlink)
- **Primary Action Buttons**: Pure white capsule (`#FFFFFF`) with crisp black text (`#000000`) — keeping Nothing Red truly surgical.
- **No Visual Noise**: No glowing green gradients, no colored glass halos, no emojis as structural icons (Lucide SVG icons only).

## 2. Three-Layer Design Token Architecture

### Layer 1 — Primitives (`--n-*`)
- `--n-black: #000000`
- `--n-gray-950: #0C0C0E`
- `--n-gray-900: #141416`
- `--n-gray-850: #1A1A1D`
- `--n-gray-800: #222226`
- `--n-gray-750: #2A2A2F`
- `--n-gray-700: #34343A`
- `--n-gray-600: #52525B`
- `--n-gray-500: #7A7A82`
- `--n-gray-400: #A1A1AA`
- `--n-gray-200: #E4E4E7`
- `--n-white: #FFFFFF`
- `--n-red-500: #E02424`
- `--n-red-600: #C81E1E`
- `--n-red-soft: rgba(224, 36, 36, 0.14)`

### Layer 2 — Semantic (`--bg-*`, `--fg-*`, `--accent-*`)
- `--bg-canvas: var(--n-black)`
- `--bg-surface: var(--n-gray-850)`
- `--bg-surface-elevated: var(--n-gray-800)`
- `--bg-surface-subtle: var(--n-gray-900)`
- `--bg-pill: var(--n-gray-750)`
- `--fg-primary: var(--n-white)`
- `--fg-secondary: var(--n-gray-400)`
- `--fg-muted: var(--n-gray-500)`
- `--fg-disabled: var(--n-gray-600)`
- `--border-subtle: rgba(255, 255, 255, 0.06)`
- `--border-strong: rgba(255, 255, 255, 0.14)`
- `--accent-signal: var(--n-red-500)`
- `--accent-signal-hover: var(--n-red-600)`
- `--accent-signal-soft: var(--n-red-soft)`

### Layer 3 — Component Tokens
- `--card-bg: var(--bg-surface)`
- `--card-radius: 22px`
- `--sheet-bg: #111113`
- `--sheet-radius: 28px`
- `--dock-bg: rgba(26, 26, 29, 0.94)`
- `--btn-primary-bg: var(--n-white)`
- `--btn-primary-fg: var(--n-black)`
- `--btn-secondary-bg: var(--n-gray-750)`
- `--btn-secondary-fg: var(--n-white)`
- `--btn-signal-bg: var(--n-red-500)`
- `--btn-signal-fg: var(--n-white)`
- `--tile-empty: #242428`
- `--tile-under: #6B6B73`
- `--tile-ok: #FFFFFF`
- `--tile-over: #E02424`

## 3. Typography
- **Dot-Matrix Numeric (`Doto`)**: `.font-ndot` — used for hero calories, macro numbers, KPIs, weights, timers, and numeric badges.
- **UI Body & Headings (`Inter`)**: Russian-first clean geometric sans with `tabular-nums` on data tables and inputs.
- **Signature Divider**: `.nothing-dotted-divider` (`radial-gradient` 7px dot rhythm).

## 4. Adaptive Layout & Navigation
- **Mobile (`< 1024px`)**: Minimal Nothing Header (page title + date/goal + avatar) + **Split Dock** (floating matte capsule for 4 routes + detached circular `#E02424` `+` button on the right).
- **Desktop (`>= 1024px`)**: Compact fixed left Nothing sidebar (`220px`) + responsive **2-column Bento layout** (`max-w-5xl` / `max-w-6xl`).

## 5. Accessibility & Touch Rules
- Minimum interactive target size `44×44px` (`min-h-[44px]`).
- Contrast >= 4.5:1 on all body text (`#FFFFFF` / `#E4E4E7` / `#A1A1AA` on `#1A1A1D` & `#000000`).
- Visible focus rings (`focus-visible:ring-2 focus-visible:ring-white/40`).
- `prefers-reduced-motion` honored globally.
