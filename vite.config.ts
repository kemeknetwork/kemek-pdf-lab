import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

// THE version source for this project — do NOT switch this to read
// package.json. `package.json` is intentionally frozen at 0.0.1 (see CLAUDE.md
// "Versioning"); the real version is derived here from `main`'s history so the
// footer always reflects what actually shipped. Minor bumps on feature commits
// (conventional `feat:` prefix, a `Phase` milestone, or free-form "features"
// wording); everything else is a patch. Merge commits don't count.
//
// Cloudflare Pages builds from a shallow, detached clone: one commit, no local
// `main` ref. The derive failed there and the first deploy shipped `v0.0.0`
// with nothing reporting it. So on Pages we deepen the clone and count HEAD (on a
// production build HEAD *is* main's tip), and failure is a build error: a red
// deploy leaves the previous one live, while a wrong version ships silently.
// Elsewhere (vitest, GitHub CI's shallow checkout) nothing ships, so the
// quiet 0.0.0 fallback stays.
function appVersion(): string {
	const onPages = process.env.CF_PAGES === '1';
	const git = (...args: string[]) =>
		execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
	try {
		if (onPages && git('rev-parse', '--is-shallow-repository') === 'true') {
			git('fetch', '--unshallow', '--quiet');
			if (git('rev-parse', '--is-shallow-repository') === 'true') {
				throw new Error('clone is still shallow after `git fetch --unshallow`');
			}
		}
		const log = git('log', onPages ? 'HEAD' : 'main', '--pretty=format:%s', '--reverse');

		const MINOR = [/^feat(\(.+\))?!?:/i, /\bPhase\s*\d/i, /\bfeatures\b/i];
		const MERGE = /^[Mm]erge\b/;

		let minor = 0;
		let patch = 0;
		for (const subject of log.split('\n').filter(Boolean)) {
			if (MERGE.test(subject)) continue;
			if (MINOR.some((re) => re.test(subject))) {
				minor += 1;
				patch = 0;
			} else {
				patch += 1;
			}
		}
		return `0.${minor}.${patch}`;
	} catch (err) {
		if (onPages) {
			throw new Error(`appVersion: cannot count git history on Cloudflare Pages: ${err}`);
		}
		return '0.0.0';
	}
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
				globPatterns: ['**/*.{js,css,html,mjs,woff2,png,svg}'],
				// The SW never needs its own script (update checks bypass it), and
				// the social card is for crawlers, not for working offline.
				globIgnores: ['**/sw.js', '**/workbox-*.js', '**/og-image.png'],
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
					}
				]
			}
		})
	]
}));
