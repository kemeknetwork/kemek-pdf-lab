// What an export must NOT carry. Each case builds a source holding a marker
// string, exports, and searches EVERY object in the output (object streams
// expanded, streams decoded) — the reach of any PDF parser, not just a viewer.
import { describe, expect, it } from 'vitest';
import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFRawStream,
	PDFRef,
	PDFStream,
	PDFString,
	decodePDFRawStream
} from 'pdf-lib';
import { mergePdf } from './operator.js';
import { applyWatermark } from './watermark.js';
import { imageBytesToPdf } from './image-import.js';
import { collectNames } from './scrub.js';
import { JPG_1X1, PNG_1X1 } from './test-images.js';
import type { Document, PageInfo } from './types.js';

async function everything(bytes: Uint8Array): Promise<string> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	let s = '';
	for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
		s += `\n${ref} ${obj instanceof PDFRawStream ? obj.dict.toString() : obj.toString()}`;
		if (obj instanceof PDFRawStream) {
			try {
				s += Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1');
			} catch {
				s += '<undecodable>';
			}
		}
	}
	return s;
}

const page = (doc: string, index: number, extra: Partial<PageInfo> = {}): PageInfo => ({
	id: `${doc}:${index}`,
	sourceDocumentId: doc,
	originalIndex: index,
	rotation: 0,
	...extra
});
const asDoc = (id: string, pdfBytes: Uint8Array, pageCount: number, extra: Partial<Document> = {}): Document => ({
	id,
	name: `${id}.pdf`,
	pdfBytes,
	pages: [],
	pageCount,
	...extra
});

/** Three pages with greppable content; page 1 carries the leak vectors. */
async function leakySource(): Promise<Uint8Array> {
	const src = await PDFDocument.create({ updateMetadata: false });
	const ctx = src.context;
	const [p1, p2, p3] = [src.addPage([612, 792]), src.addPage([612, 792]), src.addPage([612, 792])];
	const stream = (s: string) => ctx.register(ctx.stream(s));
	p1.node.set(PDFName.Contents, stream('BT /F1 12 Tf 72 700 Td (KEEP-PAGE-ONE) Tj ET'));
	p2.node.set(PDFName.Contents, stream('BT /F1 12 Tf 72 700 Td (DELETED-PAGE-2-SSN) Tj ET'));
	p3.node.set(PDFName.Contents, stream('BT /F1 12 Tf 72 700 Td (DELETED-PAGE-3-SALARY) Tj ET'));
	const tocToDeleted = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 600, 200, 620], Dest: [p3.ref, 'XYZ', null, null, null] }));
	const jsLink = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 560, 200, 580], A: { S: 'JavaScript', JS: PDFString.of('app.alert("LINK-JS")') } }));
	const note = ctx.register(
		ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 600, 320, 620], T: PDFString.of('NOTE-AUTHOR-ALICE'), M: PDFString.of('D:20190101120000Z'), Contents: PDFString.of('visible note') })
	);
	// One field, two widgets: page 1 (kept) and page 2 (deleted).
	const fieldRef = ctx.nextRef();
	const w1 = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', Rect: [72, 500, 200, 520], Parent: fieldRef, P: p1.ref }));
	const w2 = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', Rect: [72, 500, 200, 520], Parent: fieldRef, P: p2.ref }));
	ctx.assign(fieldRef, ctx.obj({ FT: 'Tx', T: PDFString.of('ssn'), V: PDFString.of('shown-value'), Kids: [w1, w2], AA: { K: { S: 'JavaScript', JS: PDFString.of('FIELD-KEYSTROKE-JS') } } }));
	src.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [fieldRef] }));
	p1.node.set(PDFName.of('Annots'), ctx.obj([tocToDeleted, jsLink, note, w1]));
	p2.node.set(PDFName.of('Annots'), ctx.obj([w2]));
	p1.node.set(PDFName.of('Metadata'), stream('<x:xmpmeta>XMP-CREATOR-BOB</x:xmpmeta>'));
	p1.node.set(PDFName.of('PieceInfo'), ctx.obj({ Illustrator: { Private: stream('PIECEINFO-CAROL') } }));
	p1.node.set(PDFName.of('AA'), ctx.obj({ O: { S: 'JavaScript', JS: PDFString.of('PAGE-OPEN-JS') } }));
	return src.save({ useObjectStreams: false });
}

