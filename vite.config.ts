import { execFileSync } from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

// Derive a semver-ish tag from the `main` history so the footer always
// reflects what actually shipped. Minor bumps on feature commits (conventional
// `feat:` prefix, a `Phase` milestone, or free-form "features" wording);
// everything else is a patch. Merge commits don't count.
function appVersion(): string {
	try {
		const log = execFileSync('git', ['log', 'main', '--pretty=format:%s', '--reverse'], {
			stdio: ['ignore', 'pipe', 'ignore']
		}).toString();

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
