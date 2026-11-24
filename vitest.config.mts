import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same "@/…" paths as tsconfig.json.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
