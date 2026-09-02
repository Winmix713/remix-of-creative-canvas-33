# 02 — Security and Dependencies

Covers `SEC-01` … `SEC-07`.

## 2.1 Remove the Tailwind CDN (`SEC-01`)

`https://cdn.tailwindcss.com` compiles Tailwind in the browser. Consequences: a third-party
script with full DOM and `localStorage` access, no Subresource Integrity, a flash of unstyled
content, and no way to write a strict CSP. It is explicitly not for production.

**Target:** build-time Tailwind.

```bash
npm i -D tailwindcss @tailwindcss/vite vite
```

```css
/* src/styles.css */
@import "tailwindcss";

@theme {
  --color-bg: #0b0c0f;
  --color-s1: #111217;
  --color-s2: #15171d;
  --color-s3: #1b1d24;
  --color-accent: #a78bfa;
  --font-display: "Space Grotesk", Inter, sans-serif;
  --font-sans: Inter, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

Migration notes:
- The prototype's arbitrary values (`bg-white/[0.035]`, `rounded-[1.25rem]`,
  `shadow-[0_2rem_5rem_-1.5rem_rgb(0_0_0)]`, `z-[35]`) all work unchanged in a compiled build.
- The `:root` custom properties in the inline `<style>` move into `@theme`, so `--accent` and
  friends become both CSS variables and Tailwind utilities.
- `.rng`, `.card`, `.scroll-thin` and the other hand-written rules move to a real stylesheet
  (or `@utility` definitions) instead of an inline `<style>` block.

## 2.2 Remove the Iconify CDN (`SEC-02`)

`<iconify-icon icon="solar:...">` fetches icon data from the Iconify API at runtime — a
network request per icon set, and a script tag that cannot be covered by a strict CSP.

**Target:** install the icon data and inline the SVGs at build time.

```bash
npm i @iconify/react @iconify-json/solar
```

```tsx
import { Icon } from "@iconify/react";
import undoIcon from "@iconify-icons/solar/arrow-left-linear";

<Icon icon={undoIcon} width={18} />;
```

Using the per-icon import form (`@iconify-icons/*` or `addIcon`) keeps the bundle to only the
icons actually used and removes all runtime icon fetching. For a plain-HTML build, an
equivalent step is a small script that replaces each `<iconify-icon>` with its inline `<svg>`
at build time.

## 2.3 Self-host the fonts

Google Fonts via `<link>` costs two extra origins and leaks referrer data.

```bash
npm i @fontsource-variable/inter @fontsource-variable/space-grotesk @fontsource-variable/jetbrains-mono
```

```css
@import "@fontsource-variable/inter";
@import "@fontsource-variable/space-grotesk";
@import "@fontsource-variable/jetbrains-mono";
```

If the fonts must stay remote, load them with `<link>` tags in the document head, never with a
CSS `@import` of a URL — bundlers resolve `@import` from the filesystem and the build fails.

## 2.4 The Photo scene image (`SEC-06`)

```js
// current
const PHOTO =
  "linear-gradient(180deg, rgb(7 12 20 / .10), rgb(7 12 20 / .45)), url('https://images.unsplash.com/photo-1519608487953-...') center/cover no-repeat";
```

Problems: an external dependency in the render path, a hotlink that can 404 or be rate
limited, no attribution, and no visual fallback — the scene degrades to an almost-black panel.

**Target:**

1. Ship a licensed image locally (`src/assets/scene-photo.jpg`), sized for the largest frame
   (≈1600 px wide) and served as AVIF/WebP with a JPEG fallback.
2. Render the scene as an `<img>` layer under the gradient rather than as a `background: url()`,
   so load failure is detectable:

```tsx
<img
  src={scenePhoto}
  alt=""
  aria-hidden="true"
  loading="lazy"
  decoding="async"
  onError={() => setPhotoFailed(true)}
  className="absolute inset-0 h-full w-full object-cover"
/>
```

3. When `photoFailed` is true, fall back to the `MESH` gradient and surface a single toast
   ("Scene image unavailable — using mesh"). Never leave the stage blank.
4. Keep the top gradient (`linear-gradient(180deg, …)`) as a separate absolutely positioned
   element so it applies to both the photo and the fallback.

## 2.5 `innerHTML` in the toast and inspector (`SEC-03`, `SEC-04`)

```js
// current
node.innerHTML = `<iconify-icon icon="${icon}" width="15" style="color:var(--accent)"></iconify-icon>${msg}`;
```

`msg` is a literal at every call site today. The moment a message includes a preset name typed
by the user, an imported file name, an error string from `catch (e) { toast(e.message) }`, or
anything decoded from the share hash, this becomes an injection point. Same for
`el.shortcutList.innerHTML` and the string-built inspector rows.

**Target — build nodes, assign text:**

```js
// target
function toast(message, iconName = "check-circle") {
  const node = document.createElement("div");
  node.className = TOAST_CLASS;

  const icon = createIcon(iconName);        // returns an <svg> from a fixed, known-good map
  const label = document.createElement("span");
  label.textContent = message;              // never innerHTML

  node.append(icon, label);
  toastsRoot.append(node);
  scheduleDismiss(node);
}
```

Rules to adopt project-wide:

- `textContent` for every value that is not a hard-coded literal in the source file.
- Icon names resolve through a whitelist map; an unknown name renders a neutral fallback glyph
  instead of being interpolated into markup.
- No template-string HTML in any render function (this is also what `PERF-02` requires).
- In React this comes for free — JSX escapes children; just never introduce
  `dangerouslySetInnerHTML`.
- The exported code shown in `<pre id="code">` is already set via `textContent`. Keep it that
  way: it is the largest untrusted-looking string in the app.

## 2.6 CSP and baseline headers (`SEC-05`)

Ship these as **response headers** from the host (a `<meta http-equiv>` CSP is a fallback and
cannot express `frame-ancestors`).

Target policy for the built, self-hosted app:

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'none';
  form-action 'none';
  frame-ancestors 'none';
  upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
```

Notes and interactions:

| Concern | Detail |
| --- | --- |
| `style-src 'self'` and inline styles | The renderer sets `node.style.*` properties, which is **not** blocked by CSP (that is DOM style, not an inline `style` attribute parsed from markup — and attribute styles are only blocked by `style-src-attr`). Keep the `<style>` block out of the built output and no `'unsafe-inline'` is required. |
| `img-src data: blob:` | Needed for the download `blob:` URL and any inlined SVG data URIs (the grain texture). |
| If the CDNs stay | The policy must add `script-src https://cdn.tailwindcss.com https://code.iconify.design 'unsafe-eval'` (Tailwind's browser JIT evaluates generated code), `style-src 'unsafe-inline'` (it injects a stylesheet), `connect-src https://api.iconify.design`, `font-src https://fonts.gstatic.com`, `style-src https://fonts.googleapis.com`, and `img-src https://images.unsplash.com`. That policy protects almost nothing — which is the practical argument for §2.1–2.4. |
| SRI | If any dependency must remain remote, pin it with `integrity` + `crossorigin="anonymous"`. `cdn.tailwindcss.com` is unversioned and therefore cannot be pinned. |

## 2.7 Other hardening

- Add `rel="noopener noreferrer"` to any future external link.
- Validate everything decoded from the URL hash before use (see `03-state-model.md`); treat the
  fragment as fully attacker-controlled input.
- Reject `__proto__`, `constructor` and `prototype` keys when reading external JSON, or build
  state field-by-field from a schema so unknown keys are never assigned.
- Add `npm audit` / dependency scanning to CI once there is a `package.json`.
