# KeMeK PDF Lab

**Merge, split, rotate and edit PDFs entirely in your browser.
No signup, no tracking, no upload.**

KeMeK PDF Lab is a privacy-first PDF toolkit that runs 100% on your device.
Your files never reach a server — they're opened, edited and saved without a single byte leaving the browser tab.

> **Don't take our word for it.** Your files are never uploaded — read into
> memory, processed on your device, and gone when you close the tab. The code is
> MIT-licensed and right here in this repo, so you can read exactly what runs.

🔗 **[pdf.kemek.com](https://pdf.kemek.com)** · part of [KeMeK](https://kemek.com) Tools

## What it does

**Organize**
- **Merge** any number of PDFs into one document
- **Reorder** pages by drag-and-drop
- **Rotate**, **delete** and **label** pages
- **Split** into separate files — each page, fixed-size chunks, or just the selected pages (downloaded as a ZIP)
- **Import images** — JPG/PNG dropped in are converted to single-page PDFs in-browser

**Annotate & finalize**
- **Text overlays** — double-click a page to place text, burned into the export
- **Watermark** — text or image, positioned or tiled, on selected pages or all
- **Page numbers / stamps** — header/footer templates with `{n}` / `{total}`
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

Plus undo/redo for every operation, a dark/light theme, full keyboard shortcuts, custom export filenames (native save dialog on Chromium), and an installable PWA that works offline once cached.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit 2 (`adapter-static`, SPA) |
| Language | TypeScript |
| UI | Svelte 5 (runes) |
| Styling | Tailwind CSS 4 |
| PDF rendering | PDF.js — **lazy-loaded** |
| PDF manipulation | pdf-lib — **lazy-loaded** |
| Decryption | `@neslinesli93/qpdf-wasm` (single-threaded, lazy) |
| Drag-and-drop | svelte-dnd-action |
| Offline | `@vite-pwa/sveltekit` |
| Fonts | Bricolage Grotesque, DM Sans (self-hosted) |

## Getting started

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

## Deployment

`adapter-static` with `fallback: 'index.html'` produces a self-contained SPA in `build/`, deployable on any static host.
Production runs on **Cloudflare Pages** at [pdf.kemek.com](https://pdf.kemek.com) — build command `npm run build`, output directory `build`.

## Architecture

- **Fully client-side.**
  No backend; every operation runs in the browser.
  PDF.js renders thumbnails; pdf-lib assembles exports; qpdf-wasm decrypts on ingest.
- **Both heavy PDF libraries are lazy-imported** (`await import(...)`) so they stay out of the initial page bundle and load only on first use.
  PDF.js also needs this to avoid SSR crashes (it touches browser globals at import time).
- **Two UI states:** empty (drop zone) and working (toolbar + page grid), switched on document count.
- **Undo/redo:** every mutation pushes a typed `Action` (discriminated union) onto an undo stack.
  Add-document undo intentionally keeps the parsed document in the renderer cache so redo stays synchronous; **Clear** releases the entire cache so nothing parsed survives it.
- **Metadata-clean by default:** every pdf-lib document is opened, created and saved through one module (`src/lib/pdf/pdf-doc.ts`).
  Opening passes `updateMetadata: false`, so no tool fingerprint or timestamp is added; the only Info-dict value an export carries is the neutral producer tag.
  Saving runs an export scrub (`scrub.ts`) that drops page-level metadata, annotation authors and dates, and scripts, then deletes every object the page tree no longer reaches, so a deleted page can't survive as a hidden copy behind a link or a form field.
  Photos and other JPEGs lose their EXIF (GPS, camera serial) before they are embedded.
  Tests fail if any other code loads, creates, saves or embeds a JPEG directly.

## License

[MIT](./LICENSE).
KeMeK Network © 2026.

### Trademarks

The "KeMeK" and "KeMeK PDF Lab" names and the KeMeK mark are trademarks of KeMeK Network.
They are not covered by the code license.
No rights to use the name or logo are granted by this repository.
Independent forks must replace the brand name and logo with their own.
