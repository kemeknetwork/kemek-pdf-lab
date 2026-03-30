# KeMeK PDF Lab - Next Steps

Actionable implementation guide organized by phase. Each step is scoped to be completable in a single focused session.

---

## Phase 0: Project Bootstrap

### 0.1 - Scaffold the project
- Initialize SvelteKit with `npx sv create` (Svelte 5, TypeScript, SPA adapter)
- Install core dependencies:
  ```
  npm i pdfjs-dist pdf-lib svelte-dnd-action
  npm i -D tailwindcss @tailwindcss/vite lucide-svelte vitest playwright @playwright/test
  ```
- Configure Vite for Web Workers (`worker` options, WASM support for pdf.js)
- Configure Tailwind via Vite plugin
- Verify `npm run dev` serves a hello world page
- Verify `npm run build` produces a static SPA in `dist/`

### 0.2 - Set up PDF.js worker
- Configure `pdfjs-dist` worker path in Vite (the worker file needs special handling)
- Create a test route that loads a sample PDF and logs page count to console
- Verify PDF.js worker initializes without errors
- **This is the trickiest setup step** - PDF.js worker config in Vite has known gotchas. Consult Vite + PDF.js integration guides. Common solutions: copy worker to `public/`, or use `?url` import.

### 0.3 - Set up pdf-lib worker
- Create `src/lib/workers/operations.worker.ts`
- Define typed message interface in `src/lib/workers/messages.ts`
- Implement a basic echo test: send an ArrayBuffer, receive it back
- Verify transferable object passing works (buffer should be neutered after transfer)

---

## Phase 1: MVP - Merge & Arrange

### 1.1 - File input and drop zone
- Build `DropZone.svelte` - full-window drag target with visual feedback
- Also support `<input type="file" multiple accept=".pdf">`
- On file drop/select: read as `ArrayBuffer`, validate it's a PDF (check `%PDF` magic bytes)
- Store file references in a Svelte store
- Handle errors: non-PDF files, empty files, files too large (>200MB)

### 1.2 - Thumbnail rendering pipeline
- Send loaded PDF bytes to Render Worker
- Worker renders each page to OffscreenCanvas at 150 DPI, returns ImageBitmap
- Main thread receives thumbnails and stores in document state
- Implement lazy rendering: only request thumbnails for pages visible in viewport (IntersectionObserver)
- Display a placeholder/skeleton for un-rendered thumbnails

### 1.3 - Page grid UI
- Build `PageGrid.svelte` - responsive CSS grid of page thumbnails
- Each `PageThumbnail.svelte` shows: rendered image, page number, selection state
- Implement selection: click to select, Shift+click for range, Ctrl+click to toggle
- Visual feedback for selected state (border highlight, checkbox overlay)

### 1.4 - Drag-and-drop reorder
- Integrate `svelte-dnd-action` for sortable page grid
- Pages can be dragged to new positions
- Multi-select drag: dragging a selected page moves all selected pages
- Visual feedback during drag (ghost image, drop indicator)
- Update page order in state on drop

### 1.5 - Page operations
- **Rotate**: Selected pages rotate 90 CW/CCW. Update rotation in state, re-render thumbnail with CSS transform (instant) and queue worker re-render (quality).
- **Delete**: Remove selected pages from state. No confirmation for single page; confirm for 5+ pages.
- Wire operations to toolbar buttons and keyboard shortcuts (R for rotate, Delete/Backspace for delete)

### 1.6 - Undo/Redo
- Implement command pattern: each operation creates an Action object
- Actions: `ReorderAction`, `RotateAction`, `DeleteAction`, `AddDocumentAction`
- Undo pops from undoStack, applies inverse, pushes to redoStack
- Ctrl+Z / Ctrl+Shift+Z bindings
- Clear redo stack when new action is performed

### 1.7 - Multi-document support
- `DocTabs.svelte` - tab bar showing open source files
- "Add File" button/tab to import additional PDFs
- Pages from multiple source documents appear in the same grid
- Each page tracks its `sourceDocumentId` for reconstruction

