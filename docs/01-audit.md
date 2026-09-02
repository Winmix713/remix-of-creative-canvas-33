# 01 — Current-State Audit

## 1. What the prototype is

A single HTML file that renders a dark "Effect Studio" editor. Three ambient effect layers
(glow, gradient fade, progressive blur) are composed over a preview frame, controlled by an
inspector panel, and exported as CSS, Tailwind markup, or a React snippet.

Runtime dependencies loaded from the network at page load:

| Dependency | Source | Purpose |
| --- | --- | --- |
| Tailwind CSS | `https://cdn.tailwindcss.com` | All styling (JIT in the browser) |
| Iconify | `https://code.iconify.design/iconify-icon/2.1.0/...` | `<iconify-icon>` web component |
| Google Fonts | `fonts.googleapis.com` / `fonts.gstatic.com` | Inter, JetBrains Mono, Space Grotesk |
| Unsplash photo | `images.unsplash.com/photo-1519608487953-...` | The "Photo" scene background |

## 2. Structure of the inline script

The IIFE is organised in numbered sections:

| Section | Contents |
| --- | --- |
| 1. Model | `DEFAULTS`, `MODES`, `PRESETS`, `CURVES`, `FRAMES`, `SCENES`, `MESH`, `PHOTO`, `MAX_LIVE_LAYERS = 14` |
| 2. Store | `state`, `history {past, future}`, `loadFromUrlOrStorage`, `deepMerge`, `persist`, `commit`, `live`, `undo`, `redo`, `debounce`, `scheduleCode` |
| 3. Generators | `fadeGradient(dir, curve, steps = 10)`, `maskFor(i, count)` |
| 4. DOM cache | `el` map of `querySelector` results, pre-created blur layer nodes |
| 5–7. Rendering | `renderChrome`, `sliderRow`, `selectRow`, `toggleRow`, `layerPanel`, `renderInspector`, `applyEffects` |
| 8. Code generation | `renderCode`, `cssCode`, `tailwindCode`, `reactCode` |
| 9. Feedback | `toast`, shortcut `<dialog>` |
| 10. Events | one delegated `click` handler on `body`, `input`/`change` on the inspector, global `keydown` |
| 11. Init | `render()`, `loadFromUrlOrStorage()` |

## 3. State shape

```js
{
  glow: { on, hue, intensity, x, y, scale },
  fade: { on, opacity, coverage, direction, curve },
  blur: { on, amount, coverage, layers, curve },
  ui:   { mode, frame, scene, dark, content, format, open: { glow, fade, blur } }
}
```

Persisted under `localStorage["effect-studio:v2"]`; shareable as `#s=<base64(JSON)>`.

## 4. Finding register

### Security — `SEC`

| ID | Severity | Finding |
| --- | --- | --- |
| `SEC-01` | critical | Tailwind loaded from `cdn.tailwindcss.com` — a third-party script with full DOM access, no SRI, not production-supported. |
| `SEC-02` | critical | Iconify loaded from a CDN as a script that defines a custom element and fetches icon JSON on demand. |
| `SEC-03` | major | `toast()` builds its node with `innerHTML` from `msg` and `icon`. Safe today (all call sites are literals) but one user-derived message turns it into stored/reflected XSS. |
| `SEC-04` | major | `el.shortcutList.innerHTML` and every `renderInspector`/`layerPanel` path assemble HTML strings; the same injection surface, and unescaped label interpolation. |
| `SEC-05` | major | No Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, or `frame-ancestors`. |
| `SEC-06` | minor | The Photo scene depends on a remote Unsplash URL with no fallback; the scene renders as a bare dark gradient if the request fails or is blocked. |
| `SEC-07` | minor | Hash payload is fully attacker-controlled and merged into state with no validation (see `STATE-02`). |

### State — `STATE`

| ID | Severity | Finding |
| --- | --- | --- |
| `STATE-01` | major | The key is versioned (`:v2`) but there is no migration function; a `v1`-shaped or future-shaped blob is either ignored or silently merged. |
| `STATE-02` | critical | `deepMerge(clone(DEFAULTS), parsed)` accepts any type for any key. `{"blur":{"layers":1e9}}` or `{"fade":{"direction":"__proto__"}}` reaches the renderer. No schema validation. |
| `STATE-03` | major | Share link carries the entire state as base64 JSON in the fragment — no compression, no size budget, and it will grow with every feature. |
| `STATE-04` | minor | Reset does `Object.assign(s, clone(DEFAULTS))` — shallow. It works only because every top-level key is replaced wholesale; adding a nested default that is not a top-level key breaks it. |
| `STATE-05` | minor | `persist()` is debounced 400 ms with a silent `catch {}`; quota or private-mode failures are invisible to the user. |

### Export — `EXP`

