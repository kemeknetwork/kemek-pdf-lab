/**
 * Shared file validation used by both the drop zone and the window-level
 * drop path. Accepts PDFs directly and converts JPG/PNG images into
 * single-page PDFs in-stream so downstream code only ever sees PDFs.
 */

import { detectImageMime, imageBytesToPdf } from '#lib/pdf/image-import.js';

export const MAX_SIZE = 200 * 1024 * 1024;
const WARN_SIZE = 100 * 1024 * 1024;

export interface ValidationResult {
  valid: File[];
  errors: string[];
  warnings: string[];
}

function hasPdfExt(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf');
}

function hasImageExt(name: string): boolean {
  return /\.(jpe?g|png)$/i.test(name);
}

function hasPdfMime(file: File): boolean {
  return file.type === 'application/pdf';
}

function hasImageMime(file: File): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png';
}

// Magic-byte sniff is the only reliable signal before handing bytes to
// pdf.js or pdf-lib — extension/MIME claims aren't trustworthy here.
function isPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

async function sniff(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 8).arrayBuffer());
}

export async function validateFiles(files: File[] | FileList): Promise<ValidationResult> {
  const valid: File[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of Array.from(files)) {
    const looksLikePdf = hasPdfMime(file) || hasPdfExt(file.name);
    const looksLikeImage = hasImageMime(file) || hasImageExt(file.name);

    if (!looksLikePdf && !looksLikeImage) {
      errors.push(`"${file.name}" is not a PDF or image file.`);
      continue;
    }

    if (file.size > MAX_SIZE) {
      errors.push(`"${file.name}" exceeds the 200 MB size limit.`);
      continue;
    }

    const head = await sniff(file);

    if (isPdfMagic(head)) {
      if (file.size > WARN_SIZE) {
        warnings.push(
          `"${file.name}" is large (${Math.round(file.size / 1024 / 1024)} MB) and may be slow to process.`
        );
      }
      valid.push(file);
      continue;
    }

    const imageMime = detectImageMime(head);
    if (imageMime) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdfBytes = await imageBytesToPdf(bytes, imageMime);
        const pdfName = file.name.replace(/\.(jpe?g|png)$/i, '') + '.pdf';
        // Synthesize a PDF File so the rest of the pipeline (renderer,
        // re-validation in handleFiles) treats it as a normal PDF.
        valid.push(new File([pdfBytes as BlobPart], pdfName, { type: 'application/pdf' }));
      } catch {
        errors.push(`"${file.name}" could not be converted to a PDF.`);
      }
      continue;
    }

    errors.push(`"${file.name}" does not appear to be a valid PDF or image.`);
  }

  return { valid, errors, warnings };
}
