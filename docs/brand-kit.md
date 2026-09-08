# AgentPay Brand Kit

**Status:** Applied in Concept 07 production; pending Mark's final visual approval
**Prepared:** 2026-09-04; production direction updated 2026-09-05
**Visual reference:** Approved AgentPay Concept 07

## Evidence and limitations

The primary reference is the live Binance Web3 experience: <https://web3.binance.com/en/>. From this AWS host, both `web3.binance.com` and `www.binance.com` returned HTTP 202 with an empty response body, preventing honest extraction of computed CSS, exact breakpoints, or bundled font declarations. This document therefore separates:

- **Observed ecosystem tokens:** values consistently published or used across Binance/BNB design-system references.
- **AgentPay adopted tokens:** our stable, accessible implementation choices inspired by that system.
- **Recommendations:** values inferred for a coherent product system; these are not claimed as proprietary Binance source values.

References:

- Binance Web3: <https://web3.binance.com/en/>
- Binance Design System documentation mirror: <https://hexdocs.pm/binance_design_system/>
- BNB Chain Design System documentation: <https://design-system-docs.bnbchain.org/>
- Inter font project and OFL license: <https://github.com/rsms/inter>
- Google Fonts Inter specimen: <https://fonts.google.com/specimen/Inter>

## Brand principles

1. **Financial clarity:** amount, asset, network, recipient, approval state, and finality must be visually dominant.
2. **Black/yellow identity:** yellow identifies primary action and selection; it must not decorate every surface.
3. **Warm neutral-first UI:** the workspace uses warm off-white surfaces with a near-black sidebar; restrained yellow is reserved for primary action and selection so semantic colors remain meaningful.
4. **Explicit safety:** approval, warning, disabled, pending, failure, and success states must never rely on color alone.
5. **Dense but calm:** compact controls and data tables, generous page spacing, low-noise borders, minimal shadows.

## Logo and favicon assets

Installed assets supplied by Mark on 2026-09-04:

- `public/brand/agentpay-mark.png` — 512×512 AP mark for product navigation.
- `public/brand/agentpay-logo.png` — 1024×1024 full AgentPay lockup for future marketing/header use.
- `app/icon.png` — 512×512 browser/app icon.
- `app/apple-icon.png` — 180×180 Apple touch icon.

The Canva SVG exports contained embedded raster images and large C2PA metadata blocks rather than true vector paths. AgentPay therefore renders optimized local PNGs from the supplied artwork instead of shipping the oversized SVG wrappers. The visible black/yellow/white design is preserved.

For future variants, prefer a true path-based SVG with outlined shapes and a transparent canvas, plus an icon-only light-on-dark and dark-on-light version.

## Color system

### Core brand

| Token | Hex | Usage | Classification |
|---|---:|---|---|
| Brand yellow | `#F5CD45` | Restrained primary buttons, selected indicators, focused brand accents | Concept 07 adopted |
| Brand yellow hover | `#E6BE36` | Primary hover | Concept 07 adopted |
| On yellow | `#171815` | Text/icons on yellow | Concept 07 adopted |
| Focus ring | `rgba(245, 205, 69, 0.34)` | Keyboard focus halo | Concept 07 adopted |

### Production surfaces — light warm workspace with dark sidebar

| Token | Hex | Usage |
|---|---:|---|
| Canvas | `#F6F4ED` | Warm application workspace |
| Sidebar | `#171815` | Persistent desktop navigation and dark summaries |
| Surface 1 | `#FFFEF9` | Cards and primary panels |
| Surface 2 | `#F0EEE6` | Nested/secondary panels |
| Surface 3 | `#E9E6DC` | Hovered rows and controls |
| Border subtle | `#DEDDD5` | Dividers and default borders |
| Border strong | `#BBB9AF` | Focused/important boundaries |

### Text and icons

| Token | Dark theme | Light theme | Usage |
|---|---:|---:|---|
| Primary | `#EAECEF` | `#1E2329` | Titles, values, primary copy |
| Secondary | `#B7BDC6` | `#474D57` | Supporting copy |
| Tertiary | `#848E9C` | `#707A8A` | Captions, metadata |
| Disabled | `#5E6673` | `#B7BDC6` | Disabled labels/icons |
| Inverse | `#181A20` | `#FFFFFF` | Text on contrasting fills |
| Link | `#FCD535` | `#946D00` | Inline links |
| Link hover | `#FFE566` | `#765800` | Hovered links |

### Semantic colors

The following two values are required AgentPay brand decisions:

| State | Foreground | Soft background | Border |
|---|---:|---:|---:|
| Success / confirmed / positive | `#28A473` | `rgba(40,164,115,.14)` | `rgba(40,164,115,.38)` |
| Failure / rejected / negative | `#F63C55` | `rgba(246,60,85,.14)` | `rgba(246,60,85,.38)` |
| Warning / pending | `#F0B90B` | `rgba(240,185,11,.14)` | `rgba(240,185,11,.38)` |
| Information | `#2B7CD3` | `rgba(43,124,211,.14)` | `rgba(43,124,211,.38)` |

Always pair state color with an icon and label such as **Confirmed**, **Failed**, or **Pending**.

## Typography

### Binance Nova finding

“Binance Nova” appears to be a custom Binance brand typeface. Unofficial copies exist online, but no official public webfont redistribution license was confirmed during this review. AgentPay must not bundle or hotlink it without written licensing evidence.

### Adopted typeface

**Manrope** is the approved Concept 07 typeface throughout the application, including controls and machine-readable values, with weights 400, 500, 600, and 700. Controls use semibold 600 labels.