describe('export scrub — nothing from deleted pages or page metadata', () => {
	it('drops deleted pages reached through links and form fields, plus page metadata and scripts', async () => {
		const input = await everything(await leakySource());
		const out = await everything(await mergePdf([asDoc('L', await leakySource(), 3)], [page('L', 0)]));
		for (const secret of [
			'DELETED-PAGE-3-SALARY',
			'DELETED-PAGE-2-SSN',
			'XMP-CREATOR-BOB',
			'PIECEINFO-CAROL',
			'NOTE-AUTHOR-ALICE',
			'D:20190101120000Z',
			'PAGE-OPEN-JS',
			'LINK-JS',
			'FIELD-KEYSTROKE-JS'
		]) {
			expect(input, secret).toContain(secret); // positive control
			expect(out, secret).not.toContain(secret);
		}
		// What the kept page shows stays.
		expect(out).toContain('KEEP-PAGE-ONE');
		expect(out).toContain('visible note');
		expect(out).toContain('shown-value');
	});

	it('keeps a link to a page that IS exported, and the field live on the kept page', async () => {
		const bytes = await leakySource();
		const out = await PDFDocument.load(await mergePdf([asDoc('L', bytes, 3)], [page('L', 0), page('L', 2)]));
		const [first, third] = out.getPages();
		const link = out.context.lookup(first.node.Annots()!.get(0)) as PDFDict;
		const dest = link.lookup(PDFName.of('Dest')) as PDFArray;
		expect(dest.get(0)).toBe(third.ref);
		const field = out.getForm().getTextField('ssn');
		expect(field.acroField.getWidgets()).toHaveLength(1);
	});

	it('leaves no page object outside the page tree', async () => {
		const out = await PDFDocument.load(await mergePdf([asDoc('L', await leakySource(), 3)], [page('L', 0)]));
		const pageDicts = out.context
			.enumerateIndirectObjects()
			.filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('Page'));
		expect(pageDicts).toHaveLength(1);
	});

	it('drops images that only a deleted page used, from a resource dict shared by all pages', async () => {
		const src = await PDFDocument.create();
		const ctx = src.context;
		const image = (marker: string) =>
			ctx.register(
				ctx.stream(`IMAGE-BYTES-${marker}`, { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 })
			);
		// The shape older generators write: one /Resources on the page TREE.
		const shared = ctx.obj({ XObject: { ImA: image('KEPT'), ImB: image('DELETED-SCAN') } });
		src.addPage([200, 200]).node.set(PDFName.Contents, ctx.register(ctx.stream('q 10 0 0 10 0 0 cm /ImA Do Q')));
		src.addPage([200, 200]).node.set(PDFName.Contents, ctx.register(ctx.stream('q 10 0 0 10 0 0 cm /ImB Do Q')));
		for (const p of src.getPages()) p.node.delete(PDFName.of('Resources'));
		const tree = src.catalog.lookup(PDFName.of('Pages')) as PDFDict;
		tree.set(PDFName.of('Resources'), shared);
		const bytes = await src.save({ useObjectStreams: false });

		const out = await everything(await mergePdf([asDoc('S', bytes, 2)], [page('S', 0)]));
		expect(out).toContain('IMAGE-BYTES-KEPT');
		expect(out).not.toContain('IMAGE-BYTES-DELETED-SCAN');
	});

	it('leaves no reference to a missing object (the default form font is written)', async () => {
		const src = await PDFDocument.create();
		const p = src.addPage([400, 300]);
		src.getForm().createTextField('city').addToPage(p, { x: 50, y: 200, width: 200, height: 24 });
		const out = await PDFDocument.load(
			await mergePdf([asDoc('F', await src.save(), 1, { fieldValues: { city: 'Lisbon' } })], [page('F', 0)], { flattenForms: true })
		);
		const missing: string[] = [];
		const seen = new Set<PDFRef>();
		const walk = (o: unknown): void => {
			if (o instanceof PDFRef) {
				if (seen.has(o)) return;
				seen.add(o);
				const t = out.context.lookup(o);
				if (t === undefined) missing.push(o.toString());
				else walk(t);
			} else if (o instanceof PDFDict) for (const [, v] of o.entries()) walk(v);
			else if (o instanceof PDFArray) for (const v of o.asArray()) walk(v);
			else if (o instanceof PDFStream) walk(o.dict);
		};
		walk(out.context.trailerInfo.Root);
		expect(missing).toEqual([]);
	});
});

