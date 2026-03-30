# KeMeK PDF Lab

## What This Is

Client-side PDF manipulation tool. Runs entirely in the browser - no server, no uploads, no data leaves the machine. Desktop-first.

## Stack

- **Language**: TypeScript (strict mode)
- **Framework**: Svelte 5, SvelteKit in SPA mode
- **Build**: Vite
- **Styling**: Tailwind CSS 4
- **PDF Rendering**: PDF.js (pdfjs-dist) via Web Worker
- **PDF Manipulation**: pdf-lib via Web Worker
- **DnD**: svelte-dnd-action
- **Testing**: Vitest (unit), Playwright (E2E)

## Architecture

- Two-worker model: Render Worker (PDF.js) + Operations Worker (pdf-lib)
- All heavy PDF processing runs in Web Workers, never on main thread
- State managed via Svelte stores with command pattern for undo/redo
- Thumbnails lazy-loaded via IntersectionObserver at 150 DPI
- PDF reconstruction is deferred - edits tracked as metadata, materialized only on export
- File System Access API for Chromium save-in-place, download fallback for Firefox/Safari

## Conventions

- All files use LF line endings (enforced via .gitattributes)
- Components in `src/lib/components/`, one component per file
- Worker message types defined in `src/lib/workers/messages.ts`
- PDF bytes transferred to/from workers via transferable ArrayBuffers, never copied
- No external API calls - this app is fully offline-capable
- Feature-detect browser APIs, never user-agent sniff
- File size limits enforced with user-facing messages (warn at 100MB, block at 200MB)

## Key Files

- `SPEC.md` - Full product specification with feature phases and architecture
- `NEXT-STEPS.md` - Actionable implementation guide

## Copyright

- Legal/copyright: KeMeK Network
- Developer credit: kVadrum