```css
font-family: Manrope, sans-serif;
```

Do not mix Inter, system monospace, or other product fonts into production screens without a new visual decision.

### Type scale

| Style | Size / line | Weight | Usage |
|---|---:|---:|---|
| Display | 56 / 64px | 600 | Marketing hero only |
| H1 | 48 / 56px | 600 | Desktop page hero |
| H2 | 40 / 48px | 600 | Major section |
| H3 | 32 / 40px | 600 | Page section title |
| H4 | 24 / 32px | 600 | Panel title |
| H5 | 20 / 28px | 600 | Card title |
| H6 | 16 / 24px | 600 | Compact section title |
| Body large | 16 / 24px | 400 | Introductory copy |
| Body | 14 / 22px | 400 | Default UI text |
| Body strong | 14 / 22px | 600 | Values/actions |
| Small | 12 / 18px | 400/500 | Metadata/help |
| Caption | 11 / 16px | 500 | Badges/timestamps |
| Micro | 10 / 14px | 600 | Rare uppercase labels |

Mobile: H1 36/44, H2 30/38, H3 26/34. Avoid body text below 12px.

## Spacing and layout

Base unit: **4px**.

Scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`.

- Desktop page max-width: 1200px.
- Data/payment workflow max-width: 960px.
- Desktop page gutters: 32–48px.
- Tablet gutters: 24px.
- Mobile gutters: 16px.
- Card padding: 24px desktop, 16px mobile.
- Section spacing: 32–48px.
- Dense row height: 48px; standard row: 56–64px.

Responsive recommendations:

- Compact mobile: below 480px.
- Mobile/tablet: below 768px.
- Desktop: 768–1199px.
- Wide desktop: 1200px and above.

## Shape, borders, and elevation

- Radius XS: 4px — badges and tiny controls.
- Radius SM: 6px — compact buttons.
- Radius MD: 8px — inputs and standard buttons.
- Radius LG: 12px — cards and menus.
- Radius XL: 16px — prominent review panels/modals.
- Radius pill: 999px — status chips only.
- Default border: 1px solid subtle border.
- Avoid large soft shadows. Prefer borders and surface contrast.
- Floating menu shadow: `0 8px 24px rgba(0,0,0,.28)`.
- Modal shadow: `0 20px 60px rgba(0,0,0,.38)`.

## Components

### Buttons

Primary:

- Yellow background, near-black label.
- 40px standard height; 48px prominent payment action.
- 8px radius; 14px semibold label.
- Hover uses `#F0B90B`; active uses `#D9A400`.
- Disabled uses neutral surface and disabled text—not translucent yellow.

Secondary:

- Transparent or Surface 2 background.
- Strong neutral border and primary text.
- Yellow border/text only for selected or brand-specific secondary actions.

Danger:

- Soft red background for ordinary destructive actions.
- Solid red only for final irreversible confirmation.

### Links

- Yellow/gold on dark surfaces; darker gold on white surfaces for contrast.
- Underline on hover/focus, and always underline links inside paragraphs.
- Never use yellow for non-interactive text adjacent to links.

### Inputs and textareas

- 48px standard control height.
- Surface 2 fill with 1px subtle border.
- Primary text, tertiary placeholder.
- Focus: brand-yellow border plus 3px focus ring.
- Error: red border, red helper text, visible error icon.
- Labels sit above controls; placeholders never replace labels.
- Monospace only for addresses/IDs, not ordinary form copy.

### Cards and boxes

- Canvas → Surface 1 card → Surface 2 nested section.
- 12px radius, 1px subtle border, no shadow by default.
- Review cards use a clear header, definition-list rows, warning block, then one primary action.
- Merchant/QR text is explicitly labeled **Untrusted information**.

### Navigation and menus

- Dark persistent sidebar on desktop; compact drawer/bottom navigation on mobile.
- Active item: Surface 3 background, primary text, narrow yellow indicator.
- Submenus are indented 12–16px and use smaller labels—not separate oversized cards.
- Keep the approved hierarchy: **Binance → Binance Pay** and **Agentic Wallet → x402**, with Activity and Settings as peers.

### Status and prices

- Positive values: `#28A473`.
- Negative values: `#F63C55`.
- Pending: amber/yellow, never green.
- Status badges use soft fills, icon + text, and pill radius.
- Transaction IDs are truncated by default with explicit copy/reveal controls.

### Tables and transaction lists

- 52–56px rows, subtle separators, no zebra stripes by default.
- Numeric columns right aligned with tabular numerals.
- Mobile converts rows into stacked key/value cards.
- Keep network, asset, amount, status, and timestamp visible before secondary metadata.

### Modals

- Max-width 520px for confirmations, 720px for detail views.
- 16px radius, Surface 1 background, strong title hierarchy.
- Sticky footer for irreversible actions.
- Escape/close is disabled only while an irreversible request is actively submitting.

## Accessibility rules

- Preserve at least 4.5:1 contrast for normal text and 3:1 for large text/icons.
- Yellow must usually carry dark text; yellow text on white requires the darker link token.
- Every interactive element gets a visible keyboard focus state.
- Minimum pointer target: 40×40px; preferred mobile target: 44×44px.
- Do not communicate payment status through color alone.
- Honor `prefers-reduced-motion`.
- Loading states must retain button width and announce progress text.

## Production application

Concept 07 is implemented on `design/concept-07-integration`: warm light workspace, dark persistent/sidebar drawer navigation, Manrope throughout, restrained yellow primary actions, semibold controls, semantic status labels, and shared API-backed payment workflows. Keep the design lab until Mark gives final visual approval, and do not merge this branch before that review.
