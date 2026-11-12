# KeMeK PDF Lab

**Merge, split, rotate and edit PDFs entirely in your browser.
No signup, no tracking, no upload.**

KeMeK PDF Lab is a privacy-first PDF toolkit that runs 100% on your device.
Your files are read into memory, edited there and saved to your disk as new files; nothing is sent to a server, and closing the tab forgets them.

> **Don't take our word for it.**
> Every asset is self-hosted, and the site's Content-Security-Policy (`connect-src 'self'`) lets the page connect only to its own origin, a static host with no backend to receive anything.
> Open your browser's Network tab while you work: no request carries your file.
> The code is MIT-licensed and right here in this repo, so you can read exactly what runs.

🔗 **[pdf.kemek.com](https://pdf.kemek.com)** · part of the KeMeK Tools suite from [KeMeK Network](https://kemek.com)

## What it does

**Organize**
- **Merge** any number of PDFs into one document
- **Reorder** pages by drag-and-drop (on a touchscreen, hold a page briefly, then drag)
- **Rotate**, **duplicate**, **delete** and **label** pages, or **reverse** the whole order
- **Alternate** two documents page by page (A, B, A, B…), the fix for a duplex job scanned as fronts and backs, with the backs optionally reversed
- **Split** into separate files — each page, fixed-size chunks, or just the selected pages (downloaded as a ZIP)
- **Import images** — JPG/PNG dropped in are converted to single-page PDFs in-browser

**Annotate & finalize**
- **Text overlays** — double-click a page (or press Enter on it) to open the page editor and place text, burned into the export
- **Watermark** — text or image, positioned or tiled, on selected pages or all
- **Page numbers / stamps** — header/footer templates with `{n}` / `{total}`
- **Sign** — draw, type or upload a signature, then place, move and resize it on any page
- **Fill & flatten forms** — fill AcroForm fields, then optionally lock them (non-editable on export)

**Extract & convert**
- **Extract text** to a `.txt` file, in reading order
- **Extract embedded images** (download all as a ZIP)
- **Export pages as images** (PNG/JPEG, single or all-as-ZIP)

**Privacy & access**
- **Open password-protected PDFs** — decrypted in-browser at ingest (qpdf-wasm), never sent anywhere
- **Metadata is stripped by default** — every export drops the source's author, dates and XMP and carries only a neutral `KeMeK PDF Lab` producer tag (no user data, no timestamp).
  An **Inspect** panel shows exactly what a file reveals.
- **Clear** wipes everything from memory in one click

Plus undo/redo for every operation, a dark/light theme, three thumbnail sizes, keyboard shortcuts (press `?` for the list), custom export filenames (with a native save dialog in desktop Chrome and Edge), and an installable PWA that works offline once cached.
It works on phones too: there the workspace scrolls as one page and the status bar stays pinned.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit 3 (`adapter-static`, SPA) |
| Language | TypeScript |
| UI | Svelte 5 (runes) |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| PDF rendering | PDF.js — **lazy-loaded** |
| PDF manipulation | pdf-lib — **lazy-loaded** |
| Decryption | `@neslinesli93/qpdf-wasm` (single-threaded, lazy) |
| Drag-and-drop | svelte-dnd-action |
| Icons | lucide-svelte |
| Offline | `@vite-pwa/sveltekit` |
| Fonts | Bricolage Grotesque, DM Sans (self-hosted) |

## Getting started

Requires Node.js 22 (22.17 or later), 24, or 26+ — the range in `package.json` `engines`.

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173) and drop in a PDF.

```bash
npm run build      # static SPA → build/
npm run preview    # preview the production build
npm test           # vitest
npm run check      # svelte-check (typecheck)
```

`npm run preview` doesn't apply `static/_headers`, so the Content-Security-Policy and caching rules are missing there.
To see the build the way Cloudflare Pages serves it, run `npx wrangler pages dev build`.

## Deployment

