import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Pure-logic only — co-located *.test.ts next to source, Node env. The Svelte
// compiler plugin (not SvelteKit's) is here only so rune modules (*.svelte.ts,
// the stores) compile: tests target logic and binary/security boundaries
// (undo/redo, pdf-lib round-trips, magic-byte sniffs), not components.
// `#lib/...` imports need no alias: they are package.json subpath imports,
// which Vite resolves itself.
export default defineConfig({
  plugins: [svelte()],
  test: {
    // Root-level vite.*.test.ts: the build's own helpers (third-party notices).
    include: ['src/**/*.test.ts', 'vite.*.test.ts'],
    environment: 'node'
  }
});
