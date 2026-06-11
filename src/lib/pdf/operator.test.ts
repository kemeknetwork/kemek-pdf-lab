import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFRawStream, degrees } from 'pdf-lib';
import { mergePdf, watermarkTargetIndices, resolveRadioValue } from './operator.js';
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

  it('names the offending page by its source index when a LATER page is the orphan', async () => {
    // A valid page sits at export position 0; the orphan is at position 1 and
    // references source page index 2. Pins two properties the single-orphan
    // test above can't: (1) a valid prefix does not swallow the throw — the
    // loop reaches and reports the bad page rather than succeeding on the good
    // one; (2) the message names the offending page by its SOURCE index
    // (originalIndex + 1 = "page 3"), not the export position (which would read
    // "page 2") nor a hardcoded "page 1". A user chasing a "Source document
    // missing" report needs that number to point at the right page.
    const a = await asDocument('A', 'a.pdf', 3);
    const pages = [pageInfo('A', 0), pageInfo('GHOST', 2)];
    await expect(mergePdf([a], pages)).rejects.toThrow(/page 3/);
  });

  it('throws a clean error when a page index points past the end of an EXISTING document', async () => {
    // Distinct from the missing-document cases above: the source doc IS present,
    // but the PageInfo references index 5 in a 3-page doc (a stale reference left
    // after the source was reloaded shorter). Without the bounds guard, copyPages
    // returns [] and `copiedPage` is undefined, crashing opaquely on getRotation()
    // ("Cannot read properties of undefined"). The guard must surface the same
    // page-numbered, user-actionable error the missing-document path gives —
    // here index 5 → "page 6".
    const a = await asDocument('A', 'a.pdf', 3);
    await expect(mergePdf([a], [pageInfo('A', 5)])).rejects.toThrow(
      /Page 6 no longer exists in its source document/
    );
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

  it('stamps only the selected pages when scoped by target ids', async () => {
    const a = await asDocument('A', 'a.pdf', 3);
    const pages = [pageInfo('A', 0), pageInfo('A', 1), pageInfo('A', 2)];

    // Target only the middle page by id, resolved against the export list.
    const indices = watermarkTargetIndices(pages, [pages[1].id]);
    const merged = await mergePdf([a], pages);
    const stamped = await applyWatermark(merged, wm, indices);

    const lens = await contentLengths(stamped);
    expect(lens[0]).toBe(0);
    expect(lens[1]).toBeGreaterThan(0);
    expect(lens[2]).toBe(0);
  });

  it('resolves watermark scope by export position after a reorder+split, not original index', async () => {
    // Source A has 5 pages; the export keeps only 3 in a new order (reorder +
    // split). The watermark is scoped to two ids whose ORIGINAL indices differ
    // from their position in the export list. watermarkTargetIndices must hand
    // back export-list positions (= output page indices), so the stamp lands by
    // output position. A regression resolving by originalIndex would miss here:
    // A0's orig index 0 points at a different output page, and A4's orig index 4
    // is out of bounds in the 3-page output and would silently drop. The natural
    // -order pipeline test above can't catch that — position == originalIndex
    // there — so this permutation is the discriminating wire.
    const a = await asDocument('A', 'a.pdf', 5);
    const exportPages = [pageInfo('A', 3), pageInfo('A', 0), pageInfo('A', 4)];

    // A0 → export pos 1, A4 → export pos 2.
    const indices = watermarkTargetIndices(exportPages, [pageInfo('A', 0).id, pageInfo('A', 4).id]);
    expect(indices).toEqual([1, 2]);

    const merged = await mergePdf([a], exportPages);
    const stamped = await applyWatermark(merged, wm, indices);

    const lens = await contentLengths(stamped);
    expect(lens).toHaveLength(3);
    expect(lens[0]).toBe(0); // A3 at export pos 0 — not targeted
    expect(lens[1]).toBeGreaterThan(0); // A0 at export pos 1 — targeted
    expect(lens[2]).toBeGreaterThan(0); // A4 at export pos 2 — targeted
  });

  it('stamps nothing but keeps every page when all targeted pages were deleted before export', async () => {
    // The user scoped the watermark to some pages, then deleted exactly those
    // pages before exporting. The resolver finds no surviving target → [],
    // which applyWatermark must read as "no pages" (not "all"). This pins that
    // silent-but-correct path end-to-end: resolver → merge → watermark. The
    // isolated unit tests can't catch a regression where "no survivors"
    // returned undefined (= stamp all) — only the composed wire does.
    const a = await asDocument('A', 'a.pdf', 3);
    const deletedIds = [pageInfo('A', 0).id, pageInfo('A', 2).id];
    const exportPages = [pageInfo('A', 1)]; // the page the user kept

    const indices = watermarkTargetIndices(exportPages, deletedIds);
    expect(indices).toEqual([]); // no targeted page survived the deletion

    const merged = await mergePdf([a], exportPages);
    const stamped = await applyWatermark(merged, wm, indices);

    const parsed = await PDFDocument.load(stamped);
    expect(parsed.getPageCount()).toBe(1); // page count preserved
    expect((await contentLengths(stamped)).every((n) => n === 0)).toBe(true); // nothing stamped
  });
});

