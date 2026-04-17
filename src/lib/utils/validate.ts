/**
 * Shared PDF-file validation used by both the drop zone and the window-level
 * drop path. Checks extension, size, and the %PDF- magic header before the
 * file is handed off to the renderer.
 */

export const MAX_SIZE = 200 * 1024 * 1024;
const WARN_SIZE = 100 * 1024 * 1024;

export interface ValidationResult {
	valid: File[];
	errors: string[];
	warnings: string[];
}

function isPdf(file: File): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// Some archives and text files share MIME detection with PDFs; the 5-byte
// header is the only reliable signal before handing bytes to pdf.js.
async function hasPdfMagicBytes(file: File): Promise<boolean> {
	try {
		const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
		return (
			bytes[0] === 0x25 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x44 &&
			bytes[3] === 0x46 &&
			bytes[4] === 0x2d
		);
	} catch {
		return false;
	}
}

export async function validateFiles(files: File[] | FileList): Promise<ValidationResult> {
	const valid: File[] = [];
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const file of Array.from(files)) {
		if (!isPdf(file)) {
			errors.push(`"${file.name}" is not a PDF file.`);
			continue;
		}
		if (file.size > MAX_SIZE) {
			errors.push(`"${file.name}" exceeds the 200 MB size limit.`);
			continue;
		}
		if (!(await hasPdfMagicBytes(file))) {
			errors.push(`"${file.name}" does not appear to be a valid PDF.`);
			continue;
		}
		if (file.size > WARN_SIZE) {
			warnings.push(
				`"${file.name}" is large (${Math.round(file.size / 1024 / 1024)} MB) and may be slow to process.`
			);
		}
		valid.push(file);
	}

	return { valid, errors, warnings };
}
