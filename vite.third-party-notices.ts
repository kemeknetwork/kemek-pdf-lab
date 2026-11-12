import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { pdfjsVersion } from './vite.pdfjs-assets.ts';

// The deployed app ships other people's code, and most of those licenses (MIT's
// "shall be included", Apache-2.0 §4, the IJG clause) are satisfied only by a
// notice that travels WITH it. The repo's README is not that: visitors never see
// it. So the build writes /third-party-notices.txt from what it actually ships.
//
// Two sources, so a dependency can't enter the app without its notice:
//   1. Every npm package with code in the client bundle, read from the bundle's
//      own module list — a package that enters or leaves the bundle enters or
//      leaves the file, with no list to keep.
//   2. What the module graph can't see, listed in EXTRAS below: code compiled
//      into static/qpdf.wasm, Workbox in the separately-built sw.js, pdf.js's
//      served decoders and data, and the self-hosted fonts.

export const NOTICES_FILE = 'third-party-notices.txt';

// THIRD-PARTY-LICENSE and NOTICE travel too: rolldown's runtime is derived from
// Rollup and esbuild and carries their terms in THIRD-PARTY-LICENSE, and Apache-2.0
// §4(d) requires a NOTICE file to be passed on with the code.
const LICENSE_FILE = /^((third[-_]party[-_])?licen[cs]es?|copying|notice)(\.(md|txt|markdown))?$/i;
export const isLicenseFile = (name: string) => LICENSE_FILE.test(name);

/** The npm package a bundled module came from, or null for the app's own code.
 *  Module ids are absolute paths, possibly \0-prefixed (virtual) or carrying a
 *  `?query` (Svelte's style/script parts); the LAST node_modules segment wins,
 *  so a nested dependency is attributed to itself, not to its parent. */
export function packageOf(id: string): { name: string; dir: string } | null {
	const path = id.replace(/^\0/, '').split('?')[0].replaceAll('\\', '/');
	const at = path.lastIndexOf('/node_modules/');
	if (at < 0) return null;
	const rest = path.slice(at + '/node_modules/'.length).split('/');
	const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
	if (!name || name.startsWith('.') || (rest[0].startsWith('@') && !rest[1])) return null;
	return { name, dir: path.slice(0, at + '/node_modules/'.length) + name };
}

/** Code a tool injects into the bundle under a virtual id, so no node_modules
 *  path names its package. The PWA register module is @unplugin-pwa/vite's
 *  register.js with @vite-pwa/workbox-window pre-bundled into it, so it ships
 *  both. `cut` drops a license file's tail where the package appends the notices
 *  of its OWN build-time dependencies (Vite's runs ~98 KB, none of it shipped to
 *  a browser). */
const VIRTUAL: { id: RegExp; names: string[]; cut?: string }[] = [
	{ id: /virtual:pwa-register/, names: ['@unplugin-pwa/vite', '@vite-pwa/workbox-window'] },
	{ id: /^\0?vite\/preload-helper/, names: ['vite'], cut: '# Licenses of bundled dependencies' },
	{ id: /^\0?rolldown\/runtime/, names: ['rolldown'] }
];

/** Packages that ship CSS only never appear in a JS chunk's module list: Tailwind
 *  is compiled from `@import 'tailwindcss'` inside its own compiler. They are found
 *  by the license banner the CSS keeps (`/*! tailwindcss v4.3.5 | MIT License`). */
export function cssBannerPackages(css: string): string[] {
	const names = new Set<string>();
	for (const m of css.matchAll(/\/\*!\s*((?:@[\w.-]+\/)?[\w.-]+)\s+v\d[\w.-]*/g)) names.add(m[1]);
	return [...names];
}

/** The @neslinesli93/qpdf-wasm version whose Dockerfile pins were read for the
 *  licenses/ texts and the versions named in extras(). A bump fails the build here
 *  until someone re-reads the new Dockerfile, rather than shipping stale notices. */
const QPDF_WASM_CHECKED = '0.3.1';