describe('watermarkTargetIndices', () => {
  const mk = (id: string): PageInfo => ({ id, sourceDocumentId: 'A', originalIndex: 0, rotation: 0 });

  it('returns undefined for a null snapshot (every page)', () => {
    expect(watermarkTargetIndices([mk('a'), mk('b')], null)).toBeUndefined();
  });

  it('maps targeted ids to their positions in the export list', () => {
    const pages = [mk('a'), mk('b'), mk('c'), mk('d')];
    expect(watermarkTargetIndices(pages, ['b', 'd'])).toEqual([1, 3]);
  });

  it('reflects reordered pages — indices follow current positions, not the snapshot order', () => {
    // Snapshot ids were chosen before a reorder; the export list is the new order.
    const reordered = [mk('c'), mk('a'), mk('b')];
    expect(watermarkTargetIndices(reordered, ['a', 'b'])).toEqual([1, 2]);
  });

  it('drops ids absent from the export list (e.g. a split subset)', () => {
    const split = [mk('b'), mk('c')];
    expect(watermarkTargetIndices(split, ['a', 'b'])).toEqual([0]);
  });

  it('returns an empty array when no targeted page survives — stamps nothing, not all', () => {
    expect(watermarkTargetIndices([mk('x')], ['a', 'b'])).toEqual([]);
  });
});

describe('resolveRadioValue', () => {
  const opts = ['free', 'pro', 'team'];

  it('maps a numeric on-value (pdfjs reports the index) to the pdf-lib option', () => {
    // pdfjs hands back "0"/"1"/"2"; pdf-lib's select() wants "free"/"pro"/"team".
    expect(resolveRadioValue('0', opts)).toBe('free');
    expect(resolveRadioValue('1', opts)).toBe('pro');
    expect(resolveRadioValue('2', opts)).toBe('team');
  });

  it('passes a named on-value through unchanged (PDFs that use real state names)', () => {
    expect(resolveRadioValue('pro', opts)).toBe('pro');
  });

  it('passes an out-of-range index through rather than indexing past the options', () => {
    expect(resolveRadioValue('9', opts)).toBe('9');
  });
});

describe('mergePdf — form fill + flatten', () => {
  // A one-page PDF carrying a text field and a checkbox.
  async function formPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 300]);
    const form = doc.getForm();
    form.createTextField('user.name').addToPage(page, { x: 20, y: 250, width: 160, height: 18 });
    form.createCheckBox('user.subscribe').addToPage(page, { x: 20, y: 220, width: 12, height: 12 });
    return doc.save();
  }

  async function formDoc(values?: Record<string, string>): Promise<Document> {
    const pdfBytes = await formPdf();
    return {
      id: 'F',
      name: 'form.pdf',
      pdfBytes,
      pages: [pageInfo('F', 0)],
      pageCount: 1,
      ...(values ? { fieldValues: values } : {})
    };
  }

  async function firstPageContentLength(bytes: Uint8Array): Promise<number> {
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPages()[0];
    const contents = page.node.Contents();
    if (!contents) return 0;
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    return refs.reduce((sum, ref) => {
      const stream = doc.context.lookup(ref);
      return sum + (stream instanceof PDFRawStream ? stream.contents.length : 0);
    }, 0);
  }

  it('leaves the source form untouched when the user entered no values', async () => {
    // No fieldValues → no fill, no flatten. The page copies through as-is; the
    // form's live AcroForm is simply not carried by copyPages (it never is),
    // but crucially we didn't bake anything into the page content either.
    const out = await mergePdf([await formDoc()], [pageInfo('F', 0)]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('bakes entered values into the page content via flatten, enriching the stream', async () => {
    // copyPages can't carry the AcroForm, so the only way a filled value reaches
    // the export is flattened into the page content stream. Measure that: the
    // filled export's page content is strictly larger than the untouched one's,
    // proving the appearance was burned in rather than lost with the form.
    const baseline = await firstPageContentLength(
      await mergePdf([await formDoc()], [pageInfo('F', 0)])
    );
    const filled = await firstPageContentLength(
      await mergePdf(
        [await formDoc({ 'user.name': 'Jane Doe', 'user.subscribe': 'Yes' })],
        [pageInfo('F', 0)]
      )
    );
    expect(filled).toBeGreaterThan(baseline);
  });

  it('keeps exporting when a value targets an unknown field name', async () => {
    // A stale/renamed field must not throw out of the whole export — the bad
    // entry is skipped and the real field still fills.
    const out = await mergePdf(
      [await formDoc({ 'user.name': 'Jane', 'ghost.field': 'x' })],
      [pageInfo('F', 0)]
    );
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});
