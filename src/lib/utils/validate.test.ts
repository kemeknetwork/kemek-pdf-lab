import { describe, it, expect } from 'vitest';
import { validateFiles, MAX_SIZE } from './validate.js';

// %PDF-1.7 — minimum that satisfies the 5-byte magic check.
const PDF_HEAD = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37
]);

// 1x1 transparent PNG — the smallest body pdf-lib's embedPng will accept.
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

function makeFile(bytes: Uint8Array, name: string, type = 'application/pdf'): File {
  // Same BlobPart cast the source uses — the SAB-vs-AB distinction in
  // lib.dom types is overzealous for fixed-size Uint8Array fixtures.
  return new File([bytes as BlobPart], name, { type });
}

// Override File#size without allocating real bytes. We only need the
// predicate to read a large number off the metadata.
function withSize(file: File, size: number): File {
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
}

describe('validateFiles', () => {
  it('accepts a PDF whose first five bytes are %PDF-', async () => {
    const r = await validateFiles([makeFile(PDF_HEAD, 'doc.pdf')]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].name).toBe('doc.pdf');
  });

  it('rejects a file with no PDF/image extension or MIME', async () => {
    const file = new File([PDF_HEAD], 'doc.bin', { type: 'application/octet-stream' });
    const r = await validateFiles([file]);
    expect(r.valid).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/not a PDF or image/);
  });

  it('rejects a .pdf-named file whose body is not a PDF or image', async () => {
    const r = await validateFiles([
      makeFile(Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]), 'fake.pdf')
    ]);
    expect(r.valid).toEqual([]);
    expect(r.errors[0]).toMatch(/does not appear to be a valid PDF or image/);
  });

  it('rejects PDF magic truncated by one byte (missing trailing 0x2d)', async () => {
    // 4-byte prefix of %PDF without the '-' that the sniff requires.
    const r = await validateFiles([
      makeFile(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x20, 0x20, 0x20, 0x20]), 'short.pdf')
    ]);
    expect(r.valid).toEqual([]);
    expect(r.errors[0]).toMatch(/does not appear to be a valid PDF or image/);
  });

  it('rejects a file that exceeds MAX_SIZE before sniffing its body', async () => {
    const r = await validateFiles([withSize(makeFile(PDF_HEAD, 'huge.pdf'), MAX_SIZE + 1)]);
    expect(r.valid).toEqual([]);
    expect(r.errors[0]).toMatch(/exceeds the 200 MB size limit/);
  });

  it('warns but still accepts a PDF above the 100 MB warn threshold', async () => {
    const r = await validateFiles([withSize(makeFile(PDF_HEAD, 'big.pdf'), 150 * 1024 * 1024)]);
    expect(r.errors).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/large/i);
  });

  it('converts a PNG into a synthesized application/pdf File with the .pdf extension', async () => {
    const r = await validateFiles([makeFile(PNG_1X1, 'pic.png', 'image/png')]);
    expect(r.errors).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].type).toBe('application/pdf');
    expect(r.valid[0].name).toBe('pic.pdf');

    // The synthesized File must itself start with %PDF-, otherwise the
    // downstream renderer would reject it.
    const head = new Uint8Array(await r.valid[0].slice(0, 5).arrayBuffer());
    expect(String.fromCharCode(...head)).toBe('%PDF-');
  });

  it('lets the magic-byte sniff win when extension and content disagree', async () => {
    // Extension says PDF; bytes say PNG. The sniff path should still
    // route this through the image converter, not the PDF accept path.
    const r = await validateFiles([makeFile(PNG_1X1, 'mislabeled.pdf')]);
    expect(r.errors).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].type).toBe('application/pdf');
    // The .jpg/.png replace regex doesn't fire on a .pdf-named source,
    // so the synthesized name keeps the original .pdf and the converter
    // appends another. Awkward, but stable — pinning it so a future
    // rename-cleanup is a deliberate decision rather than a surprise.
    expect(r.valid[0].name).toBe('mislabeled.pdf.pdf');
  });

  it('processes a mixed batch: good PDF accepted, gibberish .pdf reported', async () => {
    const good = makeFile(PDF_HEAD, 'a.pdf');
    const bad = makeFile(Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00]), 'b.pdf');
    const r = await validateFiles([good, bad]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].name).toBe('a.pdf');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/b\.pdf/);
  });
});
