# 05 — Export Parity Specification

Covers `EXP-01` … `EXP-07`. All three exporters consume the `RenderModel` from
`04-render-model.md` with `forExport: true`, and must not perform arithmetic of their own.

## 5.1 Shared exporter contract

```ts
export type ExportOptions = {
  prefix: string;          // "es-"  -> .es-glow
  selector: "class" | "data" | "nested";
  useCssVars: boolean;     // emit --es-glow-color etc. and reference them
  language: "jsx" | "tsx"; // React exporter only
  includeComments: boolean;
  indent: 2 | 4;
};

export type Exporter = (model: RenderModel, opts: ExportOptions) => {
  code: string;
  filename: string;        // composite-layers.css | .html | .tsx
  mime: string;            // text/css | text/html | text/plain
};
```

Rules for every exporter:

- Output language is **English only** (`EXP-06`); the empty state is `/* No active layers */`,
  `<!-- No active layers -->`, `// No active layers`.
- Numbers are formatted once, centrally: percentages to 1 dp, pixels to 2 dp, opacities to 2 dp,
  no trailing zeros beyond that.
- Correct MIME and extension per format (`EXP-07`): `text/css`, `text/html`, `text/plain`.
- The code shown in the UI and the code downloaded are byte-identical.

## 5.2 CSS exporter

### Glow — `EXP-01`

```css
/* current — one node, invented 48px blur, wrong opacity model */
.glow { … filter: blur(48px); opacity: 0.74; }
```

```css
/* target — the three nodes the preview actually renders */
.es-glow { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }

.es-glow__layer {
  position: absolute;
  left: 63%;
  top: 24%;
  transform: translate(-50%, -50%);
  aspect-ratio: 1;
  border-radius: 9999px;
  background: hsl(268 90% 65%);
  mix-blend-mode: screen;
}
.es-glow__layer--haze  { width: 180.4%; opacity: 0.37; filter: blur(48px); }
.es-glow__layer--bloom { width: 114.8%; opacity: 0.56; filter: blur(40px); }
.es-glow__layer--core  { width:  57.4%; opacity: 0.74; filter: blur(24px); }
```

Emitted from `model.glow.nodes` — one rule per node, no hard-coded values.

### Fade — `EXP-03`

The box comes from `model.fade.box`, so `direction: "left"` exports as:

```css
.es-fade {
  position: absolute;
  top: 0; bottom: 0; left: 0;
  width: 58%; height: 100%;
  opacity: 0.62;
  background: linear-gradient(to left, rgb(8 10 16 / 1.000) 0.0%, … rgb(8 10 16 / 0.000) 100.0%);
  pointer-events: none;
}
```

All 11 eased stops are printed verbatim from `model.fade.gradient`. No simplification to
`to bottom`, no `inset: auto 0 0 0`.

### Blur — `EXP-02`

```css
/* current — one generic rule, undefined --px, placeholder mask, count only in a comment */
.blur-wrap > div { backdrop-filter: blur(var(--px)); mask-image: linear-gradient(to top, transparent, #000, transparent); }
```

```css
/* target — the real steps, eased, with per-step masks */
.es-blur {
  position: absolute;
  inset: auto 0 0 0;
  height: 48%;
  pointer-events: none;
}
.es-blur > div { position: absolute; inset: 0; }

/* 16 layers, cubic easing, max 18px */
.es-blur > div:nth-child(1)  { backdrop-filter: blur(0.00px);  mask-image: linear-gradient(to top, transparent 0.0%,  #000 0.0%,   transparent 6.3%); }
.es-blur > div:nth-child(2)  { backdrop-filter: blur(0.01px);  mask-image: linear-gradient(to top, transparent 0.4%,  #000 6.7%,   transparent 13.0%); }
/* … one rule per step, generated from model.blur.steps … */
.es-blur > div:nth-child(16) { backdrop-filter: blur(18.00px); mask-image: linear-gradient(to top, transparent 93.8%, #000 100.0%, transparent 100.0%); }
```

Also emit the required markup as a comment (16 empty `<div>`s), because CSS alone cannot create
the layer nodes — this is a real usability gap in the current export.

`-webkit-backdrop-filter` / `-webkit-mask-image`: emit them only when
`opts.includeComments === false` is not enough — the correct rule is to emit the **standard
property only** and let the consumer's build add prefixes. If prefixes are emitted, the
`-webkit-` form must come **before** the standard one; some CSS minifiers dedupe same-value
declarations and keep the last, which silently drops the standard property.

### CSS variables mode

With `opts.useCssVars`, hoist the tunables so the consumer can theme without regenerating:

```css
.es-root {
  --es-glow-color: hsl(268 90% 65%);
  --es-glow-x: 63%;
  --es-glow-y: 24%;
  --es-fade-opacity: 0.62;
  --es-blur-max: 18px;
}
```

Per-step blur values stay literal — they are derived, not tunable.

## 5.3 Tailwind exporter — `EXP-04`

The current output discards position, size, opacity, coverage, layer count and curve. Tailwind
can express all of it with arbitrary values; the strategy is: **utilities where a scale value is
exact, arbitrary values otherwise, `style` only for genuinely dynamic per-node numbers.**

