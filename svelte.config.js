import adapter from '@sveltejs/adapter-static';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';

// CSP hashes for app.html's own inline scripts (theme, crypto shim, boot loader).
// SvelteKit hashes only the scripts IT injects, so these are computed here from
// the template itself — an edit to any of them re-hashes on the next build
// instead of silently going stale. JSON-LD is a data block, not script, so CSP
// never governs it.
function appHtmlScriptHashes() {
	const html = readFileSync('src/app.html', 'utf8');
	const hashes = [];
	for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
		if (/type="application\/ld\+json"/.test(attrs) || /\ssrc=/.test(attrs)) continue;
		// Kit fills %sveltekit.*% placeholders AFTER this hash is taken, so the
		// shipped script would no longer match it and the CSP would block it.
		if (body.includes('%sveltekit.')) {
			throw new Error('src/app.html: an inline <script> contains a %sveltekit.*% placeholder, which breaks its CSP hash');
		}
		hashes.push(`sha256-${createHash('sha256').update(body).digest('base64')}`);
	}
	return hashes;
}

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
		}
	}
};

export default config;
