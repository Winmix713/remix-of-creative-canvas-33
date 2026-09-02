# Effect Studio — Full Improvement Documentation (English)

Deliverable: a complete written documentation set (English) covering every modification, fix and improvement recommended for the attached `index.html` prototype. No changes to the prototype itself in this step — documentation only.

## What gets written

A `docs/` folder in the project:

```text
docs/
  README.md                  index + how to read the docs
  01-audit.md                current-state audit of index.html
  02-security.md             CDN removal, CSP/headers, innerHTML/XSS
  03-state-model.md          schema validation, versioning, share links
  04-render-model.md         single normalized render model spec
  05-exporters.md            CSS / Tailwind / React export parity spec
  06-interaction.md          inputs, sliders, history, keyboard, dialog
  07-accessibility.md        ARIA, keyboard nav, live regions
  08-performance.md          blur layers, mobile mode, will-change, DOM updates
  09-architecture.md         module split + React/Next component breakdown
  10-ux-roadmap.md           save state, export settings, seeds, presets
  11-implementation-plan.md  prioritized phases, acceptance criteria
```

## Content of each document

**01 Audit** — inventory of the prototype as built: state shape (`DEFAULTS`, `MODES`, `PRESETS`, `CURVES`, `FRAMES`, `SCENES`), store with history/persist/hash-share, layer renderers, three exporters, toast + dialog. Each finding gets a stable ID (e.g. `SEC-01`, `EXP-03`) referenced by later documents, with severity and file/line anchors.

**02 Security** — replace `cdn.tailwindcss.com` with a build-time Tailwind pipeline and Iconify CDN with an installed icon package; local/bundled image asset for the Photo scene plus an `onerror` fallback gradient; convert `toast()` from `innerHTML` to element construction with `textContent`; a concrete CSP header/meta example plus `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`, and notes on what each header breaks if CDNs stay.

**03 State model** — versioned persistence key with an explicit migration function; a validation schema (per-field type, range, allowed enum values) applied to both `localStorage` and hash payloads before merge; replace `deepMerge` on untrusted input with validate-then-build-from-defaults; full-state replacement instead of shallow `Object.assign`; share-link strategy: compact key encoding + deflate + base64url, with size budget and a fallback path (server-side or storage-backed share ID) when the URL exceeds the limit.

**04 Render model** — specification of one normalized model derived from state (glow layer list with blur radius/opacity/position/blend, fade stop array, blur step list with mask ranges and easing), consumed by the live preview and all exporters. Includes the data structures, the derivation rules, and the invariant that preview and export must be byte-comparable.

**05 Exporters** — per-format gaps and required output: CSS must emit all three glow layers, the real blur layer count with easing-derived masks, and direction-correct fade geometry; Tailwind must stop dropping position, size, opacity and curve (documented arbitrary-value strategy); React export must emit component implementations plus TypeScript types and props. Includes worked before/after output examples and a parity test checklist.

**06 Interaction** — numeric inputs validated on `change`/`blur` with clamping and empty-value handling instead of coercing to `0`; explicit commit boundaries for sliders (`pointerdown` snapshot, live during drag, single commit on release; no duplicate commit from `change`); `Space` handling and `preventDefault` rules; dialog closing via Escape, backdrop click and X, with focus return.

**07 Accessibility** — `aria-valuetext` and `aria-describedby` for ranges with unit association; `aria-controls` plus arrow-key roving tabindex for the tablists; `sr-only` on/off text for toggles; `aria-live` policy for dynamically changing titles and layer count (and why the toast region stays `polite`); real navigation target for the logo link.

**08 Performance** — replace full `innerHTML` re-renders with targeted updates (keyed inspector rows, CSS-variable-driven layer updates); blur layer budget: device-tier detection, reduced layer count on mobile, explicit "performance mode" toggle and its interaction with export (export keeps full quality); `will-change` applied only around active interaction; measurement method and target frame budget.

**09 Architecture** — the module split (`state`, `effects/glow|fade|blur`, `exporters/css|tailwind|react`, `ui/inspector`, `ui/toast`) with each module's public API and dependency direction, plus the React/Next.js component breakdown (Header, PreviewCanvas, Inspector, LayerPanel, ExportPanel) and where state lives.

**10 UX roadmap** — unsaved/saved indicator semantics; Export settings panel (prefix, selector, CSS variables on/off, TS vs JSX); clipboard fallback (`textarea` + manual copy dialog) when the Clipboard API is unavailable; Photo scene image picker and user upload; seeded PRNG so randomize is reproducible and shareable; preset thumbnails/tooltips.

**11 Implementation plan** — phased ordering with the three primary items first (export/preview parity, blur mobile performance, CDN + `innerHTML` hardening), then state validation, a11y, architecture split, UX. Each phase lists scope, risk, and acceptance criteria.

## Notes

- Documentation language: English. Code identifiers keep their current names so the docs map onto the existing file.
- All docs are markdown, cross-referenced by finding ID, and written so they can be handed to another developer without the chat context.
