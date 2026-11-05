// AcroForm handling for export. Two halves, either side of copyPages:
//
//  prepareForm (on each SOURCE document, before its pages are copied): write the
//  user's entered values, generate field appearances ONE FIELD AT A TIME, and,
//  when flattening, burn every field into the page content. pdf-lib generates
//  appearances with WinAnsi Helvetica, so a value like "Kraków" cannot get one:
//  form-wide generation used to throw on it and leave EVERY field blank. Now
//  only that field misses out; it is rasterized onto the page when flattening,
//  or left to the viewer (NeedAppearances) when the form stays live.
//
//  attachForms (on the OUTPUT, after the copy): an AcroForm lives in the catalog,
//  which copyPages never carries, so without this every exported field was a dead
//  drawing however the Flatten toggle was set. It rebuilds the form from the
//  fields whose widgets landed on output pages; scrub.ts later prunes each
//  field's widgets to those pages.
import type {
	PDFCheckBox,
	PDFDict,
	PDFDocument,
	PDFDropdown,
	PDFField,
	PDFFont,
	PDFObject,
	PDFPage,
	PDFRef,
	PDFTextField,
	PDFWidgetAnnotation
} from 'pdf-lib';
import { renderTextToPng } from './text-raster.js';
import { displaySize, displayToUserSpace, normalizeRotation, type PageFrame } from './page-geometry.js';

type Lib = typeof import('pdf-lib');

export interface PreparedForm {
	/** Some field has a value but no generated appearance; viewers must draw it. */
	needAppearances: boolean;
}

/**
 * Resolve a stored radio value to the option pdf-lib's select() expects. pdfjs
 * reports a radio widget's on-state NAME — usually a human string ("free"), but
 * a digit ("0"/"1"/…) when the PDF names states numerically via the /Opt-index
 * convention pdf-lib writes, in which case getOptions() returns the human labels
 * at those positions. select() wants the value as it appears in getOptions().
 *
 * Name-first: if the stored value is itself a valid option, use it directly;
 * only otherwise treat a digit as a positional index into getOptions(). The
 * name check must come first — a PDF can name its on-states with digits that are
 * ALSO real option values but NOT in positional order (getOptions() ["1","0"]),
 * and index-resolving those would silently select the wrong choice on a flattened
 * (unrecoverable) export.
 */
export function resolveRadioValue(value: string, options: string[]): string {
	if (options.includes(value)) return value;
	const idx = Number(value);
	return Number.isInteger(idx) && idx >= 0 && idx < options.length ? options[idx] : value;
}

/**
 * A choice field's options as (export value, display text) pairs. The fill UI
 * stores pdfjs's exportValue; pdf-lib's select() matches DISPLAY text. Selecting
 * the export value of an `[export, display]` /Opt entry used to burn the code
 * ("CA") instead of the label ("Canada"), or fail a listbox's subset check.
 */
export function choiceDisplay(
	options: { value: string; display?: string }[],
	stored: string
): { display: string; exportValue: string } {
	const hit = options.find((o) => o.value === stored) ?? options.find((o) => o.display === stored);
	return hit ? { display: hit.display ?? hit.value, exportValue: hit.value } : { display: stored, exportValue: stored };
}

interface RasterJob {
	page: PDFPage;
	rect: { x: number; y: number; width: number; height: number };
	lines: string[];
	size: number;
	color: string;
}

