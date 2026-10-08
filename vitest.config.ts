import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['tests/*.ui.spec.ts','tests/*.ui.spec.tsx'],pool:'forks',poolOptions:{forks:{singleFork:true}}}});