```html
<!-- target, glow: three nodes, real geometry -->
<div class="pointer-events-none absolute inset-0 overflow-hidden">
  <div class="absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen
              left-[63%] top-[24%] w-[180.4%] opacity-[0.37] blur-[48px] bg-[hsl(268_90%_65%)]"></div>
  <div class="… w-[114.8%] opacity-[0.56] blur-[40px] bg-[hsl(268_90%_65%)]"></div>
  <div class="… w-[57.4%]  opacity-[0.74] blur-[24px] bg-[hsl(268_90%_65%)]"></div>
</div>

<!-- fade: anchored per direction, full eased gradient, real opacity -->
<div class="pointer-events-none absolute top-0 bottom-0 left-0 h-full w-[58%] opacity-[0.62]
            bg-[linear-gradient(to_left,rgb(8_10_16/1)_0%,…,rgb(8_10_16/0)_100%)]"></div>

<!-- blur: every step emitted -->
<div class="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] overflow-hidden">
  <div class="absolute inset-0 backdrop-blur-[0px]     [mask-image:linear-gradient(to_top,transparent_0%,#000_0%,transparent_6.3%)]"></div>
  <div class="absolute inset-0 backdrop-blur-[0.01px]  [mask-image:linear-gradient(to_top,transparent_0.4%,#000_6.7%,transparent_13%)]"></div>
  <!-- … 16 total … -->
</div>
```

Rules:
- Spaces inside arbitrary values become `_`; commas are preserved; slashes in `rgb(a b c / d)`
  are written `rgb(8_10_16/0.5)`.
- Never round geometry to the nearest Tailwind scale step — that is exactly the lossiness being fixed.
- Emit a leading comment listing the source values (`glow 268° 74% @ 63%/24% scale 82%`) so the
  snippet is auditable.
- Offer a "class-only" variant note: consumers with dynamic values should use CSS variables plus
  `bg-[hsl(var(--es-hue)_90%_65%)]`, since Tailwind cannot JIT runtime values.

## 5.4 React exporter — `EXP-05`

The output must compile standalone. Emit the wrapper **and** all referenced components with
types, or emit a single self-contained component — configurable.

```tsx
// target, opts.language === "tsx"
type GlowProps = {
  /** 0–360 */ hue: number;
  /** 0–100 */ intensity: number;
  /** 0–100, centre X */ x: number;
  /** 0–100, centre Y */ y: number;
  /** 10–200, core diameter as % of frame */ scale: number;
  className?: string;
};

const GLOW_NODES = [
  { key: "haze",  size: 2.2, alpha: 0.5,  blur: 48 },
  { key: "bloom", size: 1.4, alpha: 0.75, blur: 40 },
  { key: "core",  size: 0.7, alpha: 1,    blur: 24 },
] as const;

export function Glow({ hue, intensity, x, y, scale, className }: GlowProps) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      {GLOW_NODES.map((n) => (
        <div
          key={n.key}
          className="absolute aspect-square rounded-full mix-blend-screen"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${scale * n.size}%`,
            transform: "translate(-50%, -50%)",
            background: `hsl(${hue} 90% 65%)`,
            opacity: Math.min(1, (intensity * n.alpha) / 100),
            filter: `blur(${n.blur}px)`,
          }}
        />
      ))}
    </div>
  );
}
```

Also emitted, in the same file:

- `CURVES` and the `CurveKey` type (the components need easing at runtime).
- `Fade` with `FadeProps` (`opacity`, `coverage`, `direction: "top" | "bottom" | "left" | "right"`,
  `curve: CurveKey`), computing `box` and stops with the shared derivation rules.
- `ProgressiveBlur` with `ProgressiveBlurProps` (`amount`, `coverage`, `layers`, `curve`,
  optional `maxLayers` for the consumer's own performance cap), mapping steps to nodes.
- `CompositeLayers` composing the active layers with the current values as defaults.
- For `language: "jsx"`, the same code with types stripped and the prop contract kept as JSDoc.

The React export must be checked by the project's own typechecker: keep the generated component
source in the repo as a fixture (`src/exporters/__fixtures__/react.expected.tsx`) so `tsc`
compiles it in CI. A generated snippet that does not typecheck is a build failure, not a docs bug.

## 5.5 Parity test checklist

| # | Test | Asserts |
| --- | --- | --- |
| 1 | 3 presets × 3 formats golden snapshots | no silent output drift |
| 2 | `blur.layers` 1, 2, 7, 16, 32 | exported step count equals the requested count (`EXP-02`) |
| 3 | 4 fade directions | exported box and gradient direction match the preview (`EXP-03`) |
| 4 | 6 curves | eased values appear in the output; no `NaN`, no `undefined` |
| 5 | glow in all three formats | three nodes present with the 2.2/1.4/0.7 and 0.5/0.75/1 ratios (`EXP-01`) |
| 6 | Tailwind round-trip | every numeric field of the state appears somewhere in the snippet (`EXP-04`) |
| 7 | React export | compiles under `tsc --strict`; rendering it produces the same computed styles as the preview (`EXP-05`) |
| 8 | performance cap | with `env.maxLayers = 6`, preview caps but export still emits the full count |
| 9 | all layers off | each format returns its English empty-state string |
| 10 | property-based, 500 random valid states | output contains no `undefined`, `NaN`, `[object Object]` |
