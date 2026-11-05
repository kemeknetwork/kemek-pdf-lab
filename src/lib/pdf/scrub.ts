// The last step before ANY pdf-lib document is written (pdf-doc.ts serializePdf).
//
// copyPages copies every object a page reaches, not just what the page shows.
// A kept page's link into a deleted page, or a form field whose other widget sat
// on a deleted page, drags that whole page (content stream included) into the
// output as an orphan object: invisible in a viewer, recoverable by any parser.
// A page tree that shares one /Resources dict (common from older generators)
// carries every page's images on every page. And page- and annotation-level
// metadata (XMP, /PieceInfo, authors, dates) and JavaScript actions ride along
// verbatim, since only the document-level Info/XMP is left behind.
//
// So the output is scrubbed in place, then every object no longer reachable from
// the trailer is deleted. The sweep is the guarantee; the edge-cutting above it is
// what makes orphans unreachable. Idempotent, so the watermark and stamp passes
// re-running it on mergePdf's output change nothing.
import type { PDFDict, PDFDocument, PDFObject, PDFPage, PDFRef } from 'pdf-lib';

type Lib = typeof import('pdf-lib');

// Page keys that are metadata, private application data or script, never content.
const PAGE_KEYS = [
	'Metadata', // page-level XMP
	'PieceInfo', // authoring-app private data (Illustrator, Photoshop …)
	'LastModified',
	'AA', // page open/close actions: JavaScript
	'Thumb', // embedded thumbnail of the ORIGINAL page, stale after any edit
	'B', // article beads: a chain through other pages
	'SeparationInfo', // lists sibling pages
	'ID', // web-capture digital identifier
	'PZ',
	'StructParents' // index into a structure tree the output does not carry
];
// Annotation keys: modified/creation dates, unique ids, structure index, scripts.
const ANNOT_KEYS = ['M', 'CreationDate', 'NM', 'StructParent', 'AA'];
// Action types that run code, launch programs or send data off the page.
const UNSAFE_ACTIONS = new Set(['JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'Rendition', 'GoToE']);

export async function scrubForExport(pdf: PDFDocument): Promise<void> {
	const lib = await import('pdf-lib');
	const { PDFName, PDFDict, PDFArray, PDFRef } = lib;
	const ctx = pdf.context;
	const N = (s: string) => PDFName.of(s);
	const pages = pdf.getPages();
	const pageRefs = new Set<PDFRef>(pages.map((p) => p.ref));

	// Every annotation that actually sits on an output page.
	const onPage = new Set<PDFRef>();
	for (const page of pages) {
		for (const a of page.node.Annots()?.asArray() ?? []) if (a instanceof PDFRef) onPage.add(a);
	}

	const keepDest = (dest: PDFObject | undefined): boolean => {
		// Only an explicit destination onto a page that is IN this file survives;
		// named destinations point into a catalog name tree the output never has.
		const arr = dest instanceof PDFArray ? dest : undefined;
		const target = arr?.get(0);
		return target instanceof PDFRef && pageRefs.has(target);
	};

	const scrubAction = (holder: PDFDict) => {
		const action = holder.lookupMaybe(N('A'), PDFDict);
		if (!action) return;
		action.delete(N('Next')); // a chain can hide a script behind a harmless first action
		const type = action.lookupMaybe(N('S'), PDFName)?.decodeText();
		if (!type || UNSAFE_ACTIONS.has(type) || (type === 'GoTo' && !keepDest(action.lookup(N('D'))))) {
			holder.delete(N('A'));
		}
	};

	const acroForm = pdf.catalog.lookupMaybe(N('AcroForm'), PDFDict);

	for (const page of pages) {
		const node = page.node;
		for (const key of PAGE_KEYS) node.delete(N(key));
		pruneUnusedXObjects(lib, page);

		const annots = node.Annots()?.asArray() ?? [];
		// Drop entries that resolve to nothing: pdf-lib's flatten deletes a field's
		// widget objects but removes the wrong ref from /Annots, leaving a pointer
		// to a missing object in every flattened page.
		const live = annots.filter((a) => (a instanceof PDFRef ? ctx.lookup(a) : a) instanceof PDFDict);
		if (live.length !== annots.length) {
			if (live.length > 0) node.set(N('Annots'), ctx.obj(live));
			else node.delete(N('Annots'));
		}
		for (const item of live) {
			const annot = item instanceof PDFRef ? ctx.lookup(item) : item;
			if (!(annot instanceof PDFDict)) continue;
			const isWidget = annot.lookupMaybe(N('Subtype'), PDFName)?.decodeText() === 'Widget';
			for (const key of ANNOT_KEYS) annot.delete(N(key));
			// On a markup annotation /T is the AUTHOR; on a widget it is the field name.
			if (!isWidget) annot.delete(N('T'));
			annot.set(N('P'), page.ref);
			for (const key of ['Popup', 'IRT']) {
				const target = annot.get(N(key));
				if (target instanceof PDFRef && !onPage.has(target)) annot.delete(N(key));
			}
			if (annot.has(N('Dest')) && !keepDest(annot.lookup(N('Dest')))) annot.delete(N('Dest'));
			scrubAction(annot);
			// With no form in the output a widget is a drawn appearance only; its
			// field tree would just tie it to widgets on other (deleted) pages.
			if (isWidget && !acroForm) annot.delete(N('Parent'));
		}
	}

	if (acroForm) pruneFieldTree(lib, pdf, acroForm, onPage);
	collectGarbage(lib, pdf);
}

/**
 * Keep only fields that still have a widget on an output page, and strip what a
 * field carries beyond its visible value: calculation/format scripts and a
 * signature's value (signer name, date, certificate), which no longer verifies
 * against an edited file anyway.
 */
function pruneFieldTree(lib: Lib, pdf: PDFDocument, acroForm: PDFDict, onPage: Set<PDFRef>): void {
	const { PDFName, PDFDict, PDFArray, PDFRef } = lib;
	const N = (s: string) => PDFName.of(s);
	const ctx = pdf.context;

	const alive = (item: PDFObject, depth: number): boolean => {
		if (depth > 32) return false; // a cyclic /Kids chain is malformed; drop it
		const node = item instanceof PDFRef ? ctx.lookup(item) : item;
		if (!(node instanceof PDFDict)) return false;
		node.delete(N('AA'));
		const ft = node.lookupMaybe(N('FT'), PDFName)?.decodeText();
		if (ft === 'Sig') node.delete(N('V'));
		const kids = node.lookupMaybe(N('Kids'), PDFArray);
		if (!kids) {
			// A terminal node is its own widget: alive only if it is on a page.
			return item instanceof PDFRef && onPage.has(item);
		}
		const kept = kids.asArray().filter((k) => alive(k, depth + 1));
		node.set(N('Kids'), ctx.obj(kept));
		// A field node whose kids all went is gone; a widget among kids counted above.
		return kept.length > 0;
	};

	const fields = acroForm.lookupMaybe(N('Fields'), PDFArray)?.asArray() ?? [];
	const kept = fields.filter((f) => alive(f, 0));
	acroForm.delete(N('XFA')); // an XFA form duplicates the data in its own packets
	if (kept.length === 0) pdf.catalog.delete(N('AcroForm'));
	else acroForm.set(N('Fields'), ctx.obj(kept));
}

/**
 * Narrow a page's /XObject resources to the names its content streams actually
 * use. A /Resources dict shared across a whole source document lists every
 * page's images, so without this a one-page export of a scanned document can
 * carry every scan. Conservative: any `/Name` token anywhere in the content
 * counts as a use, and an undecodable stream leaves the page untouched.
 */
function pruneUnusedXObjects(lib: Lib, page: PDFPage): void {
	const { PDFName, PDFDict } = lib;
	const node = page.node;
	const resources = node.Resources();
	const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
	if (!resources || !xobjects) return;
	const used = contentNames(lib, page);
	if (!used) return;
	const keys = xobjects.keys();
	if (keys.every((k) => used.has(k.decodeText()))) return;

	const ctx = page.doc.context;
	const narrowed = ctx.obj({}) as PDFDict;
	for (const k of keys) if (used.has(k.decodeText())) narrowed.set(k, xobjects.get(k)!);
	// Clone, never mutate: the dict may be shared with pages that use other images.
	const own = resources.clone(ctx);
	own.set(PDFName.of('XObject'), narrowed);
	node.set(PDFName.of('Resources'), own);
}

/** Every name token in a page's content streams (#xx escapes decoded), or null
 *  when a stream can't be decoded. */
function contentNames(lib: Lib, page: PDFPage): Set<string> | null {
	const { PDFArray, PDFRawStream, PDFFlateStream, decodePDFRawStream } = lib;
	const ctx = page.doc.context;
	const contents = page.node.Contents();
	const streams = contents instanceof PDFArray ? contents.asArray().map((r) => ctx.lookup(r)) : [contents];
	const names = new Set<string>();
	for (const s of streams) {
		if (!s) continue;
		let bytes: Uint8Array;
		try {
			if (s instanceof PDFRawStream) bytes = decodePDFRawStream(s).decode();
			else if (s instanceof PDFFlateStream) bytes = s.getUnencodedContents();
			else return null;
		} catch {
			return null;
		}
		collectNames(bytes, names);
	}
	return names;
}

const DELIMITER = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isNameChar = (c: number) => c > 0x20 && c < 0x7f && !DELIMITER.has(c);

export function collectNames(bytes: Uint8Array, into: Set<string>): Set<string> {
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] !== 0x2f) continue;
		let j = i + 1;
		let name = '';
		while (j < bytes.length && isNameChar(bytes[j])) {
			if (bytes[j] === 0x23 && j + 2 < bytes.length) {
				const hex = String.fromCharCode(bytes[j + 1], bytes[j + 2]);
				if (/^[0-9a-fA-F]{2}$/.test(hex)) {
					name += String.fromCharCode(parseInt(hex, 16));
					j += 3;
					continue;
				}
			}
			name += String.fromCharCode(bytes[j]);
			j++;
		}
		if (name) into.add(name);
		i = j - 1;
	}
	return into;
}

/** Delete every indirect object the trailer can no longer reach. */
function collectGarbage(lib: Lib, pdf: PDFDocument): void {
	const { PDFDict, PDFArray, PDFRef, PDFStream } = lib;
	const ctx = pdf.context;
	const reached = new Set<PDFRef>();
	const stack: PDFObject[] = [];
	const { Root, Info, Encrypt } = ctx.trailerInfo;
	for (const o of [Root, Info, Encrypt]) if (o) stack.push(o as PDFObject);
	while (stack.length > 0) {
		const o = stack.pop()!;
		if (o instanceof PDFRef) {
			if (reached.has(o)) continue;
			reached.add(o);
			const target = ctx.lookup(o);
			if (target) stack.push(target);
		} else if (o instanceof PDFDict) {
			for (const [, v] of o.entries()) stack.push(v);
		} else if (o instanceof PDFArray) {
			for (const v of o.asArray()) stack.push(v);
		} else if (o instanceof PDFStream) {
			stack.push(o.dict);
		}
	}
	const unreachable: PDFRef[] = [];
	for (const [ref] of ctx.enumerateIndirectObjects()) if (!reached.has(ref)) unreachable.push(ref);
	for (const ref of unreachable) ctx.delete(ref);
}
