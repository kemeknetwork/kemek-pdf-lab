import { PDFDocument } from 'pdf-lib';

export type SupportedImageMime = 'image/jpeg' | 'image/png';

// Cap on the longer page dimension in PDF points. A 4032x3024 phone photo
// at 72 DPI is 56x42 inches; without a cap we'd produce absurd page sizes.
const MAX_DIM_PT = 2000;

/**
 * Sniff the leading bytes for a supported image format. Returns null for
 * anything else so callers can fall back to PDF detection.
 */
export function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  return null;
}

/**
 * Wrap a single JPG/PNG in a one-page PDF sized to the image at 72 DPI,
 * capped at {@link MAX_DIM_PT} on the longer axis with aspect ratio preserved.
 * The result is a normal PDF byte stream, so downstream code (renderer,
 * merge/export) treats it identically to user-supplied PDFs.
 */
export async function imageBytesToPdf(
  bytes: Uint8Array,
  mime: SupportedImageMime
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const image =
    mime === 'image/jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);

  const longer = Math.max(image.width, image.height);
  const scale = longer > MAX_DIM_PT ? MAX_DIM_PT / longer : 1;
  const pageW = image.width * scale;
  const pageH = image.height * scale;

  const page = pdf.addPage([pageW, pageH]);
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });

  return pdf.save();
}
