# KeMeK PDF Lab - Product Specification

## Overview

**KeMeK PDF Lab** is a privacy-first, client-side PDF manipulation tool that runs entirely in the browser. No uploads, no servers, no data leaves the machine. It targets desktop browsers and provides a polished drag-and-drop interface for common PDF operations.

**Copyright**: KeMeK Network
**Developer Credit**: kVadrum

---

## Core Principles

1. **Zero server dependency** - All PDF processing happens in the browser via Web Workers. No file ever leaves the user's machine.
2. **Desktop-first** - Optimized for mouse/keyboard workflows on Chromium-based browsers. Not targeting mobile today.
3. **Visual manipulation** - Users see thumbnail previews and drag to reorder, not type page numbers.
4. **Honest about limits** - Clearly communicate file size constraints and unsupported features rather than silently failing.

---

## Target Users

- Professionals who handle PDFs regularly but don't want to pay for Acrobat
- Privacy-conscious users who refuse to upload documents to online tools
- Power users who want a fast, installable (PWA) tool that works offline

---

## Feature Set

### Phase 1 - MVP: Merge & Arrange

The minimum viable product focuses on the single most common PDF workflow: combining and rearranging pages from multiple files.

| Feature | Description |
|---|---|
| **Open files** | Drag-and-drop or file picker. Multiple files simultaneously. |
| **Page thumbnails** | Visual grid of all pages rendered via PDF.js. Lazy-loaded, low-res. |
| **Merge** | Combine pages from multiple source PDFs into a single output. |
| **Reorder** | Drag-and-drop page thumbnails to rearrange order. |
| **Delete pages** | Select and remove unwanted pages. |
| **Rotate pages** | Rotate individual or batch-selected pages (90/180/270). |
| **Export/Save** | Download merged result. File System Access API for Chromium (save-in-place). Fallback download for Firefox/Safari. |
| **Undo/Redo** | Full operation history via command pattern. |

### Phase 2 - Edit & Enhance

| Feature | Description |
|---|---|
| **Split PDF** | Extract page ranges into separate files. |
| **Text overlay** | Add text annotations at arbitrary positions on pages. |
| **Page labels** | Name/tag pages for organization during editing. |
| **Multi-document tabs** | Work on multiple output documents simultaneously. |
| **Preferences persistence** | Remember UI preferences via localStorage. |
| **PWA install** | Service worker for offline use, installable as desktop app. |

### Phase 3 - Advanced

| Feature | Description |
|---|---|
| **Form filling** | Fill AcroForm PDF fields (text, checkboxes, dropdowns). |
| **Text extraction** | Copy text content from PDF pages. |
| **Watermark** | Add text or image watermarks across pages. |
| **Batch operations** | Apply operations across all selected pages at once. |
| **Keyboard shortcuts** | Full keyboard navigation and operation shortcuts. |
| **Import images** | Add JPG/PNG pages into the document. |

### Explicitly Out of Scope

These are not planned and should not be pursued:

- **Password/encryption** - No open-source JS library can write encrypted PDFs
- **XFA forms** - Deprecated format, no library support
- **PDF/A compliance** - No JS tooling available
- **OCR** - Tesseract.js is too slow for a good UX; out of scope
- **Digital signatures** - Too complex for initial versions
- **Mobile layout** - Desktop-only for now

---

## Technical Architecture

### Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript | Non-negotiable for binary data handling and complex state |
| **Framework** | Svelte 5 (SvelteKit SPA mode) | Compiles away, small bundles, simple reactivity. No SSR needed. |
| **Build** | Vite | Fast dev server, good Web Worker support, Rollup production builds |
| **Styling** | Tailwind CSS 4 | Rapid UI development for tool interfaces |
| **PDF rendering** | PDF.js (pdfjs-dist) | Gold standard for browser PDF rendering. Apache 2.0. Actively maintained. |
| **PDF manipulation** | pdf-lib | De facto standard for client-side PDF creation/modification. MIT. ~55KB gzipped. |
| **Drag-and-drop** | svelte-dnd-action | Svelte-native sortable library |
| **Icons** | Lucide | MIT, tree-shakeable |
| **Testing** | Vitest + Playwright | Unit + E2E |

### Architecture Diagram

```
+---------------------------------------------+
|               Main Thread                    |
|                                              |
|  +----------+  +-----------+  +-----------+  |
|  | UI Layer |  |   State   |  |  File I/O |  |
|  | (Svelte) |  |   Store   |  |  (FSAA)   |  |
|  +----+-----+  +-----+-----+  +-----+-----+  |
|       |               |               |       |
|       +---------------+---------------+       |
|                       |                       |
|              +--------+--------+              |
|              | Worker Manager  |              |
|              +--------+--------+              |
+----------------------|------------------------+
                       | postMessage (transferable)
+-----------------------|------------------------+
|              Web Worker Pool                   |
|                                                |
|  +--------------+  +-----------------------+   |
|  |  PDF.js      |  |  pdf-lib              |   |
|  |  (render,    |  |  (merge, split,       |   |
|  |   extract)   |  |   rotate, modify)     |   |
|  +--------------+  +-----------------------+   |
+------------------------------------------------+
```

### Two-Worker Model

1. **Render Worker** (PDF.js) - Page rendering to OffscreenCanvas/ImageBitmap, text extraction, metadata queries. PDF.js has built-in worker support.
2. **Operations Worker** (pdf-lib) - Merge, split, rotate, add text, form fill. Receives ArrayBuffer inputs via transferable, returns Uint8Array results.

Separate workers ensure a long merge operation doesn't block thumbnail rendering.

### State Model