interface Entry {
	title: string;
	/** SPDX id or short license name, for the contents list. */
	license: string;
	url?: string;
	text: string;
}

const lf = (text: string) => text.replaceAll('\r\n', '\n').trim();

function readPackage(dir: string, cut?: string): Entry {
	const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	const files = readdirSync(dir).filter(isLicenseFile).sort();
	// Fail the build rather than ship a dependency with no notice: a new package
	// without a license file needs a person to find its terms.
	if (files.length === 0) {
		throw new Error(`third-party notices: ${pkg.name} has no LICENSE file in ${dir}`);
	}
	const read = (f: string) => {
		const text = readFileSync(join(dir, f), 'utf8');
		const at = cut ? text.indexOf(cut) : -1;
		return lf(at < 0 ? text : text.slice(0, at));
	};
	const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
	return {
		title: `${pkg.name} ${pkg.version}`,
		license: typeof pkg.license === 'string' ? pkg.license : 'see text',
		url: pkg.homepage ?? repo?.replace(/^git\+/, '').replace(/\.git$/, ''),
		text: files.map(read).join('\n\n')
	};
}

const vendored = (file: string) => lf(readFileSync(join('licenses', file), 'utf8'));

function packageVersion(name: string): string {
	return JSON.parse(readFileSync(join('node_modules', name, 'package.json'), 'utf8')).version;
}

/** Shipped, but invisible to the client bundle's module list. The texts under
 *  licenses/ are copied verbatim from the sources the qpdf-wasm build pins (its
 *  Dockerfile names each commit) and from google/fonts. On a qpdf-wasm bump, re-read
 *  that Dockerfile: a new zlib, libjpeg-turbo, qpdf or Emscripten means new texts. */
function extras(): Entry[] {
	const qpdfWasm = packageVersion('@neslinesli93/qpdf-wasm');
	if (qpdfWasm !== QPDF_WASM_CHECKED) {
		throw new Error(
			`third-party notices: @neslinesli93/qpdf-wasm is ${qpdfWasm}, but licenses/ and the qpdf.wasm ` +
				`entries were checked against ${QPDF_WASM_CHECKED}. Re-read its Dockerfile for the qpdf, zlib, ` +
				`libjpeg-turbo and Emscripten pins, update licenses/ and extras(), then QPDF_WASM_CHECKED.`
		);
	}
	const pdfjsDir = 'node_modules/pdfjs-dist';
	const pdfjsData = ['wasm', 'cmaps', 'standard_fonts', 'iccs'].flatMap((dir) =>
		readdirSync(join(pdfjsDir, dir))
			// QuickJS is not served (vite.pdfjs-assets.ts excludes it).
			.filter((f) => /^licen[cs]e/i.test(f) && !/quickjs/i.test(f))
			.sort()
			.map((f) => ({ dir, f }))
	);
	return [
		{
			title: 'qpdf 12.2.0 (compiled into qpdf.wasm)',
			license: 'Apache-2.0',
			url: 'https://github.com/qpdf/qpdf',
			text: vendored('qpdf.txt')
		},
		{
			title: 'zlib 1.2.12 (compiled into qpdf.wasm)',
			license: 'Zlib',
			url: 'https://github.com/madler/zlib',
			text: vendored('zlib.txt')
		},
		{
			title: 'libjpeg-turbo 2.1.1 (compiled into qpdf.wasm)',
			license: 'IJG AND BSD-3-Clause AND Zlib',
			url: 'https://github.com/ImageMagick/jpeg-turbo',
			text: vendored('libjpeg-turbo.txt')
		},
		{
			title: 'Emscripten 3.1.74 runtime (in qpdf.wasm and its loader)',
			license: 'MIT OR NCSA',
			url: 'https://github.com/emscripten-core/emscripten',
			text: vendored('emscripten.txt')
		},
		{
			title: 'musl libc, as shipped with Emscripten 3.1.74 (compiled into qpdf.wasm)',
			license: 'MIT',
			url: 'https://musl.libc.org',
			text: vendored('musl.txt')
		},
		{
			...readPackage('node_modules/@vite-pwa/workbox-swkit'),
			title: `@vite-pwa/workbox-swkit ${packageVersion('@vite-pwa/workbox-swkit')} (the service worker, sw.js)`
		},
		...pdfjsData.map(({ dir, f }) => ({
			title: `pdf.js ${pdfjsVersion()} ${dir}: ${f}`,
			license: 'see text',
			text: lf(readFileSync(join(pdfjsDir, dir, f), 'utf8'))
		})),
		{
			title: 'Bricolage Grotesque (font)',
			license: 'OFL-1.1',
			url: 'https://github.com/ateliertriay/bricolage',
			text: vendored('bricolage-grotesque-OFL.txt')
		},
		{
			title: 'DM Sans (font)',
			license: 'OFL-1.1',
			url: 'https://github.com/googlefonts/dm-fonts',
			text: vendored('dm-sans-OFL.txt')
		}
	];
}