### 1.8 - Export / Save
- "Export" button triggers PDF reconstruction in Operations Worker
- Worker uses pdf-lib to:
  1. Load each source PDF
  2. Copy pages in new order, applying rotations
  3. Skip deleted pages
  4. Return final Uint8Array
- Progress callback from worker to show progress bar
- **Chromium**: Use `showSaveFilePicker()` for save-to-disk dialog
- **Fallback**: Create Blob URL, trigger download via anchor click
- Feature-detect File System Access API availability

### 1.9 - Polish and launch prep
- Empty state with clear CTA (drop or browse)
- Error boundary for PDF parse failures
- Status bar showing page count, selection count
- Loading states for all async operations
- Favicon and app title
- Basic Playwright E2E: open PDF, reorder, export, verify output

---

## Phase 2: Edit & Enhance

### 2.1 - Split PDF
- Add "Split" operation: select pages, extract into new document
- UI: "Extract Selected" button creates a new tab with those pages
- Export each tab independently

### 2.2 - Text overlay
- Click a page thumbnail to open full-size preview
- In preview mode: click to place text cursor, type to add text
- Store text annotations as overlay metadata
- On export: use pdf-lib `page.drawText()` to burn text into PDF

### 2.3 - PWA
- Create `manifest.json` (name, icons, display: standalone, theme color)
- Create service worker for asset caching (Vite PWA plugin or manual)
- Add install prompt for Chromium browsers
- Test offline functionality

### 2.4 - Preferences
- Save to localStorage: theme preference, default export location (if FSAA), grid size
- Remember last-used directory via File System Access API handles

---

## Phase 3: Advanced Features

### 3.1 - Form filling
- Detect AcroForm fields via pdf-lib
- Render form field overlays on page preview
- Allow editing text fields, toggling checkboxes
- On export: fill form fields via pdf-lib API

### 3.2 - Keyboard shortcuts
- Full keyboard navigation: Tab through pages, arrow keys in grid
- Operation shortcuts: Ctrl+A (select all), Ctrl+D (deselect), R (rotate), Delete
- Shortcut help overlay (?)

### 3.3 - Image import
- Accept JPG/PNG drops alongside PDFs
- Convert images to PDF pages via pdf-lib (embed image, create page at image dimensions)

### 3.4 - Watermark
- Text or image watermark across selected or all pages
- Configurable: position, opacity, rotation, font size
- Preview before applying

---

## Technical Decisions to Make Early

These decisions should be resolved during Phase 0 or early Phase 1:

1. **SvelteKit vs plain Svelte + Vite**: SvelteKit in SPA mode adds routing infrastructure you may not need for a single-page tool. A plain `vite-plugin-svelte` setup is simpler. Decision: if you want zero routing complexity, skip SvelteKit. If you anticipate multiple routes (e.g., `/about`, `/help`), use SvelteKit.

2. **PDF.js worker strategy**: Three options:
   - Copy `pdf.worker.min.mjs` to `public/` and set `workerSrc` manually
   - Use Vite's `?url` import suffix
   - Use `pdfjs-dist/legacy/build/pdf.worker.entry` with Vite worker config
   - Test each and go with what works cleanly with your Vite version.

3. **Thumbnail caching**: Options: hold ImageBitmap in memory (fast but RAM-heavy for 100+ page docs), or render to small canvas and export as data URL (slower but serializable to IndexedDB for persistence). Start with in-memory ImageBitmap, optimize later if memory is an issue.

4. **License choice**: The app is fully client-side and could be open-sourced for trust (users can verify no data exfiltration). Consider MIT or AGPL. Or keep proprietary. Decide before first public release.

---

## Estimated Scope

| Phase | Steps | Complexity |
|---|---|---|
| Phase 0 | 3 steps | Low - scaffolding and config |
| Phase 1 | 9 steps | Medium-High - core product |
| Phase 2 | 4 steps | Medium - incremental features |
| Phase 3 | 4 steps | Medium - independent features |

Phase 0 + Phase 1 together form the MVP. Each Phase 1 step builds on the previous, so they should be done in order. Phase 2 and 3 steps are mostly independent and can be done in any order.
