import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { pdfjsAssets } from './vite.pdfjs-assets.ts';

// The displayed version (footer, StatusBar) is package.json's, ticked on every
// version-eligible commit. It replaced a count of main's commit subjects on
// 2026-11-03, so it needs no git history and builds the same from Cloudflare
// Pages' shallow clone as anywhere else.
function appVersion(): string {
	return JSON.parse(readFileSync('package.json', 'utf8')).version;
}

// static/qpdf.wasm is a copy of the installed build (CI fails if they differ),
// so the installed version names the build that is actually served.
function qpdfVersion(): string {
	const pkg = readFileSync('node_modules/@neslinesli93/qpdf-wasm/package.json', 'utf8');
	return JSON.parse(pkg).version;
}

export default defineConfig(({ mode }) => ({
	define: {
		__APP_VERSION__: JSON.stringify(appVersion())
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		pdfjsAssets(),
		SvelteKitPWA({
			disable: mode === 'development',
			// 'prompt', never 'autoUpdate': the open documents live only in memory,
			// so a service worker that activated itself would reload the tab and
			// wipe the user's work mid-edit. A new SW waits until the user accepts
			// the update toast (src/lib/stores/pwa.svelte.ts).
			registerType: 'prompt',
			// Registered from +layout.svelte instead; the generated registerSW.js
			// had no <script> to load it (adapter-static writes no injectable HTML).
			injectRegister: false,
			// SPA: precache the adapter fallback as "/" so the navigation route can
			// serve the app offline (without it the route pointed at an unprecached URL).
			kit: { adapterFallback: 'index.html', spa: true },
			manifest: {
				name: 'KeMeK PDF Lab',
				short_name: 'PDF Lab',
				description: 'Privacy-first PDF manipulation tool — merge, split, reorder, rotate. Runs entirely in your browser.',
				theme_color: '#15803d',
				background_color: '#f3f6f4',
				display: 'standalone',
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				// pdf.js's three image/colour decoders ARE precached (~420 KB): a scanned
				// or faxed PDF is ordinary input, and offline it would otherwise render
				// with its images missing. Its CMaps and font data stay runtime-cached
				// below; most documents never ask for them.
				globPatterns: ['**/*.{js,css,html,mjs,woff2,png,svg}', '**/pdfjs/*/wasm/*.wasm'],
				// The SW never needs its own script (update checks bypass it), and
				// the social card is for crawlers, not for working offline. The pdf.js
				// no-wasm fallbacks only run where WebAssembly is unavailable.
				globIgnores: ['**/sw.js', '**/workbox-*.js', '**/og-image.png', '**/pdfjs/**/*.js'],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
				// qpdf decrypt engine (~1.3MB) is deliberately NOT precached — most
				// users never open an encrypted PDF, so it stays out of the install
				// payload (note 'wasm' is absent from globPatterns above). Cache it on
				// first use instead, so unlock keeps working offline thereafter.
				// CacheFirst never revalidates and the URL never changes, so the
				// installed version is in the cache NAME: a qpdf bump starts a fresh
				// cache instead of pairing new JS glue with the old wasm forever.
				runtimeCaching: [
					{
						urlPattern: /\/qpdf\.wasm$/,
						handler: 'CacheFirst',
						options: {
							cacheName: `qpdf-wasm-${qpdfVersion()}`,
							expiration: { maxEntries: 1 },
							cacheableResponse: { statuses: [0, 200] }
						}
					},
					// Version-named URLs (vite.pdfjs-assets.ts) never change content, so
					// CacheFirst is exact; a pdfjs bump changes the URLs, and the old
					// version's entries age out under the entry cap.
					{
						urlPattern: /\/pdfjs\/[^/]+\/(cmaps|standard_fonts|iccs|wasm)\//,
						handler: 'CacheFirst',
						options: {
							cacheName: 'pdfjs-assets',
							expiration: { maxEntries: 300, purgeOnQuotaError: true },
							cacheableResponse: { statuses: [200] }
						}
					}
				]
			}
		})
	]
}));
