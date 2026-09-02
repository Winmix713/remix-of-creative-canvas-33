# 03 — State Model, Validation and Sharing

Covers `STATE-01` … `STATE-05` and `SEC-07`.

## 3.1 The problem with `deepMerge` on untrusted input (`STATE-02`)

```js
// current
const parsed = JSON.parse(decodeURIComponent(escape(atob(hash.slice(2)))));
state = deepMerge(clone(DEFAULTS), parsed);
```

`deepMerge` only checks "is this an object?" before recursing, and "is this not `undefined`?"
before assigning. Everything else passes through:

| Hostile payload | Result today |
| --- | --- |
| `{"blur":{"layers":100000}}` | `clamp(layers, 1, 14)` saves the preview, but the CSS/React exports print `100000`, and the inspector slider goes out of range. |
| `{"blur":{"amount":"1e9"}}` | String concatenates into `blur(1e9px)` in the export. |
| `{"fade":{"direction":"nonsense"}}` | `DIR_CSS[dir]` is `undefined` → `linear-gradient(undefined, …)`, the whole fade silently disappears. |
| `{"fade":{"curve":"toString"}}` | `CURVES[curve]` resolves to `Object.prototype.toString`, which is not a curve → `ease(t)` returns a string → `NaN%` stops. |
| `{"glow":{"hue":{"x":1}}}` | Object interpolated into `hsl([object Object] …)`. |
| `{"ui":{"mode":"__proto__"}}` | `MODES[mode]` is `undefined` → the header render throws. |
| Deeply nested payload | `deepMerge` recursion depth is attacker-controlled. |

The defence is not a better merge. It is **validate, then construct**: never assign a foreign
key at all.

## 3.2 Target: a declarative schema

Single source of truth for ranges, enums and defaults — the same table used by the inspector
sliders, the validator, the randomizer and the exporters.

```ts
// src/state/schema.ts
export const SCHEMA = {
  glow: {
    on:        { type: "bool" },
    hue:       { type: "int",  min: 0,  max: 360, unit: "°" },
    intensity: { type: "int",  min: 0,  max: 100, unit: "%" },
    x:         { type: "int",  min: 0,  max: 100, unit: "%" },
    y:         { type: "int",  min: 0,  max: 100, unit: "%" },
    scale:     { type: "int",  min: 10, max: 200, unit: "%" },
  },
  fade: {
    on:        { type: "bool" },
    opacity:   { type: "int",  min: 0,  max: 100, unit: "%" },
    coverage:  { type: "int",  min: 5,  max: 100, unit: "%" },
    direction: { type: "enum", values: ["top", "bottom", "left", "right"] },
    curve:     { type: "enum", values: CURVE_KEYS },
  },
  blur: {
    on:        { type: "bool" },
    amount:    { type: "int",  min: 0,  max: 64,  unit: "px" },
    coverage:  { type: "int",  min: 5,  max: 100, unit: "%" },
    layers:    { type: "int",  min: 1,  max: 32 },
    curve:     { type: "enum", values: CURVE_KEYS },
  },
  ui: {
    mode:    { type: "enum", values: ["glow", "fade", "blur", "studio"] },
    frame:   { type: "enum", values: ["browser", "phone", "plain"] },
    scene:   { type: "enum", values: ["mesh", "photo", "solid"] },
    format:  { type: "enum", values: ["css", "tailwind", "react"] },
    dark:    { type: "bool" },
    content: { type: "bool" },
    perf:    { type: "enum", values: ["auto", "quality", "performance"] },
    open:    { glow: { type: "bool" }, fade: { type: "bool" }, blur: { type: "bool" } },
  },
} as const;
```

Validator contract:

```ts
export function parseState(input: unknown): { state: State; repaired: string[] } {
  // 1. walk SCHEMA (never the input) — unknown keys are ignored by construction
  // 2. wrong type or out-of-range  -> use DEFAULTS value, push a path into `repaired`
  // 3. int fields: Number.isFinite, Math.round, clamp to [min, max]
  // 4. enum fields: strict `values.includes(v)` using own-property checks only
  // 5. never touch __proto__ / constructor / prototype
  // 6. return a freshly built object; the input object is never retained
}
```

Because the result is *built from the schema*, prototype pollution and unknown-key injection
are structurally impossible, and `repaired` gives the UI something honest to say:
"Loaded shared composition — 2 values were out of range and reset."

If a runtime dependency is acceptable, Zod expresses the same thing with less code; the schema
table is still worth keeping because the inspector needs `min`/`max`/`unit` anyway.

## 3.3 Versioning and migration (`STATE-01`)

Store the version *inside* the payload rather than only in the key name:

