/**
 * Save bytes to disk — native picker on Chromium (File System Access API) with
 * a blob-download fallback for Firefox and Safari.
 */

interface SaveType {
	description: string;
	mime: string;
	ext: string;
}

const PDF_TYPE: SaveType = { description: 'PDF Document', mime: 'application/pdf', ext: '.pdf' };
const ZIP_TYPE: SaveType = { description: 'ZIP Archive', mime: 'application/zip', ext: '.zip' };

async function saveBytes(bytes: Uint8Array, suggestedName: string, type: SaveType): Promise<void> {
	if ('showSaveFilePicker' in window) {
		try {
			const handle = await (window as any).showSaveFilePicker({
				suggestedName,
				types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }]
			});
			const writable = await handle.createWritable();
			await writable.write(bytes);
			await writable.close();
			return;
		} catch (e: any) {
			if (e.name === 'AbortError') return;
			// Only TypeError means "this browser exposed the API but it's unusable";
			// anything else is a real write failure and must not silently fall back.
			if (e.name !== 'TypeError') throw e;
			console.warn('File System Access API unavailable, using download fallback:', e.message);
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
	URL.revokeObjectURL(url);
}

export function savePdf(bytes: Uint8Array, suggestedName: string): Promise<void> {
	return saveBytes(bytes, suggestedName, PDF_TYPE);
}

export function saveZip(bytes: Uint8Array, suggestedName: string): Promise<void> {
	return saveBytes(bytes, suggestedName, ZIP_TYPE);
}
