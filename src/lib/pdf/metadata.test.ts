import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { stripMetadata } from './metadata.js';

// pdf-lib's DEFAULT load re-stamps Producer/ModDate into the in-memory doc at
// load time — so reading stripped bytes with a plain load() would resurrect
// "pdf-lib …" even though the bytes on disk are clean. Inspect the real bytes
// with the same { updateMetadata: false } the engine uses.
const loadRaw = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });

/** A PDF carrying Info-dict metadata AND an XMP metadata stream — both channels
 *  the strip must clear. */
async function pdfWithMetadata(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  doc.setTitle('Secret Title');
  doc.setAuthor('Jane Doe');
  doc.setSubject('Confidential');
  doc.setKeywords(['alpha', 'beta']);
  doc.setProducer('AcmePDF 9.0');
  doc.setCreator('AcmeWriter');
  doc.setCreationDate(new Date('2024-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2024-02-01T00:00:00Z'));
  const xmp = doc.context.stream('<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>', {
    Type: 'Metadata',
    Subtype: 'XML'
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmp));
  return doc.save();
}

describe('stripMetadata', () => {
  it('clears every Info-dict field from the exported PDF', async () => {
    const src = await pdfWithMetadata();
    // Sanity: the source genuinely carries the metadata we expect to remove.
    const before = await PDFDocument.load(src);
    expect(before.getTitle()).toBe('Secret Title');
    expect(before.getAuthor()).toBe('Jane Doe');

    const stripped = await stripMetadata(src);
    const after = await loadRaw(stripped);
    expect(after.getTitle()).toBeUndefined();
    expect(after.getAuthor()).toBeUndefined();
    expect(after.getSubject()).toBeUndefined();
    expect(after.getKeywords()).toBeUndefined();
    expect(after.getCreator()).toBeUndefined();
    expect(after.getCreationDate()).toBeUndefined();
    expect(after.getModificationDate()).toBeUndefined();
  });

  it('does not let pdf-lib re-stamp its own Producer / timestamp on save', async () => {
    // The whole reason the engine loads with { updateMetadata: false }: a default
    // pdf-lib save() would replace the cleared Producer with "pdf-lib …" and a
    // fresh CreationDate. If that regressed, this is the assertion that catches it.
    const stripped = await stripMetadata(await pdfWithMetadata());
    const after = await loadRaw(stripped);
    expect(after.getProducer()).toBeUndefined();
    expect(after.getCreator()).toBeUndefined();
    expect(after.getCreationDate()).toBeUndefined();
  });

  it('removes the XMP metadata stream from the catalog', async () => {
    const stripped = await stripMetadata(await pdfWithMetadata());
    const after = await loadRaw(stripped);
    expect(after.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
  });

  it('preserves page content', async () => {
    const stripped = await stripMetadata(await pdfWithMetadata());
    expect((await loadRaw(stripped)).getPageCount()).toBe(1);
  });

  it('is a clean no-op on a PDF that has no metadata', async () => {
    const bare = await PDFDocument.create();
    bare.addPage([100, 100]);
    // create() seeds Producer/Creator/dates; one strip clears them so "blank" is
    // truly empty, then a second strip must stay clean (idempotent).
    const blank = await stripMetadata(await bare.save());
    const out = await stripMetadata(blank);
    const after = await loadRaw(out);
    expect(after.getAuthor()).toBeUndefined();
    expect(after.getPageCount()).toBe(1);
  });
});
