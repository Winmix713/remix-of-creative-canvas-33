import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['tests/*.ui.spec.ts','tests/*.ui.spec.tsx','src/__tests__/bttsCoreRecovery.test.ts'],pool:'forks',poolOptions:{forks:{singleFork:true}}}});
