import { build } from 'esbuild';

/**
 * Supabase Edge Functions run on Deno while the application source is authored
 * for Vite. Bundling removes Vite's extensionless import graph without copying
 * or forking the forecasting model. The generated file is deliberately ignored
 * by review: regenerate it whenever engine-core changes.
 */
await build({
  entryPoints: ['src/engine-core/index.ts'],
  outfile: 'supabase/functions/_shared/engine-core.bundle.ts',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: false,
  legalComments: 'none'
});

console.log('WinMix engine-core bundle ready for Supabase Edge Functions.');
