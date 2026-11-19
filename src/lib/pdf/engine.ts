/**
 * Everything the page calls once files arrive: open / unlock, export, split,
 * extract. It is one lazy chunk (`pdfEngine()` in +page.svelte), so the drop
 * page's first paint carries none of it; the page prefetches it on idle with
 * the workspace. Import it only through that loader, never statically from an
 * eager module, or the whole graph lands back in the initial bundle.
 */
export {
	loadDocument,
	releaseAll,
	releaseDocument,
	renderBytesToImages,
	extractEmbeddedImages,
	extractText
} from './renderer.js';
export { DamagedPdfError, decryptPdf, isPasswordRequired, WrongPasswordError } from './decrypt.js';
export { openSources, renderExport } from './operator.js';
export { splitGroups } from './split.js';
export { makeZip } from '#lib/utils/zip.js';