`adapter-static` with `fallback: 'index.html'` produces a self-contained SPA in `build/`, deployable on any static host.
Production runs on **Cloudflare Pages** at [pdf.kemek.com](https://pdf.kemek.com) — build command `npm run build`, output directory `build`.
Pushes to `main` deploy to production; every other branch gets a preview deployment.

### Rolling back

- **Fastest, no code change:** in the Cloudflare dashboard, open the Pages project's deployments, pick the last good production deployment and choose **Rollback to this deployment**.
  It serves that build again within seconds; `main` is unchanged, so the next push to `main` deploys over it.
- **Through git:** `git revert` the bad commit on `dev`, then fast-forward `main` to `dev`; Pages rebuilds production from it.

Either way the app's service worker treats the rolled-back build as an update: an installed copy shows its reload prompt rather than reloading on its own, so nobody loses open files.

## Performance

Lighthouse 12.8 on production, 2026-11-12 (`v0.35.10`):

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Mobile | 95 | 100 | 100 | 100 |
| Desktop | 100 | 100 | 100 | 100 |

Mobile LCP 2.7 s, total blocking time 120 ms, layout shift 0.
The PDF engines (PDF.js, pdf-lib, qpdf) load only when a file is opened, so they are not in these numbers.

## Architecture

- **Fully client-side.**
  No backend; every operation runs in the browser.
  PDF.js renders thumbnails; pdf-lib assembles exports; qpdf-wasm decrypts on ingest.
- **All three PDF engines are lazy-imported** (`await import(...)`), so they stay out of the initial page bundle and load only on first use.
  PDF.js also needs this to avoid SSR crashes (it touches browser globals at import time).
- **Two UI states:** empty (drop zone) and working (toolbar + page grid), switched on document count.
- **Undo/redo:** every mutation pushes a typed `Action` (discriminated union) onto an undo stack.
  Add-document undo intentionally keeps the parsed document in the renderer cache so redo stays synchronous; **Clear** releases the entire cache so nothing parsed survives it.
- **Metadata-clean by default:** every pdf-lib document is opened, created and saved through one module (`src/lib/pdf/pdf-doc.ts`).
  Opening passes `updateMetadata: false`, so no tool fingerprint or timestamp is added; the only Info-dict value an export carries is the neutral producer tag.
  Saving runs an export scrub (`scrub.ts`) that drops page-level metadata, annotation authors and dates, and scripts, then deletes every object the document no longer references, so a deleted page can't survive as a hidden copy behind a link or a form field.
  Photos and other JPEGs lose their EXIF (GPS, camera serial) before they are embedded.
  Tests fail if any other code loads, creates, saves or embeds a JPEG directly.

## License

[MIT](./LICENSE).
KeMeK Network © 2026.

### Names and logos

The "KeMeK" and "KeMeK PDF Lab" names and the KeMeK mark are not covered by this repository's licenses.
KeMeK Network reserves all rights in them.
Independent forks must replace the name and logo with their own.

### Third-party components

The app ships third-party code, each part under its own license.
The main pieces are [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0), together with the WebAssembly decoders, fonts and CMap data it ships, which carry their own BSD, MIT and other terms; [qpdf](https://github.com/qpdf/qpdf) (Apache-2.0) via [`@neslinesli93/qpdf-wasm`](https://github.com/neslinesli93/qpdf-wasm) (ISC), compiled to WebAssembly together with [zlib](https://github.com/madler/zlib) (Zlib) and [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo) (IJG, BSD-3-Clause and Zlib); [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT); [Svelte](https://github.com/sveltejs/svelte) and [SvelteKit](https://github.com/sveltejs/kit) (MIT); [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) (MIT); [Lucide](https://github.com/lucide-icons/lucide) icons (ISC); and the Bricolage Grotesque and DM Sans fonts (SIL Open Font License 1.1).
This software is based in part on the work of the Independent JPEG Group.

The complete list, with every license in full, is `/third-party-notices.txt` ([live copy](https://pdf.kemek.com/third-party-notices.txt), linked from the app's footer).
The build generates it from the production bundle with `vite.third-party-notices.ts`; the texts it can't read from `node_modules` are in `licenses/`.
