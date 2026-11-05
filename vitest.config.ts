import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Pure-logic only — co-located *.test.ts next to source, Node env. The Svelte
// compiler plugin (not SvelteKit's) is here only so rune modules (*.svelte.ts,
// the stores) compile: tests target logic and binary/security boundaries
// (undo/redo, pdf-lib round-trips, magic-byte sniffs), not components.
export default defineConfig({
  plugins: [svelte()],
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