```typescript
interface AppState {
  documents: Document[];
  activeDocumentId: string;
  selection: Set<string>;       // Selected page IDs
  clipboard: PageRef[];         // Cut/copied pages
  undoStack: Action[];
  redoStack: Action[];
}

interface Document {
  id: string;
  name: string;
  sourceFile: File | FileSystemFileHandle;
  pdfBytes: Uint8Array;
  pages: PageInfo[];
  thumbnails: Map<number, ImageBitmap>;  // Lazy-loaded
  modified: boolean;
}

interface PageInfo {
  id: string;                   // Unique across all documents
  originalIndex: number;
  rotation: 0 | 90 | 180 | 270;
  sourceDocumentId: string;
}
```

**Key patterns:**
- Immutable state updates with undo/redo via command pattern
- Lazy thumbnail generation with IntersectionObserver
- Deferred PDF reconstruction - track edits as metadata, only materialize final PDF on export
- Memory management - drop pdfBytes after extracting metadata for large files, re-read from FileSystemFileHandle on export

### Performance Budget

| PDF Size | Expected UX | Strategy |
|---|---|---|
| < 10 MB | Instant (<1s) | No special handling |
| 10-50 MB | Fast (1-5s) | Show progress indicator |
| 50-100 MB | Noticeable (5-15s) | Web Worker essential, progress bar |
| 100-200 MB | Slow (15-60s) | Warn user, proceed if confirmed |
| 200+ MB | Unreliable | Block with clear explanation |

### Browser Support

| Browser | Support Level | Notes |
|---|---|---|
| Chrome/Edge 120+ | Full | File System Access API, OffscreenCanvas |
| Firefox 120+ | Degraded | No File System Access API - fallback to download |
| Safari 17+ | Degraded | No File System Access API - fallback to download |

### PWA Strategy

- Service worker caches all app assets for offline use
- `manifest.json` with `display: standalone` for installed-app feel
- No API calls to worry about - app is fully self-contained
- `beforeinstallprompt` for Chromium install prompting

---

## UI/UX Direction

### Layout

```
+----------------------------------------------------------+
|  [Logo] KeMeK PDF Lab              [Undo][Redo] [Export] |
+----------------------------------------------------------+
|  [Doc1.pdf] [Doc2.pdf] [+ Add File]        <- doc tabs   |
+----------------------------------------------------------+
|                                                          |
|  +------+  +------+  +------+  +------+  +------+       |
|  | pg 1 |  | pg 2 |  | pg 3 |  | pg 4 |  | pg 5 |      |
|  |      |  |      |  |      |  |      |  |      |       |
|  | [1]  |  | [2]  |  | [3]  |  | [4]  |  | [5]  |      |
|  +------+  +------+  +------+  +------+  +------+       |
|                                                          |
|  +------+  +------+  +------+                            |
|  | pg 6 |  | pg 7 |  | pg 8 |     <- drag to reorder    |
|  |      |  |      |  |      |                            |
|  | [6]  |  | [7]  |  | [8]  |                            |
|  +------+  +------+  +------+                            |
|                                                          |
+----------------------------------------------------------+
|  3 selected | [Rotate CW] [Rotate CCW] [Delete] | 8 pgs |
+----------------------------------------------------------+
```

### Key UX Patterns

- **Drop zone**: Full-window drop target with visual feedback
- **Multi-select**: Click to select, Shift+click for range, Ctrl+click to toggle
- **Context menu**: Right-click on selection for operations
- **Thumbnail quality**: 150 DPI for thumbnails, lazy-loaded via IntersectionObserver
- **Progress feedback**: Determinate progress bar for operations over 1 second
- **Empty state**: Clear call-to-action to drop or browse for files

---

## File Structure

```
kemek-pdf-lab/
  src/
    app.html
    app.css
    routes/
      +page.svelte          # Main app page
      +layout.svelte        # App shell
    lib/
      components/
        DropZone.svelte      # File drop target
        PageGrid.svelte      # Thumbnail grid
        PageThumbnail.svelte # Individual page card
        Toolbar.svelte       # Top action bar
        StatusBar.svelte     # Bottom status
        DocTabs.svelte       # Document tab bar
        ProgressBar.svelte   # Operation progress
      workers/
        render.worker.ts     # PDF.js rendering worker
        operations.worker.ts # pdf-lib operations worker
        messages.ts          # Typed worker message definitions
      stores/
        app.ts               # Main app state store
        documents.ts         # Document management
        history.ts           # Undo/redo stack
      pdf/
        renderer.ts          # PDF.js wrapper / render queue
        operator.ts          # pdf-lib wrapper / operation queue
        types.ts             # PDF-related type definitions
      utils/
        file-access.ts       # File System Access API + fallback
        id.ts                # ID generation
  static/
    favicon.svg
    manifest.json
  tests/
    unit/
    e2e/
  svelte.config.js
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  package.json
  CLAUDE.md
  SPEC.md
  NEXT-STEPS.md
  README.md
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| pdf-lib unmaintained | Medium - no bug fixes for edge case PDFs | Library is MIT and functionally complete. Fork if needed. Monitor community forks. |
| Memory limits for large PDFs | Medium - tab crashes above ~200MB | Enforce file size limits with clear messaging. Drop bytes from memory when possible. |
| Firefox/Safari lack File System Access | Low - degraded but functional | Feature-detect and fall back to download. Desktop users primarily use Chromium. |
| Complex PDFs fail to parse | Medium - some corporate/scanned PDFs have unusual structures | Catch errors gracefully, show specific error messages, suggest retrying with fewer pages. |
| Svelte 5 still maturing | Low | SvelteKit is production-ready. Runes API is stable. |
