import { describe, expect, it, vi } from 'vitest';
import { PDFArray, PDFBool, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { PNG_1X1 } from './test-images.js';
import type { Document, PageInfo } from './types.js';

// No <canvas> in node: stand in for the browser rasterizer with a fixed PNG, so
// the raster paths run and their calls can be checked.
const rendered: string[] = [];
vi.mock('./text-raster.js', () => ({
	renderTextToPng: vi.fn(async (text: string, { fontSize }: { fontSize: number }) => {
		rendered.push(text);
		return { bytes: PNG_1X1, width: text.length * fontSize * 0.5, height: fontSize * 1.2, baseline: fontSize * 0.25, inset: 1 };
	})
}));

const { mergePdf } = await import('./operator.js');
const { choiceDisplay, parseDefaultAppearance } = await import('./forms.js');

const page = (doc: string, index: number, extra: Partial<PageInfo> = {}): PageInfo => ({
	id: `${doc}:${index}`,
	sourceDocumentId: doc,
	originalIndex: index,
	rotation: 0,
	...extra
});

async function formSource(build: (doc: PDFDocument) => void): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([400, 400]);
	build(doc);
	return doc.save();
}

const asDoc = (pdfBytes: Uint8Array, fieldValues?: Record<string, string>): Document => ({
	id: 'F',
	name: 'form.pdf',
	pdfBytes,
	pages: [],
	pageCount: 1,
	...(fieldValues ? { fieldValues } : {})
});

/** All decoded stream text in the file (page content and appearance XObjects). */
async function streamText(bytes: Uint8Array): Promise<string> {
	const doc = await PDFDocument.load(bytes);
	return doc.context
		.enumerateIndirectObjects()
		.map(([, o]) => (o instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(o).decode()).toString('latin1') : ''))
		.join('\n');
}

// pdf-lib writes Helvetica text as hex glyph codes: "Jan" -> <4A616E>.
const hex = (s: string) => `<${Buffer.from(s, 'latin1').toString('hex').toUpperCase()}>`;

const twoFields = () =>
	formSource((doc) => {
		const form = doc.getForm();
		const p = doc.getPage(0);
		form.createTextField('city').addToPage(p, { x: 20, y: 300, width: 200, height: 20 });
		form.createTextField('name').addToPage(p, { x: 20, y: 250, width: 200, height: 20 });
	});

describe('forms — values Helvetica cannot draw', () => {
	it('flattening still burns every other field, and rasterizes the one it cannot encode', async () => {
		rendered.length = 0;
		const out = await mergePdf([asDoc(await twoFields(), { city: 'Łódź', name: 'Jan' })], [page('F', 0)], { flattenForms: true });
		expect(await streamText(out)).toContain(hex('Jan'));
		expect(rendered).toContain('Łódź');
		expect((await PDFDocument.load(out)).getForm().getFields()).toHaveLength(0);
	});

	it('a live form keeps the value and asks the viewer to draw it', async () => {
		const out = await PDFDocument.load(await mergePdf([asDoc(await twoFields(), { city: 'Łódź', name: 'Jan' })], [page('F', 0)]));
		const form = out.getForm();
		expect(form.getTextField('city').getText()).toBe('Łódź');
		expect(form.getTextField('name').getText()).toBe('Jan');
		expect(form.acroForm.dict.get(PDFName.of('NeedAppearances'))).toBe(PDFBool.True);
		// The undrawable field's stale appearance is gone; the drawable one has its own.
		expect(form.getTextField('city').acroField.getWidgets()[0].getAppearances()).toBeUndefined();
		expect(form.getTextField('name').acroField.getWidgets()[0].getAppearances()).toBeDefined();
	});
});

