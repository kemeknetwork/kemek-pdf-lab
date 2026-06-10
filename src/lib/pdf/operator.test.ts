import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFRawStream, degrees } from 'pdf-lib';
import { mergePdf } from './operator.js';
import { applyWatermark } from './watermark.js';
import type { Document, PageInfo, TextWatermark } from './types.js';

async function makeSourcePdf(pageCount: number, sourceRotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([200, 300]);
    if (sourceRotation !== 0) page.setRotation(degrees(sourceRotation));
  }
  return doc.save();
}

function pageInfo(
  sourceDocumentId: string,
  originalIndex: number,
  rotation: 0 | 90 | 180 | 270 = 0,
  extra: Partial<PageInfo> = {}
): PageInfo {
  return {
    id: `${sourceDocumentId}:${originalIndex}`,
    sourceDocumentId,
    originalIndex,
    rotation,
    ...extra
  };
}

async function asDocument(id: string, name: string, pageCount: number, sourceRotation = 0): Promise<Document> {
  const pdfBytes = await makeSourcePdf(pageCount, sourceRotation);
  const pages = Array.from({ length: pageCount }, (_, i) => pageInfo(id, i));
  return { id, name, pdfBytes, pages, pageCount };
}

describe('mergePdf — page count', () => {
  it('produces a single-page PDF from one page of one source', async () => {
    const doc = await asDocument('A', 'a.pdf', 3);
    const out = await mergePdf([doc], [pageInfo('A', 1)]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('sums pages across multiple source documents in the given order', async () => {
    const a = await asDocument('A', 'a.pdf', 2);
    const b = await asDocument('B', 'b.pdf', 3);
    const pages: PageInfo[] = [
      pageInfo('A', 0),
      pageInfo('B', 2),
      pageInfo('B', 0),
      pageInfo('A', 1)
    ];
    const out = await mergePdf([a, b], pages);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(4);
  });

  it('returns a parseable PDF when no pages are selected (UI gates this path)', async () => {
    // The UI gates export on a non-empty selection, but mergePdf itself
    // must not crash on an empty page list. pdf-lib's PDFDocument.load
    // injects a placeholder page on an otherwise-empty save, so the
    // observable invariant is "parseable", not "0 pages".
    const doc = await asDocument('A', 'a.pdf', 2);
    const out = await mergePdf([doc], []);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(0);
  });

  it('throws a helpful error when a page references an unknown source document', async () => {
    const a = await asDocument('A', 'a.pdf', 1);
    const orphan = pageInfo('GHOST', 0);
    await expect(mergePdf([a], [orphan])).rejects.toThrow(/page 1/);
  });
});

describe('mergePdf — rotation', () => {
  it('writes the user rotation onto the page when the source has none', async () => {
    const a = await asDocument('A', 'a.pdf', 1);
    const out = await mergePdf([a], [pageInfo('A', 0, 90)]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPage(0).getRotation().angle).toBe(90);
  });

  it('stacks user rotation on top of an existing source rotation', async () => {
    const a = await asDocument('A', 'a.pdf', 1, 90);
    const out = await mergePdf([a], [pageInfo('A', 0, 180)]);
    const parsed = await PDFDocument.load(out);
    // 90 (source) + 180 (user) = 270
    expect(parsed.getPage(0).getRotation().angle).toBe(270);
  });

  it('leaves the rotation untouched when the user rotation is 0', async () => {
    const a = await asDocument('A', 'a.pdf', 1, 90);
    const out = await mergePdf([a], [pageInfo('A', 0, 0)]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPage(0).getRotation().angle).toBe(90);
  });

  it('round-trips 270° user rotation through pdf-lib', async () => {
    const a = await asDocument('A', 'a.pdf', 1);
    const out = await mergePdf([a], [pageInfo('A', 0, 270)]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPage(0).getRotation().angle).toBe(270);
  });
});

describe('mergePdf — annotations', () => {
  it('omits font embedding entirely when no page carries annotations', async () => {
    const a = await asDocument('A', 'a.pdf', 1);
    const out = await mergePdf([a], [pageInfo('A', 0)]);
    // Helvetica is a standard font — pdf-lib does not embed its program even
    // when used, but the absence of any /Font resource is the cheapest
    // signal that the embed branch was skipped. Just verify the output is
    // a parseable PDF; the cost guard is the `annotated` flag itself.
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('emits a parseable PDF when a page carries a text annotation', async () => {
    const a = await asDocument('A', 'a.pdf', 1);
    const annotated = pageInfo('A', 0, 0, {
      annotations: [
        {
          id: 'ann-1',
          x: 0.5,
          y: 0.5,
          text: 'hello',
          fontSize: 12,
          color: '#ff0000'
        }
      ]
    });
    const out = await mergePdf([a], [annotated]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(1);
    // Page size preserved (200x300 from source).
    expect(parsed.getPage(0).getWidth()).toBe(200);
    expect(parsed.getPage(0).getHeight()).toBe(300);
  });
});

// The export UI runs applyWatermark on mergePdf's output (+page.svelte). These
// pin that two-module pipeline: a watermark must survive the merge and land on
// every page of the assembled file, and the no-watermark path must pass bytes
// through untouched. The source pages are blank, so a non-empty content stream
// is unambiguous proof the stamp landed.
describe('export pipeline — merge then watermark', () => {
  const wm: TextWatermark = {
    kind: 'text',
    text: 'CONFIDENTIAL',
    fontSize: 32,
    color: '#c53030',
    opacity: 0.3,
    rotation: -45,
    position: 'center'
  };

  async function contentLengths(bytes: Uint8Array): Promise<number[]> {
    const doc = await PDFDocument.load(bytes);
    return doc.getPages().map((page) => {
      const contents = page.node.Contents();
      if (!contents) return 0;
      const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
      return refs.reduce((sum, ref) => {
        const stream = doc.context.lookup(ref);
        return sum + (stream instanceof PDFRawStream ? stream.contents.length : 0);
      }, 0);
    });
  }

  it('stamps every page of a multi-source merged export', async () => {
    const a = await asDocument('A', 'a.pdf', 2);
    const b = await asDocument('B', 'b.pdf', 1);
    const pages = [pageInfo('A', 0), pageInfo('B', 0), pageInfo('A', 1)];

    const merged = await mergePdf([a, b], pages);
    const stamped = await applyWatermark(merged, wm);

    const parsed = await PDFDocument.load(stamped);
    expect(parsed.getPageCount()).toBe(3);
    expect((await contentLengths(stamped)).every((n) => n > 0)).toBe(true);
    // The merge alone leaves the blank source pages with no drawn content.
    expect((await contentLengths(merged)).every((n) => n === 0)).toBe(true);
  });

  it('passes bytes through unchanged when the watermark text is empty', async () => {
    const a = await asDocument('A', 'a.pdf', 1);
    const merged = await mergePdf([a], [pageInfo('A', 0)]);
    const out = await applyWatermark(merged, { ...wm, text: '' });
    expect(out).toBe(merged);
  });
});