export async function prepareForm(
	pdf: PDFDocument,
	values: Record<string, string> | undefined,
	flatten: boolean
): Promise<PreparedForm> {
	const lib = await import('pdf-lib');
	const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFName, PDFHexString } = lib;

	let form: ReturnType<PDFDocument['getForm']>;
	try {
		form = pdf.getForm();
	} catch {
		return { needAppearances: false }; // a malformed AcroForm that throws on access
	}
	const fields = form.getFields();
	if (fields.length === 0) return { needAppearances: false };
	const font = form.getDefaultFont();

	// Keyed by ref: pdf-lib hands out a NEW wrapper object from every
	// getFields()/getFieldMaybe() call, so wrapper identity never matches.
	const touched = new Set<PDFRef>();
	// A live choice field keeps its EXPORT value as /V (the spec's meaning);
	// written after appearance generation, which needs the display text selected.
	const exportValues = new Map<PDFField, string>();
	for (const [name, value] of Object.entries(values ?? {})) {
		// A single field rejecting its value (unknown option, over maxLen, exotic
		// type) must not sink the export: it stays unfilled.
		try {
			const field = form.getFieldMaybe(name);
			if (!field) continue;
			if (field instanceof PDFTextField) field.setText(value);
			else if (field instanceof PDFCheckBox) value ? field.check() : field.uncheck();
			else if (field instanceof PDFRadioGroup) {
				if (value) field.select(resolveRadioValue(value, field.getOptions()));
			} else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
				if (!value) continue;
				const options = field.acroField
					.getOptions()
					.map((o) => ({ value: o.value.decodeText(), display: o.display?.decodeText() }));
				const { display, exportValue } = choiceDisplay(options, value);
				field.select(display);
				if (exportValue !== display) exportValues.set(field, exportValue);
			} else continue;
			touched.add(field.ref);
		} catch {
			/* leave this field unfilled */
		}
	}

	let needAppearances = false;
	const raster: RasterJob[] = [];
	for (const field of fields) {
		const textual = field instanceof PDFTextField || field instanceof PDFDropdown || field instanceof PDFOptionList;
		if (!textual) {
			// Check boxes and radios already carry an on and an off appearance; only
			// a widget missing them needs pdf-lib's generic ones.
			const missing = field.acroField.getWidgets().some((w) => !w.getAppearances());
			if (missing) try { (field as PDFCheckBox).updateAppearances(); } catch { needAppearances = true; }
			continue;
		}
		if (!touched.has(field.ref) && !(flatten && field.needsAppearancesUpdate())) continue;
		try {
			(field as PDFTextField).updateAppearances(font);
		} catch {
			needAppearances = true;
			if (flatten) raster.push(...rasterJobs(lib, pdf, field, font));
			// Live: drop the now-stale appearance (it may show an older value), so a
			// viewer draws the new value itself, as NeedAppearances asks it to.
			else for (const w of field.acroField.getWidgets()) w.dict.delete(PDFName.of('AP'));
		}
	}

	if (!flatten) {
		for (const [field, exportValue] of exportValues) {
			field.acroField.dict.set(PDFName.of('V'), PDFHexString.fromText(exportValue));
		}
		return { needAppearances };
	}

	try {
		form.flatten({ updateFieldAppearances: false });
	} catch (e) {
		console.warn('Could not flatten every form field; the rest stay interactive:', e);
	}
	for (const job of raster) await drawRaster(pdf, job);
	return { needAppearances: false };
}

/** Where a field that pdf-lib can't draw would show its value, captured before
 *  flatten removes the widgets. Its own appearance is reset to empty so flatten
 *  has something to burn and nothing doubles up. */
function rasterJobs(lib: Lib, pdf: PDFDocument, field: PDFField, font: PDFFont): RasterJob[] {
	const { PDFTextField, PDFDropdown, PDFOptionList } = lib;
	let text = '';
	if (field instanceof PDFTextField) text = field.getText() ?? '';
	else if (field instanceof PDFDropdown || field instanceof PDFOptionList) text = field.getSelected().join(', ');
	const multiline = field instanceof PDFTextField && field.isMultiline();
	const { size, color } = parseDefaultAppearance(field.acroField.getDefaultAppearance() ?? '');
	const jobs: RasterJob[] = [];
	for (const widget of field.acroField.getWidgets()) {
		const page = widgetPage(pdf, widget);
		if (!page || !text) continue;
		const rect = widget.getRectangle();
		const fitted = size > 0 ? size : Math.max(6, Math.min(12, rect.height * 0.7));
		jobs.push({ page, rect, lines: multiline ? text.split(/\r\n|\r|\n/) : [text], size: fitted, color });
	}
	try {
		if (field instanceof PDFTextField) field.setText('');
		else (field as PDFDropdown).clear();
		(field as PDFTextField).updateAppearances(font);
	} catch {
		/* flatten still burns whatever appearance the widget has */
	}
	return jobs;
}

function widgetPage(pdf: PDFDocument, widget: PDFWidgetAnnotation): PDFPage | undefined {
	const pages = pdf.getPages();
	const p = widget.P();
	const direct = p && pages.find((pg) => pg.ref === p);
	if (direct) return direct;
	const ref = pdf.context.getObjectRef(widget.dict);
	return ref ? pages.find((pg) => pg.node.Annots()?.asArray().includes(ref)) : undefined;
}

