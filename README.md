# KeMeK PDF Lab

A privacy-first PDF manipulation tool that runs entirely in your browser. Merge, split, reorder, and rotate PDF pages with a drag-and-drop interface. No uploads, no servers - your files never leave your machine.

## Status

**Pre-development** - Specification and architecture complete. See [NEXT-STEPS.md](NEXT-STEPS.md) for implementation plan.

## Features (Planned)

- Merge multiple PDFs into one
- Reorder pages via drag-and-drop
- Rotate and delete pages
- Split PDFs into separate files
- Text overlays and annotations
- Form filling (AcroForm)
- Works offline as an installable PWA

## Tech Stack

Svelte 5 + TypeScript + Vite + Tailwind CSS, powered by PDF.js (rendering) and pdf-lib (manipulation). All processing happens in Web Workers.

## Development

```bash
npm install
npm run dev
```

## License

Copyright KeMeK Network. License TBD.

---

Built by kVadrum