describe('forms — choice fields with export/display pairs', () => {
	const countries = () =>
		formSource((doc) => {
			const dd = doc.getForm().createDropdown('country');
			dd.addOptions(['placeholder']);
			dd.addToPage(doc.getPage(0), { x: 20, y: 300, width: 200, height: 20 });
			// [export, display] pairs, which addOptions cannot write.
			dd.acroField.dict.set(
				PDFName.of('Opt'),
				doc.context.obj([
					[PDFString.of('US'), PDFString.of('United States')],
					[PDFString.of('CA'), PDFString.of('Canada')]
				])
			);
		});

	it('flattening draws the label the user picked, not its code', async () => {
		const out = await mergePdf([asDoc(await countries(), { country: 'CA' })], [page('F', 0)], { flattenForms: true });
		const text = await streamText(out);
		expect(text).toContain(hex('Canada'));
		expect(text).not.toContain(hex('CA') + ' Tj');
	});

	it('a live form stores the export value and shows the label', async () => {
		const out = await PDFDocument.load(await mergePdf([asDoc(await countries(), { country: 'CA' })], [page('F', 0)]));
		const field = out.getForm().getDropdown('country');
		const v = field.acroField.dict.lookup(PDFName.of('V'));
		expect(v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : v).toBe('CA');
		expect(await streamText(await out.save())).toContain(hex('Canada'));
	});

	it('choiceDisplay maps export to display, and passes unknown values through', () => {
		const opts = [{ value: 'CA', display: 'Canada' }, { value: 'plain' }];
		expect(choiceDisplay(opts, 'CA')).toEqual({ display: 'Canada', exportValue: 'CA' });
		expect(choiceDisplay(opts, 'Canada')).toEqual({ display: 'Canada', exportValue: 'CA' });
		expect(choiceDisplay(opts, 'plain')).toEqual({ display: 'plain', exportValue: 'plain' });
		expect(choiceDisplay(opts, 'other')).toEqual({ display: 'other', exportValue: 'other' });
	});
});

describe('forms — carried into the export', () => {
	it('two copies of one form get distinct field names, so editing one leaves the other alone', async () => {
		const bytes = await twoFields();
		const dup = page('F', 0, { id: 'F:0#dup' });
		const out = await PDFDocument.load(await mergePdf([asDoc(bytes)], [page('F', 0), dup]));
		const names = out.getForm().getFields().map((f) => f.getName()).sort();
		expect(names).toEqual(['city', 'city_2', 'name', 'name_2']);
		// Each field's widget sits on its own page.
		const fields = out.context.lookup(out.catalog.get(PDFName.of('AcroForm'))) as unknown as { lookup: (n: PDFName) => PDFArray };
		expect(fields.lookup(PDFName.of('Fields')).size()).toBe(4);
	});

	it('no form in the source means no form in the export', async () => {
		const src = await PDFDocument.create();
		src.addPage([200, 200]);
		const out = await PDFDocument.load(await mergePdf([asDoc(await src.save())], [page('F', 0)]));
		expect(out.catalog.get(PDFName.of('AcroForm'))).toBeUndefined();
	});
});

describe('forms — text overlays Helvetica cannot draw', () => {
	it('rasterize instead of failing the export', async () => {
		rendered.length = 0;
		const src = await PDFDocument.create();
		src.addPage([300, 300]);
		const out = await mergePdf([asDoc(await src.save())], [
			page('F', 0, {
				annotations: [
					{ kind: 'text', id: 'a', x: 0.1, y: 0.2, text: 'Łukasz ✓', fontSize: 14, color: '#000000' },
					{ kind: 'text', id: 'b', x: 0.1, y: 0.4, text: 'Plain', fontSize: 14, color: '#000000' }
				]
			})
		]);
		expect(rendered).toEqual(['Łukasz ✓']);
		const text = await streamText(out);
		expect(text).toContain(hex('Plain'));
		expect(text).toMatch(/\/Image-\d+ Do/);
	});
});

describe('parseDefaultAppearance', () => {
	it('reads size and colour, and reports 0 for auto size', () => {
		expect(parseDefaultAppearance('/Helv 10 Tf 0 0 1 rg')).toEqual({ size: 10, color: 'rgb(0, 0, 255)' });
		expect(parseDefaultAppearance('/Helv 0 Tf 0.5 g')).toEqual({ size: 0, color: 'rgb(128, 128, 128)' });
		expect(parseDefaultAppearance('')).toEqual({ size: 0, color: '#000000' });
	});
});