/** Font size and fill colour from a field's /DA ("/Helv 10 Tf 0 0 1 rg"). */
export function parseDefaultAppearance(da: string): { size: number; color: string } {
	const tf = /(\d+(?:\.\d+)?)\s+Tf/.exec(da);
	const rgb = /(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+rg/.exec(da);
	const gray = /(\d*\.?\d+)\s+g(?![a-z])/.exec(da);
	const c = (v: string) => Math.round(Math.min(1, Math.max(0, Number(v))) * 255);
	const color = rgb ? `rgb(${c(rgb[1])}, ${c(rgb[2])}, ${c(rgb[3])})` : gray ? `rgb(${c(gray[1])}, ${c(gray[1])}, ${c(gray[1])})` : '#000000';
	return { size: tf ? Number(tf[1]) : 0, color };
}

async function drawRaster(pdf: PDFDocument, job: RasterJob): Promise<void> {
	const { degrees } = await import('pdf-lib');
	const { rect, size } = job;
	// Laid out in the field's DISPLAYED box (the page's /Rotate applied), so the
	// value reads upright on a rotated page like the rest of the form.
	const field: PageFrame = {
		box: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
		rotate: normalizeRotation(job.page.getRotation().angle)
	};
	const box = displaySize(field);
	let top = box.height;
	for (const [i, line] of job.lines.entries()) {
		if (!line) {
			top -= size * 1.2;
			continue;
		}
		try {
			const png = await renderTextToPng(line, { fontSize: size, color: job.color });
			const image = await pdf.embedPng(png.bytes);
			const scale = Math.min(1, (box.width - 4) / png.width);
			const w = png.width * scale;
			const h = png.height * scale;
			const y = job.lines.length === 1 ? (box.height - h) / 2 : top - h - (i === 0 ? 1 : 0);
			const at = displayToUserSpace(field, 2, y);
			job.page.drawImage(image, { x: at.x, y: at.y, width: w, height: h, rotate: degrees(field.rotate) });
			top = y;
		} catch (e) {
			// No canvas (a headless run): this one value stays blank, nothing else does.
			console.warn('Could not draw a form value:', e);
		}
	}
}

/**
 * Rebuild the output's AcroForm from the fields whose widgets were copied onto
 * output pages. `sources` are the opened source documents, for the form-level
 * defaults (/DA, /DR fonts) and their NeedAppearances state.
 */
export async function attachForms(
	output: PDFDocument,
	sources: { pdf: PDFDocument; needAppearances: boolean }[]
): Promise<void> {
	const { PDFName, PDFDict, PDFRef, PDFString, PDFHexString, PDFBool, PDFObjectCopier } = await import('pdf-lib');
	const ctx = output.context;
	const N = (s: string) => PDFName.of(s);

	const roots: PDFRef[] = [];
	const seen = new Set<PDFRef>();
	for (const page of output.getPages()) {
		for (const a of page.node.Annots()?.asArray() ?? []) {
			if (!(a instanceof PDFRef)) continue;
			const widget: PDFObject | undefined = ctx.lookup(a);
			if (!(widget instanceof PDFDict) || widget.lookupMaybe(N('Subtype'), PDFName)?.decodeText() !== 'Widget') continue;
			let node: PDFDict = widget;
			let ref: PDFRef = a;
			for (let depth = 0; depth < 32; depth++) {
				const parent: PDFObject | undefined = node.get(N('Parent'));
				const parentDict: PDFObject | undefined = parent instanceof PDFRef ? ctx.lookup(parent) : undefined;
				if (!(parent instanceof PDFRef) || !(parentDict instanceof PDFDict)) break;
				ref = parent;
				node = parentDict;
			}
			// A widget with no field above it and no field data of its own is not a field.
			if (!node.has(N('FT')) && !node.has(N('T'))) continue;
			if (!seen.has(ref)) {
				seen.add(ref);
				roots.push(ref);
			}
		}
	}
	if (roots.length === 0) return;

	// Same-named fields share ONE value in a viewer, so two copies of a form (or a
	// duplicated page) would mirror each other's edits. Later copies get a suffix.
	const taken = new Set<string>();
	for (const ref of roots) {
		const node = ctx.lookup(ref) as PDFDict;
		const t = node.lookup(N('T'));
		const name = t instanceof PDFString || t instanceof PDFHexString ? t.decodeText() : '';
		if (!name) continue;
		let unique = name;
		for (let n = 2; taken.has(unique); n++) unique = `${name}_${n}`;
		taken.add(unique);
		if (unique !== name) node.set(N('T'), PDFHexString.fromText(unique));
	}

	const acroForm = ctx.obj({}) as PDFDict;
	acroForm.set(N('Fields'), ctx.obj(roots));
	const fonts = ctx.obj({}) as PDFDict;
	let needAppearances = false;
	for (const { pdf, needAppearances: need } of sources) {
		const src = pdf.catalog.lookupMaybe(N('AcroForm'), PDFDict);
		if (!src) continue;
		needAppearances ||= need || src.lookup(N('NeedAppearances')) === PDFBool.True;
		const copier = PDFObjectCopier.for(pdf.context, ctx);
		const da = src.lookup(N('DA'));
		if (da && !acroForm.has(N('DA'))) acroForm.set(N('DA'), copier.copy(da));
		const srcFonts = src.lookupMaybe(N('DR'), PDFDict)?.lookupMaybe(N('Font'), PDFDict);
		for (const [name, font] of srcFonts?.entries() ?? []) if (!fonts.has(name)) fonts.set(name, copier.copy(font));
	}
	if (fonts.keys().length > 0) acroForm.set(N('DR'), ctx.obj({ Font: fonts }));
	if (needAppearances) acroForm.set(N('NeedAppearances'), PDFBool.True);
	output.catalog.set(N('AcroForm'), ctx.register(acroForm));
}