```ts
const STORAGE_KEY = "effect-studio";
const VERSION = 3;

type Envelope = { v: number; state: unknown };

const MIGRATIONS: Record<number, (s: any) => any> = {
  1: (s) => ({ ...s, blur: { ...s.blur, curve: "cubic" } }),   // v1 had no curve
  2: (s) => ({ ...s, ui: { ...s.ui, perf: "auto" } }),         // v2 had no perf mode
};

function migrate(env: Envelope) {
  let { v, state } = env;
  while (v < VERSION) { state = (MIGRATIONS[v] ?? ((x: any) => x))(state); v++; }
  return parseState(state).state;   // validation always runs last
}
```

Rules:
- Read the legacy `effect-studio:v2` key once, migrate it, write the new envelope, delete the old key.
- Unknown/newer `v` → discard and fall back to `DEFAULTS`, with a toast. Never merge a payload
  from a future version.
- Every migration is pure and has a unit test with a captured real-world payload.

## 3.4 Full replacement instead of shallow assign (`STATE-04`)

```js
// current
commit((s) => Object.assign(s, clone(DEFAULTS)));
```

`Object.assign` replaces only the four top-level keys. It works today by coincidence. Because
the store already clones on every commit, the honest form is to replace the state reference:

```ts
// target
const setState = (next: State) => commit(() => structuredClone(next));  // reducer returns new state
resetAll()   => setState(DEFAULTS);
applyPreset(p) => setState(mergePreset(state, p));   // explicit, field-by-field merge
loadShared(x)  => setState(parseState(x).state);
```

Make `commit(mutator)` return the next state rather than mutating in place, so history entries
are guaranteed to be independent snapshots and a stale nested reference cannot leak between
them. Note that the preset path already has a latent bug of the same family:
`{ ...s.glow, ...p.glow, on: !!p.glow.on }` relies on presets using `0`/`1` for `on`, while the
schema says boolean — normalise presets to booleans and validate them with `parseState` too.

## 3.5 Share links (`STATE-03`)

```js
// current
const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
```

Full JSON is ≈420 bytes today → ≈560 base64 characters. That is fine now, but the fragment
budget in practice is ~2000 characters (IE-era 2083 limit still enforced by some proxies,
messaging apps truncate earlier), and the payload grows with every new field.

**Target: three-step encoding.**

1. **Diff against defaults.** Only serialize fields that differ from `DEFAULTS`. Most shares
   collapse to a handful of values.
2. **Short keys.** A fixed, versioned key table: `{glow:g, fade:f, blur:b, ui:u, hue:h,
   intensity:i, coverage:c, direction:d, curve:e, amount:a, layers:l, opacity:o, scale:s}`. The
   table is append-only and versioned with the payload.
3. **Deflate + base64url.**

```ts
async function encodeShare(state: State): Promise<string> {
  const payload = shorten(diffFromDefaults(state));
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const deflated = await compress(bytes, "deflate-raw");  // CompressionStream
  return `v${VERSION}.${base64url(deflated)}`;
}
```

`CompressionStream("deflate-raw")` is available in all current evergreen browsers; fall back to
uncompressed base64url with a `v3u.` prefix when it is missing. Expect ~60–70 % reduction, so a
typical link lands under 150 characters.

**Size budget and fallback.** If the encoded link exceeds `MAX_HASH = 1800` characters:

- Offer a storage-backed share ID: `POST /api/public/share` stores the validated payload and
  returns a short slug (`/s/7Kq2Xb`); the link becomes ~30 characters. Because the endpoint is
  public, it must validate with the same schema, rate-limit by IP, cap the body size, and store
  no user data beyond the composition.
- Until such a backend exists, degrade explicitly: copy the long link and warn the user that
  some clients may truncate it. Never silently produce a broken link.

**Reading a link.** `#s=` (legacy) and the new `v3.` form both route through `parseState`.
After a successful load, replace the hash with `history.replaceState` so a later manual reload
does not resurrect a stale composition, and record a single history entry so the user can undo
back to their previous work rather than losing it.

## 3.6 Persistence feedback (`STATE-05`)

- Keep the 400 ms debounce, but flush on `visibilitychange` → `hidden` and on `pagehide` so the
  last edit is never lost.
- Track a `dirty` flag: set on mutation, cleared when the write resolves. This is what the
  "Saved / Unsaved" indicator in `10-ux-roadmap.md` reads.
- On write failure (quota, Safari private mode) stop swallowing the error: set a
  `persistence: "unavailable"` flag, show one toast, and switch the UI label to
  "Not saved — storage unavailable" so the user knows to use a share link instead.
