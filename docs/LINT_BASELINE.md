# Lint baseline and disposition (F04)

`npm run lint` runs ESLint (`eslint .`) using the single canonical flat config
`eslint.config.js`. `npm run typecheck` runs `tsc --noEmit`. They are separate
gates and separate CI steps; neither one runs the other.

## How existing lint debt is recorded

Pre-existing violations were **not** silenced with `--quiet` and no rule was
deleted or downgraded. They are recorded with ESLint's own bulk-suppression
mechanism:

```sh
npx eslint . --suppress-all                              # record current debt
npx eslint .                                             # clean tree: exit 0
npx eslint . --prune-suppressions                        # burn down, see below
```

`eslint-suppressions.json` holds a per-file, per-rule **count**. Every future run
still prints the suppressed problems, so the debt stays visible and countable.
Any *new* violation of any rule fails `npm run lint`, and fixing one violation
without pruning the baseline fails too (ESLint reports the leftover suppression
as an unused suppression), which is what makes the burn-down monotonic.

## Measured debt on the canonical config (2026-10-19, reviewed snapshot `e338dbc` + PR A)

251 files linted. 168 problems total: 138 errors and 30 warnings.

**138 errors — suppressed in `eslint-suppressions.json` (45 files):**

| Rule | Count | Notes |
|---|---:|---|
| `@typescript-eslint/no-explicit-any` | 79 | widest debt item; burn down file by file |
| `react-hooks/refs` | 15 | rule appears with `eslint-plugin-react-hooks@7` (React Compiler rules); fixing these is a behaviour change, out of scope here |
| `react-hooks/set-state-in-effect` | 14 | idem |
| `@typescript-eslint/no-unused-vars` | 14 | rule was previously switched **off**; now enabled and baselined so new unused bindings fail |
| `no-unused-vars` (core) | 7 | `.mjs`/`.js` tooling block only |
| `no-control-regex` | 2 | |
| `no-useless-assignment` | 2 | |
| `no-empty`, `react-hooks/purity`, `prefer-const`, `preserve-caught-error`, `@typescript-eslint/ban-ts-comment` | 1 each | |

**30 warnings — left unsuppressed, visible on every run (do not fail the gate):**

| Rule | Count |
|---|---:|
| `react-refresh/only-export-components` | 18 (mostly Radix UI primitives re-exporting non-components) |
| `react-hooks/exhaustive-deps` | 12 |

Warnings are intentionally left visible rather than baselined: they are the
natural first burn-down target and a `--max-warnings` ratchet can be added once
the count is agreed.

## Deliberately not in the lint gate

- **Prettier.** `.prettierrc` exists and is used by the editor, but
  `eslint-plugin-prettier` is not imported and is not a dependency: a
  repository-wide reformat is a separate, deliberate change and must not ride
  along with a functional fix.
- **The `no-restricted-imports` / `server-only` rule** generated for TanStack
  Start. This is a Vite + React 18 SPA; the rule described a framework
  convention the project does not use and could only emit misleading advice. It
  was removed when the config was made canonical (`.eslintrc.cjs` deleted).
