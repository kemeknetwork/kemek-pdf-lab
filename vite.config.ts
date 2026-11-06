import adapter from '@sveltejs/adapter-static';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { withPwa } from '@vite-pwa/sveltekit';
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

// CSP hashes for app.html's own inline scripts (theme, crypto shim, boot loader).
// SvelteKit hashes only the scripts IT injects, so these are computed here from
// the template itself — an edit to any of them re-hashes on the next build
// instead of silently going stale. JSON-LD is a data block, not script, so CSP
// never governs it.
function appHtmlScriptHashes() {
	const html = readFileSync('src/app.html', 'utf8');
	const hashes: `sha256-${string}`[] = [];

	for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
		if ((/type="application\/ld\+json"/).test(attrs) || (/\ssrc=/).test(attrs)) continue;

		// Kit fills %sveltekit.*% placeholders AFTER this hash is taken, so the
		// shipped script would no longer match it and the CSP would block it.
		if (body.includes('%sveltekit.')) {
			throw new Error('src/app.html: an inline <script> contains a %sveltekit.*% placeholder, which breaks its CSP hash');
		}

		hashes.push(`sha256-${createHash('sha256').update(body).digest('base64')}`);
	}

	return hashes;
}

// Kit renders its own HTML and never calls `transformIndexHtml`, so it warns at
// every check and build about each plugin that defines one. vite-pwa's two would
// inject the manifest <link> and a register script, both of which +layout.svelte
// does instead (`injectRegister: false`), so those hooks are dead here either way.
// Only the PWA plugins are stripped (kit's own group is a promise and passes
// through): any other plugin that relies on the hook should still warn.
function withoutIndexHtmlHooks(plugins: ReturnType<typeof withPwa>) {
	return plugins.map((group) =>
		Array.isArray(group) ? group.map(({ transformIndexHtml: _unused, ...plugin }) => plugin) : group
	);
}

export default defineConfig(({ mode }) => ({
	define: {
		__APP_VERSION__: JSON.stringify(appVersion())
	},
	plugins: [
		tailwindcss(),
		// withPwa runs sveltekit() itself with the first argument (SvelteKit 3 has
		// no svelte.config.js), and builds the service worker from the second just
		// before adapter-static writes build/.
		withoutIndexHtmlHooks(withPwa(
			{
				compilerOptions: {
					// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
					runes: ({ filename }) => {
						const relativePath = relative(import.meta.dirname, filename);
						const pathSegments = relativePath.toLowerCase().split(sep);
						const isExternalLibrary = pathSegments.includes('node_modules');

						return isExternalLibrary ? undefined : true;
					}
				},

				// Static SPA for Cloudflare Pages: every route falls back to index.html
				// (static/_redirects), and nothing server-side exists to adapt to.
				adapter: adapter({ fallback: 'index.html' }),

				// Inline CSS into the HTML <head> instead of a render-blocking external
				// <link>. Without this, first paint — including the static boot loader in
				// app.html — blocks on a separate CSS fetch (a long blank over a slow /
				// tailnet connection). Inlined CSS arrives with the HTML and paints in one
				// shot. Threshold covers the current layout (~17KB) + route (~34KB) CSS
				// with headroom; any file above it falls back to an external link.
				inlineStyleThreshold: 50_000,

				// A second, <meta> CSP layered on the `_headers` one. Browsers enforce
				// every policy present, so inline script must satisfy both: the header's
				// 'unsafe-inline' no longer suffices, and only the hashed scripts run. The
				// header keeps what a <meta> can't carry (frame-ancestors) plus connect-src,
				// the privacy guarantee. Styles stay header-only on purpose: listing
				// style-src here would make kit add hashes, which disables 'unsafe-inline'
				// for the style attributes Svelte's `style:` directive writes.
				csp: {
					mode: 'hash',
					directives: {
						'script-src': ['self', 'wasm-unsafe-eval', ...appHtmlScriptHashes()],
						// Without this the meta policy's worker fallback is script-src, which
						// would refuse the blob: workers the header deliberately allows.
						'worker-src': ['self', 'blob:']
					}
				},

				// Kit 3 polls _app/version.json hourly by default to set `updated`.
				// Nothing here reads it, and the service worker already checks hourly for
				// a deploy (src/lib/stores/pwa.svelte.ts), so 0 keeps kit 2's no-poll
				// default. Kit 3 still checks once when the tab regains focus or becomes
				// visible; no option turns that off, so the service worker precaches the
				// file (kit.includeVersionFile below).
				version: { pollInterval: 0 }
			},
			{
				disable: mode === 'development',
				// 'prompt', never 'autoUpdate': the open documents live only in memory,
				// so a service worker that activated itself would reload the tab and
				// wipe the user's work mid-edit. A new SW waits until the user accepts
				// the update toast (src/lib/stores/pwa.svelte.ts).
				registerType: 'prompt',
				// Registered from +layout.svelte instead; the generated registerSW.js
				// had no <script> to load it (adapter-static writes no injectable HTML).
				injectRegister: false,
				// Must be explicit. vite-pwa 2 documents this as "true in production" but
				// leaves it unset, and it pre-bundles the register module (workbox-window
				// inside) in a separate rolldown pass, which folds process.env.NODE_ENV to
				// "development" when not minifying. Unset, every visitor's console got
				// workbox-window's debug logger. The service worker has its own default,
				// so this changes only that module and the manifest's whitespace.
				minify: true,
				// SPA: precache the adapter fallback as "/" so the navigation route can
				// serve the app offline (without it the route pointed at an unprecached URL).
				// includeVersionFile: kit 3 fetches _app/version.json on every tab focus
				// (see version.pollInterval above); precached, a controlled tab answers
				// that from the cache instead of pinging the origin each time.
				kit: { adapterFallback: 'index.html', spa: true, includeVersionFile: true },
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
				// Top level since vite-pwa 2: inside generateSW it is overwritten with
				// the 2 MB default.
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
				generateSW: {
					// pdf.js's three image/colour decoders ARE precached (~420 KB): a scanned
					// or faxed PDF is ordinary input, and offline it would otherwise render
					// with its images missing. Its CMaps and font data stay runtime-cached
					// below; most documents never ask for them.
					// Rooted at client/ (the glob runs over .svelte-kit/output): without a
					// client/ pattern vite-pwa 2 adds its own, and every file it shares with
					// these lands in the precache twice.
					globPatterns: ['client/**/*.{js,css,html,mjs,woff2,png,svg}', 'client/pdfjs/*/wasm/*.wasm'],
					// The SW never needs its own script (update checks bypass it), and
					// the social card is for crawlers, not for working offline. The pdf.js
					// no-wasm fallbacks only run where WebAssembly is unavailable.
					globIgnores: ['**/sw.js', '**/workbox-*.js', '**/og-image.png', '**/pdfjs/**/*.js'],
					// vite-pwa 2 always adds a prerendered/** pattern, and this SPA
					// prerenders nothing; strict globbing fails the build on that empty
					// match. It still prints a warning, and CI checks the decoders above
					// actually reach the precache.
					globStrict: false,
					// vite-pwa 1 turned this on by default and 2 does not: it deletes
					// precaches left by an older Workbox format, which no later SW would
					// otherwise ever remove from an installed user's storage.
					cleanupOutdatedCaches: true,
					// The SPA fallback is for app routes only: without this, a controlled
					// tab opening /llms.txt, /robots.txt, /sitemap.xml (any real file) got
					// the app shell instead of the file.
					navigateFallbackDenylist: [/\/[^/?]+\.[a-z0-9]+(\?.*)?$/i],
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
			}
		)),
		pdfjsAssets()
	]
}));
