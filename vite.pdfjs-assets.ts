import { createReadStream, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Plugin } from 'vite';

// pdf.js decodes JBIG2 / CCITT fax / JPEG 2000 images only through wasm, and
// reads CJK CMaps, the standard-14 font substitutes and the CMYK ICC profile
// from data files, all fetched by its worker from URLs the app hands to
// getDocument(). Without them, scanned and faxed PDFs render with their images
// missing. They are served straight from the INSTALLED package, at a path named
// for its version: nothing is copied by hand (unlike static/pdf.worker.min.mjs),
// so a pdfjs bump can never pair new code with old decoders, and the URL can be
// cached forever. renderer.ts builds the same path from pdfjs's runtime
// `version`, so both sides read one number.

const ROOT = 'node_modules/pdfjs-dist';
const DIRS = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];
// QuickJS is pdf.js's engine for a document's own JavaScript. This app never
// runs document scripts, so it is not shipped.
const EXCLUDE = /^quickjs/;

const TYPES: Record<string, string> = {
	'.wasm': 'application/wasm',
	'.js': 'text/javascript',
	'.ttf': 'font/ttf',
	'.icc': 'application/vnd.iccprofile',
	'': 'text/plain; charset=utf-8' // LICENSE files
};

export function pdfjsVersion(): string {
	return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
}

/** Published path prefix, without leading slash: `pdfjs/<version>/`. */
export function pdfjsAssetBase(): string {
	return `pdfjs/${pdfjsVersion()}/`;
}

function assetFiles(): string[] {
	return DIRS.flatMap((dir) =>
		readdirSync(join(ROOT, dir))
			.filter((name) => !EXCLUDE.test(name))
			.map((name) => `${dir}/${name}`)
	);
}

export function pdfjsAssets(): Plugin {
	const base = pdfjsAssetBase();
	const files = assetFiles();
	const served = new Set(files);
	return {
		name: 'kemek:pdfjs-assets',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = (req.url ?? '').split('?')[0];
				if (!path.startsWith(`/${base}`)) return next();
				// Only the enumerated files: the set lookup is also the traversal guard.
				const rel = decodeURIComponent(path.slice(base.length + 1));
				if (!served.has(rel)) {
					res.statusCode = 404;
					res.end();
					return;
				}
				res.setHeader('Content-Type', TYPES[extname(rel)] ?? 'application/octet-stream');
				createReadStream(join(ROOT, rel)).pipe(res);
			});
		},
		generateBundle() {
			// Client build only; the SSR build has no static output to carry them.
			if (this.environment.config.consumer !== 'client') return;
			for (const rel of files) {
				this.emitFile({ type: 'asset', fileName: base + rel, source: readFileSync(join(ROOT, rel)) });
			}
		}
	};
}