const RULE = '='.repeat(72);

export function renderNotices(appVersion: string, packages: Entry[], more: Entry[]): string {
	const all = [...packages, ...more];
	const head = [
		`Third-party notices for KeMeK PDF Lab ${appVersion}`,
		'',
		'KeMeK PDF Lab is licensed under the MIT License. It ships the software',
		'below, each part under its own license, reproduced in full after the list.',
		'This file is generated from the production build.',
		'',
		'This software is based in part on the work of the Independent JPEG Group.',
		'',
		...all.map((e) => `  - ${e.title} [${e.license}]`)
	];
	const body = all.map((e) =>
		[RULE, e.title, ...(e.url ? [e.url] : []), `License: ${e.license}`, RULE, '', e.text, ''].join('\n')
	);
	return [...head, '', ...body].join('\n');
}

export function thirdPartyNotices(appVersion: string): Plugin {
	return {
		name: 'kemek:third-party-notices',
		configureServer(server) {
			// The list comes from a production bundle, which dev never makes.
			server.middlewares.use((req, res, next) => {
				if ((req.url ?? '').split('?')[0] !== `/${NOTICES_FILE}`) return next();
				res.setHeader('Content-Type', 'text/plain; charset=utf-8');
				res.end('Third-party notices are generated by `npm run build`.\n');
			});
		},
		generateBundle(_options, bundle) {
			// Client build only: the SSR build ships nothing to a visitor.
			if (this.environment.config.consumer !== 'client') return;
			const found = new Map<string, { dir: string; cut?: string }>();
			for (const output of Object.values(bundle)) {
				if (output.type === 'asset') {
					if (!output.fileName.endsWith('.css')) continue;
					const css = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source);
					for (const name of cssBannerPackages(css)) {
						const dir = join('node_modules', name);
						// A banner naming nothing installed needs a person, not a guess.
						if (!existsSync(join(dir, 'package.json'))) {
							throw new Error(`third-party notices: ${output.fileName} carries a /*! ${name} banner, but node_modules/${name} is not installed`);
						}
						found.set(name, { dir });
					}
					continue;
				}
				for (const [id, mod] of Object.entries(output.modules)) {
					// A module tree-shaken to nothing ships no code.
					if (mod.renderedLength === 0) continue;
					const pkg = packageOf(id);
					if (pkg) {
						found.set(pkg.name, { dir: pkg.dir });
						continue;
					}
					const virtual = VIRTUAL.find((v) => v.id.test(id));
					for (const name of virtual?.names ?? []) found.set(name, { dir: join('node_modules', name), cut: virtual?.cut });
				}
			}
			const packages = [...found.keys()]
				.sort()
				.map((name) => readPackage(found.get(name)!.dir, found.get(name)!.cut));
			this.emitFile({
				type: 'asset',
				fileName: NOTICES_FILE,
				source: renderNotices(appVersion, packages, extras())
			});
		}
	};
}
