# KeMeK PDF Lab

A privacy-first PDF manipulation tool that runs entirely in your browser. Merge, split, reorder, and rotate PDF pages with a drag-and-drop interface. No uploads, no servers — your files never leave your machine.

## Features

- **Merge** multiple PDFs into a single document
- **Split** PDFs into separate files
- **Reorder** pages via drag-and-drop
- **Rotate** and delete individual pages
- **Page labels** for organized multi-document workflows
- **Custom export filenames** with File System Access API support
- **Undo / redo** for all page operations
- **Dark / light theme** with system preference detection
- **Installable PWA** — works fully offline
- **Keyboard accessible** — full keyboard and screen reader support

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit (static adapter, SPA) |
| Language | TypeScript |
| UI | Svelte 5 with runes |
| Styling | Tailwind CSS 4 |
| PDF rendering | PDF.js (lazy-loaded) |
| PDF manipulation | pdf-lib |
| Drag-and-drop | svelte-dnd-action |
| PWA | @vite-pwa/sveltekit |
| Fonts | Bricolage Grotesque, DM Sans (self-hosted) |

## Getting started

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). Drop any PDF to get started.

## Building

```bash
npm run build
```

Output goes to `build/`. The result is a self-contained SPA deployable on any static host.

```bash
npm run preview    # preview production build locally
```

## Project structure

```
src/
  routes/
    +page.svelte          App shell — DropZone (empty) or Toolbar + PageGrid (working)
  lib/
    components/           DropZone, PageGrid, PageThumbnail, Toolbar, StatusBar,
                          FilenameDialog, ThemeToggle, ProgressBar
    pdf/
      renderer.ts         PDF.js wrapper with lazy import and document cache
      operator.ts         pdf-lib merge, rotate, and export
      types.ts            PageInfo, Document, Action types
    stores/
      app.svelte.ts       All mutable state (docs, pages, selection, undo/redo)
      preferences.svelte.ts  Grid density, thumbnail width (persisted to localStorage)
    utils/
      file-access.ts      File System Access API with download fallback
static/
  fonts/                  Self-hosted woff2 webfonts
  pdf.worker.min.mjs      PDF.js web worker (vendored)
```

## Architecture

- **Two UI states:** empty (DropZone with branding) and working (Toolbar + PageGrid + StatusBar), driven by document count.
- **Undo/redo:** every mutation pushes a typed `Action` onto the undo stack. Actions are discriminated unions in `types.ts`.
- **PDF.js is lazy-loaded** via dynamic import to avoid SSR crashes — it touches browser globals at import time.
- **pdf-lib is static** — imported at top of `operator.ts`, safe for SSR.
- **File System Access API** used when available for native save dialogs; falls back to download link.

## Roadmap

- [ ] Text overlays and annotations
- [ ] Form filling (AcroForm)
- [ ] Web Worker processing for large documents
- [ ] Batch operations

## License

Built by kVadrum. KeMeK Network © 2026.
