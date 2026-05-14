import { defineConfig } from 'vitest/config';

// Pure-logic only — co-located *.test.ts next to source, Node env. No
// SvelteKit plugin: tests target binary/security boundaries (pdf-lib
// round-trips, magic-byte sniffs), not Svelte components.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
