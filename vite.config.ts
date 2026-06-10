import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

// Single source of truth for the displayed version: package.json, which the
// workspace per-commit bump discipline ticks and which the `vX.Y.Z` commit
// subjects match. (Previously this counted `main` commit subjects, which
// inflated the footer with autonomous-rig bookkeeping commits and drifted far
// from the real version.) Read at config-eval time so a bump shows on next build.
function appVersion(): string {
	try {
		const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
		return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
	} catch {
		return '0.0.0';
	}
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
			registerType: 'autoUpdate',
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
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
			}
		})
	]
}));