| ID | Severity | Finding |
| --- | --- | --- |
| `EXP-01` | major | Live glow renders **three** stacked nodes (`haze` 2.2×/0.5α, `bloom` 1.4×/0.75α, `core` 0.7×/1α, each with a different Tailwind blur radius). `cssCode()` emits **one** `.glow` with a fixed `blur(48px)`. |
| `EXP-02` | major | Live blur emits `layers` (capped at `MAX_LIVE_LAYERS`) nodes, each with an eased `blur(px)` and a per-index `maskFor(i, count)` three-stop mask. The CSS export emits a single generic `.blur-wrap > div` rule with `blur(var(--px))` never defined and a symmetric placeholder mask. Layer count and easing are only mentioned in a comment. |
| `EXP-03` | major | Fade geometry differs: `applyEffects` sets `inset: 0`, then the direction edge to `0`, and sizes the cross axis, so `left`/`right`/`top` work. `cssCode()` hardcodes `inset: auto 0 0 0` — every non-`bottom` direction exports wrong. |
| `EXP-04` | major | Tailwind export drops position (`x`, `y`), size (`scale`), fade `opacity`/`coverage`, blur `amount`/`coverage`/`layers`, and all curve information; it emits fixed `blur-3xl`, `to-black/70`, `backdrop-blur-md`. |
| `EXP-05` | major | React export references `<Glow>`, `<Fade>`, `<ProgressiveBlur>` but never emits their implementations or prop types — the output does not compile in a fresh project. |
| `EXP-06` | minor | Export comments and the empty-state strings are Hungarian; the rest of the exported code is English. |
| `EXP-07` | minor | Download maps `tailwind → .html` with `type: "text/plain"`, and the CSS export has no class-name prefix or selector configuration. |

### Interaction — `UX`

| ID | Severity | Finding |
| --- | --- | --- |
| `UX-01` | major | The numeric input handler runs on `input` and does `Number(num.value) \|\| 0`. Clearing the field, or typing `-`, jumps the value to the minimum/0 mid-typing. |
| `UX-02` | major | The `change` listener commits `Number(input.value)` for **any** `input[data-layer]`, including the range that already committed through drag-end semantics — sliders can produce a duplicate history entry with the value the `live` pass already applied. |
| `UX-03` | minor | `Space` is intercepted globally and `preventDefault`ed whenever focus is not in an input — this steals `Space` from focused buttons, which is a native activation key. |
| `UX-04` | minor | The shortcut `<dialog>` can only be closed by the X button — no Escape handling wired to state, no backdrop click, no focus restoration. |
| `UX-05` | minor | `keydown` for `R` and `1–4` fires without checking modifier keys, so browser/OS chords can collide. |
| `UX-06` | minor | `#isolate` calls `live()` then `render()` — a full re-render for a boolean, and no history entry, so the isolate state cannot be undone. |

### Accessibility — `A11Y`

| ID | Severity | Finding |
| --- | --- | --- |
| `A11Y-01` | major | Range inputs have no `aria-valuetext` and no `aria-describedby` linking the visible unit; screen readers announce a bare number. |
| `A11Y-02` | major | `role="tablist"` elements (`#modes`, `#formats`) have no `aria-controls`, no `aria-selected` management contract, and no arrow-key handling or roving tabindex. |
| `A11Y-03` | major | The layer toggles convey state only visually — no `aria-pressed`/`aria-checked` and no `sr-only` "on/off" text. |
| `A11Y-04` | minor | `#title`, `#inspector-title`, `#layer-count` and `#stage-meta` change dynamically with no `aria-live`. |
| `A11Y-05` | minor | The logo link points at `#` and performs no navigation. |
| `A11Y-06` | minor | `<html lang="hu">` while much of the visible UI text is English; mixed-language content is not marked up. |
| `A11Y-07` | minor | The `<dialog>` does not return focus to `#help` on close. |

### Performance — `PERF`

| ID | Severity | Finding |
| --- | --- | --- |
| `PERF-01` | major | Up to `MAX_LIVE_LAYERS = 14` simultaneous `backdrop-filter` layers, each with a mask. On mid-range mobile GPUs this alone can miss frame budget, and it compounds with the glow's three `filter: blur()` nodes. |
| `PERF-02` | major | `renderInspector()` replaces the whole inspector via `innerHTML`, destroying and rebuilding every row; it runs on every `commit`, including accordion toggles and mode switches. Focus and caret position are lost. |
| `PERF-03` | minor | `maskFor(i, count)` is called twice per layer per frame (standard + `-webkit-`), rebuilding the same gradient string. |
| `PERF-04` | minor | No `will-change` discipline is defined; any future addition should be scoped to active interaction only, not left permanently on the blur/glow layers. |
| `PERF-05` | minor | `applyEffects()` rewrites `el.frame.className` as a full string every call, forcing style recalculation even when the frame did not change. |

### Architecture — `ARCH`

| ID | Severity | Finding |
| --- | --- | --- |
| `ARCH-01` | major | ~760 lines of application logic in one inline `<script>`: no modules, no tests, no type checking, no build step. |
| `ARCH-02` | major | Preview rendering and code generation each re-derive the effect geometry independently — the structural cause of every `EXP-*` finding. |
| `ARCH-03` | minor | Markup is duplicated in the file (the header/stage/inspector block appears twice, around lines 202 and 786), so IDs are duplicated and `querySelector` silently binds to the first occurrence. |
| `ARCH-04` | minor | No linting or formatting configuration accompanies the prototype. |

## 5. What is already good

Worth preserving through any refactor:

- The `commit` / `live` split (history points only on discrete changes, cheap updates during drag) is the right model.
- `fadeGradient` with 10 eased stops is a genuinely banding-free approach.
- Eased per-layer blur with masked steps is the correct progressive-blur technique.
- Delegated event handling keeps listener count constant.
- `scheduleCode()` coalescing code regeneration into one `requestAnimationFrame` is correct.
- Persisted UI state, undo/redo, presets, and shareable links are a coherent product surface.
