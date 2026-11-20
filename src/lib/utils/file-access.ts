/**
 * Open files through the system picker (`pickFiles`), and save bytes to disk:
 * the native save picker on Chromium (File System Access API), a blob download
 * on Firefox and Safari.
 */

interface SaveType {
	description: string;
	mime: string;
	ext: string;
}

// Minimal typing for the File System Access API (not in lib.dom for our target).
// Just enough of the showSaveFilePicker → writable shape that a typo in
// createWritable/write/close is caught instead of hiding behind `any`.
interface FilePickerWindow {
	showSaveFilePicker(opts: {
		suggestedName?: string;
		types?: { description: string; accept: Record<string, string[]> }[];
	}): Promise<{ createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }> }>;
}

const PDF_TYPE: SaveType = { description: 'PDF Document', mime: 'application/pdf', ext: '.pdf' };
const ZIP_TYPE: SaveType = { description: 'ZIP Archive', mime: 'application/zip', ext: '.zip' };
const TEXT_TYPE: SaveType = { description: 'Text File', mime: 'text/plain', ext: '.txt' };
const IMAGE_TYPES: Record<'png' | 'jpeg', SaveType> = {
	png: { description: 'PNG Image', mime: 'image/png', ext: '.png' },
	jpeg: { description: 'JPEG Image', mime: 'image/jpeg', ext: '.jpg' }
};

async function saveBytes(bytes: Uint8Array, suggestedName: string, type: SaveType): Promise<void> {
	if ('showSaveFilePicker' in window) {
		try {
			const handle = await (window as unknown as FilePickerWindow).showSaveFilePicker({
				suggestedName,
				types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }]
			});
			const writable = await handle.createWritable();
			await writable.write(bytes as BlobPart);
			await writable.close();
			return;
		} catch (e) {
			if ((e as DOMException).name === 'AbortError') return;
			// Only TypeError means "this browser exposed the API but it's unusable";
			// anything else is a real write failure and must not silently fall back.
			if ((e as DOMException).name !== 'TypeError') throw e;
			console.warn('File System Access API unavailable, using download fallback:', (e as Error).message);
		}
	}

	const blob = new Blob([bytes as BlobPart], { type: type.mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = suggestedName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	// Not revoked on the spot: Safari and Firefox (the browsers that take this
	// fallback) start reading the blob after click() returns, and an early revoke
	// fails or empties the download.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Sanitize a user-supplied base filename: drop control characters, collapse path
 * separators (so a name can't create subdirectories or escape a ZIP entry / OS
 * save dialog), replace the characters Windows refuses in a filename (so a ZIP
 * made from "Q3: report" still extracts there), and neutralize `..` segments.
 * Falls back to "document".
 */
export function sanitizeBaseName(name: string): string {
	// Strip control characters (code point < 0x20) without a control-char regex.
	let printable = '';
	for (const ch of name) {
		if (ch.charCodeAt(0) >= 0x20) printable += ch;
	}
	const clean = printable
		.replace(/[/\\]+/g, '-')
		.replace(/[<>:"|?*]/g, '_')
		.replace(/\.\.+/g, '.')
		.trim();
	return clean || 'document';
}

export function savePdf(bytes: Uint8Array, suggestedName: string): Promise<void> {
	return saveBytes(bytes, suggestedName, PDF_TYPE);
}

export function saveZip(bytes: Uint8Array, suggestedName: string): Promise<void> {
	return saveBytes(bytes, suggestedName, ZIP_TYPE);
}

export function saveText(text: string, suggestedName: string): Promise<void> {
	return saveBytes(new TextEncoder().encode(text), suggestedName, TEXT_TYPE);
}

export function saveImage(
	bytes: Uint8Array,
	suggestedName: string,
	format: 'png' | 'jpeg'
): Promise<void> {
	return saveBytes(bytes, suggestedName, IMAGE_TYPES[format]);
}

// The picker that has not reported yet. Its input stays in the document until
// it does: a detached input is garbage as soon as the opener returns, and a
// collection while the system picker covers the tab (routine on a phone) takes
// the input and its change event with it. The user picks a file and nothing
// happens (reproduced in Chromium, 2026-11-20). file-access.test.ts fails on
// a file input created anywhere else.
let openPicker: { cancel: () => void } | null = null;

/**
 * Show the system file picker. `onpick` gets the chosen files; `oncancel` runs
 * when the user backs out, or when a newer picker replaces one whose browser
 * never reported either way.
 */
export function pickFiles(opts: {
	accept: string;
	multiple: boolean;
	onpick: (files: File[]) => void;
	oncancel?: () => void;
}): void {
	openPicker?.cancel();
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = opts.accept;
	input.multiple = opts.multiple;
	input.hidden = true;
	let settled = false;
	const picker = {
		settle(files: File[]) {
			if (settled) return;
			settled = true;
			input.remove();
			if (openPicker === picker) openPicker = null;
			if (files.length > 0) opts.onpick(files);
			else opts.oncancel?.();
		},
		cancel: () => picker.settle([])
	};
	openPicker = picker;
	input.addEventListener('cancel', picker.cancel);
	input.addEventListener('change', () => picker.settle(Array.from(input.files ?? [])));
	document.body.append(input);
	input.click();
}

/** File extension (".png"/".jpg") for an image format — for building filenames. */
export function imageExt(format: 'png' | 'jpeg'): string {
	return IMAGE_TYPES[format].ext;
}
