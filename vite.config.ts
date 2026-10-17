import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const clean = (val?: string) => (val || '').replace(/^[=\s"']+|[=\s"']+$/g, '').trim();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      clean(process.env.VITE_SUPABASE_URL) || 'https://dpmyxypqcsugycqhifaf.supabase.co'
    ),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
      clean(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) || 'sb_publishable_Xll_LdXYYBtizcduj2aPDQ_tqkI5r1S'
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
