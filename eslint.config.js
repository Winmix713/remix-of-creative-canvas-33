import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// ---------------------------------------------------------------------------
// Canonical lint configuration for WinMix.
//
// This is a Vite + React 18 SPA. It is NOT a TanStack Start application, so the
// generated `no-restricted-imports` / `server-only` rule was removed: it
// enforced a framework convention this project does not use and could only
// produce misleading guidance. There is exactly one ESLint configuration style
// here (this flat config); the legacy `.eslintrc.cjs` was deleted.
//
// Prettier is deliberately NOT part of the lint gate. Formatting is owned by
// `.prettierrc`; a repository-wide reformat is a separate, deliberate change,
// so `eslint-plugin-prettier` is neither imported nor required. Do not add it
// back to `rules` without the owner's sign-off on a reformat.
//
// Existing lint debt is dispositioned with ESLint's own bulk-suppression
// mechanism (`eslint-suppressions.json`, generated with `--suppress-all`), not
// with `--quiet` and not by deleting or downgrading rules. Every remaining
// problem is still printed on each run as "suppressed", the baseline file is
// reviewable and countable, and any NEW violation fails `npm run lint`.
// ---------------------------------------------------------------------------

export default tseslint.config(
  {
    // Build output, dependency trees and coverage are not source. The legacy
    // flat-config form `"dist"` does not match files *inside* a directory, so
    // these are written as explicit `dir/**` globs.
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".output/**",
      ".vinxi/**",
    ],
  },

  // Application, test and database-integration TypeScript.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // `no-unused-vars` (core) is core-JS-only and cannot see type positions;
      // the typescript-eslint guidance is to disable it and use the TS-aware
      // rule instead. Both are real rules — nothing is removed from the gate:
      // the TS-aware rule is enabled here (it was switched off in the previous
      // config) and its pre-existing violations are baselined in
      // `eslint-suppressions.json`, so new unused bindings fail lint.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },

  // Node-side tooling: build/CI scripts and the Vite/Vitest/PostCSS configs.
  {
    files: ["scripts/**/*.{js,mjs,cjs}", "*.config.{js,mjs,cjs,ts}", "*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
);
