import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pure-logic only — co-located *.test.ts next to source, Node env. No
// SvelteKit plugin: tests target binary/security boundaries (pdf-lib
// round-trips, magic-byte sniffs), not Svelte components.
export default defineConfig({
  resolve: {
    // Mirror SvelteKit's $lib alias so source files that import via $lib
    // are reachable from tests without dragging in the SvelteKit plugin.
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url))
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
