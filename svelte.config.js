import adapter from '@sveltejs/adapter-static';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		// Static SPA for Cloudflare Pages: every route falls back to index.html
		// (static/_redirects), and nothing server-side exists to adapt to.
		adapter: adapter({
			fallback: 'index.html'
		}),
		// Inline CSS into the HTML <head> instead of a render-blocking external
		// <link>. Without this, first paint — including the static boot loader in
		// app.html — blocks on a separate CSS fetch (a long blank over a slow /
		// tailnet connection). Inlined CSS arrives with the HTML and paints in one
		// shot. Threshold covers the current layout (~17KB) + route (~34KB) CSS
		// with headroom; any file above it falls back to an external link.
		inlineStyleThreshold: 50_000
	}
};

export default config;