describe('export scrub — user JPEGs', () => {
	const exif = (() => {
		const tiff = new Uint8Array(26);
		const dv = new DataView(tiff.buffer);
		tiff.set([0x49, 0x49], 0);
		dv.setUint16(2, 42, true);
		dv.setUint32(4, 8, true);
		dv.setUint16(8, 1, true);
		dv.setUint16(10, 0x0112, true);
		dv.setUint16(12, 3, true);
		dv.setUint32(14, 1, true);
		dv.setUint16(18, 6, true); // rotate 90° clockwise to display
		const body = [...Buffer.from('Exif\0\0', 'latin1'), ...tiff, ...Buffer.from('GPS-LAT-40.7488', 'latin1')];
		return [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
	})();
	/** A 2×1 (landscape as stored) JPEG with EXIF: pdf-lib reads size from SOF0 only. */
	const photo = (() => {
		const b = Uint8Array.from(JPG_1X1);
		const sof = b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xc0);
		b[sof + 7] = 0;
		b[sof + 8] = 2; // width 2
		return Uint8Array.from([...b.subarray(0, 20), ...exif, ...b.subarray(20)]);
	})();
	const gps = 'GPS-LAT-40.7488';

	it('an imported photo loses its EXIF and stands upright', async () => {
		expect(Buffer.from(photo).toString('latin1')).toContain(gps); // positive control
		const pdf = await imageBytesToPdf(photo, 'image/jpeg');
		expect(await everything(pdf)).not.toContain(gps);
		const { width, height } = (await PDFDocument.load(pdf)).getPage(0).getSize();
		expect(height).toBeGreaterThan(width); // stored 2×1, displayed 1×2
	});

	it('an uploaded JPEG signature and an image watermark lose their EXIF', async () => {
		const src = await PDFDocument.create();
		src.addPage([200, 200]);
		const doc = asDoc('A', await src.save(), 1);
		const signed = await mergePdf([doc], [
			page('A', 0, { annotations: [{ kind: 'image', id: 's', x: 0.1, y: 0.1, width: 0.3, height: 0.2, imageBytes: photo, imageMime: 'image/jpeg' }] })
		]);
		expect(await everything(signed)).not.toContain(gps);
		const marked = await applyWatermark(signed, {
			kind: 'image',
			imageBytes: photo,
			imageMime: 'image/jpeg',
			scale: 10,
			opacity: 0.5,
			rotation: 0,
			position: 'center'
		});
		expect(await everything(marked)).not.toContain(gps);
	});

	it('a PNG still embeds', async () => {
		const pdf = await imageBytesToPdf(PNG_1X1, 'image/png');
		expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
	});
});

describe('mergePdf — documents not in the export', () => {
	it('never opens a document none of whose pages are exported', async () => {
		const src = await PDFDocument.create();
		src.addPage([200, 200]);
		// A file pdf-lib cannot open (here: not a PDF at all; in the app, one that
		// is still encrypted) must not fail an export it has no pages in.
		const broken = asDoc('X', new TextEncoder().encode('not a pdf'), 1);
		const out = await mergePdf([asDoc('A', await src.save(), 1), broken], [page('A', 0)]);
		expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
	});
});

describe('collectNames', () => {
	it('reads name tokens, decoding #xx escapes and stopping at delimiters', () => {
		const names = collectNames(new TextEncoder().encode('q /Im#200 Do /F1 12 Tf [/A/B]<</C 1>>'), new Set());
		expect([...names].sort()).toEqual(['A', 'B', 'C', 'F1', 'Im 0']);
	});
});
