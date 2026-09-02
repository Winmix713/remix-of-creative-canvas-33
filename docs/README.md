# Effect Studio — Improvement Documentation

Complete documentation of the modifications, fixes and improvements recommended for the
`index.html` prototype (Effect Studio — Composite Layer Editor, single-file build,
1740 lines, ~760 lines of inline JavaScript).

## How to read these documents

1. Start with [01-audit.md](./01-audit.md). It inventories the prototype as it exists today
   and assigns every issue a **stable finding ID** (e.g. `SEC-01`, `EXP-03`, `PERF-02`).
2. Every later document references those IDs. If you only want to fix one thing, search for
   its ID across the folder.
3. [11-implementation-plan.md](./11-implementation-plan.md) is the execution order, with
   phases and acceptance criteria. Start there if you are the person doing the work.

## Documents

| File | Scope |
| --- | --- |
| [01-audit.md](./01-audit.md) | Current-state audit, finding register |
| [02-security.md](./02-security.md) | CDN removal, CSP and headers, `innerHTML`/XSS, external image |
| [03-state-model.md](./03-state-model.md) | Schema validation, versioning, migrations, share links |
| [04-render-model.md](./04-render-model.md) | The single normalized render model |
| [05-exporters.md](./05-exporters.md) | CSS / Tailwind / React export parity spec |
| [06-interaction.md](./06-interaction.md) | Numeric inputs, slider commits, keyboard, dialog |
| [07-accessibility.md](./07-accessibility.md) | ARIA, keyboard navigation, live regions |
| [08-performance.md](./08-performance.md) | Blur layer budget, mobile mode, DOM updates, `will-change` |
| [09-architecture.md](./09-architecture.md) | Module split and React/Next component breakdown |
| [10-ux-roadmap.md](./10-ux-roadmap.md) | Save state, export settings, seeds, presets, image picker |
| [11-implementation-plan.md](./11-implementation-plan.md) | Phased plan, risk, acceptance criteria |

## Priorities at a glance

The three highest-value items, in order:

1. **Export/preview parity** — one normalized render model feeding preview and all three
   exporters (`04`, `05`).
2. **Blur performance on mobile** — device-tiered layer budget and a real performance mode
   (`08`).
3. **Security hardening** — remove runtime CDNs, remove `innerHTML` from message paths, add
   CSP and baseline headers (`02`).

## Conventions used in these docs

- Identifiers from the prototype (`DEFAULTS`, `applyEffects`, `maskFor`, `live`, `commit`,
  `fadeGradient`, `MAX_LIVE_LAYERS`) are kept verbatim so each recommendation maps onto a
  concrete place in the existing file.
- Severity: **critical** (must fix before public deploy), **major** (visible correctness or
  performance defect), **minor** (polish).
- Code blocks marked `// current` show today's behaviour; `// target` shows the proposed
  behaviour.
