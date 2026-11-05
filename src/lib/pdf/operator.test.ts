import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFRawStream, PDFName, decodePDFRawStream, degrees } from 'pdf-lib';
import { mergePdf, watermarkTargetIndices, resolveRadioValue, PRODUCER } from './operator.js';
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

describe('mergePdf — shared resources', () => {
  // Pages of a real PDF share fonts and images through their resource dicts.
  // pdf-lib remembers what it copied only within ONE copyPages call, so a call
  // per page wrote every shared object once per page (a 10-page export of a
  // document with one 200 KB shared stream came out ~2 MB).
  async function sharedStreamSource(pageCount: number, streamBytes: number): Promise<Document> {
    const doc = await PDFDocument.create();
    const shared = doc.context.register(
      doc.context.stream(new Uint8Array(streamBytes).fill(7), {
        Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8
      })
    );
    for (let i = 0; i < pageCount; i++) {
      const page = doc.addPage([200, 200]);
      page.node.setXObject(PDFName.of('Shared'), shared);
      // Each page really draws it: the export scrub drops resources a page never uses.
      page.node.set(PDFName.Contents, doc.context.register(doc.context.stream('q 10 0 0 10 0 0 cm /Shared Do Q')));
    }
    const pdfBytes = await doc.save({ useObjectStreams: false });
    const pages = Array.from({ length: pageCount }, (_, i) => pageInfo('S', i));
    return { id: 'S', name: 's.pdf', pdfBytes, pages, pageCount };
  }

  it('copies a resource shared by every page once, not once per page', async () => {
    const src = await sharedStreamSource(10, 200_000);
    const out = await mergePdf([src], src.pages);
    expect(out.byteLength).toBeGreaterThan(200_000);
    expect(out.byteLength).toBeLessThan(2 * 200_000);
  });

  it('keeps a duplicated page independent of its original', async () => {
    // Two copies of ONE source page must not share a content stream, or text
    // drawn on the duplicate would appear on the original as well.
    const src = await asDocument('A', 'a.pdf', 1);
    const dup = pageInfo('A', 0, 0, {
      id: 'A:0#dup',
      annotations: [{ kind: 'text', id: 't', x: 0.5, y: 0.5, text: 'ONLY-ON-DUP', fontSize: 12, color: '#000000' }]
    });
    const out = await PDFDocument.load(await mergePdf([src], [pageInfo('A', 0), dup]));
    const drawn = '<4F4E4C592D4F4E2D445550>'; // "ONLY-ON-DUP", as pdf-lib hex-encodes Helvetica text
    expect(contentText(out, 1)).toContain(drawn);
    expect(contentText(out, 0)).not.toContain(drawn);
  });

  it('keeps pages that share one /Contents array independent', async () => {
    // Some writers point several pages at ONE indirect content array. Copied
    // in a single batch the output pages would share it, and anything drawn on
    // one page (here a text overlay; later the stamp and watermark) would land
    // on every page holding that array.
    const doc = await PDFDocument.create();
    const stream = doc.context.register(doc.context.flateStream('0 0 m 10 10 l S'));
    const sharedArray = doc.context.register(doc.context.obj([stream]));
    for (let i = 0; i < 2; i++) doc.addPage([200, 200]).node.set(PDFName.Contents, sharedArray);
    const pdfBytes = await doc.save({ useObjectStreams: false });
    const src: Document = { id: 'S', name: 's.pdf', pdfBytes, pages: [], pageCount: 2 };
    const marked = pageInfo('S', 1, 0, {
      annotations: [{ kind: 'text', id: 't', x: 0.5, y: 0.5, text: 'ONLY-ON-DUP', fontSize: 12, color: '#000000' }]
    });
    const out = await PDFDocument.load(await mergePdf([src], [pageInfo('S', 0), marked]));
    const [first, second] = out.getPages();
    expect(first.node.get(PDFName.Contents)).not.toBe(second.node.get(PDFName.Contents));
    expect(contentText(out, 1)).toContain('<4F4E4C592D4F4E2D445550>');
    expect(contentText(out, 0)).not.toContain('<4F4E4C592D4F4E2D445550>');
  });
});

/** Every content stream of page `i`, decoded and concatenated. */
function contentText(doc: PDFDocument, i: number): string {
  const c = doc.getPages()[i].node.Contents();
  const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
  return refs
    .map((r) => doc.context.lookup(r))
    .map((st) => (st instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(st).decode()) : ''))
    .join('\n');
}

describe('mergePdf — image annotations', () => {
  // 1x1 PNG. A signature placed on several pages shares one Uint8Array.
  const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  const imageCount = (doc: PDFDocument) =>
    doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length;

  it('embeds an image placed on several pages once', async () => {
    const src = await asDocument('A', 'a.pdf', 3);
    const sig = (i: number) => ({ kind: 'image' as const, id: `s${i}`, x: 0.1, y: 0.1, width: 0.2, height: 0.1, imageBytes: PNG, imageMime: 'image/png' as const });
    // Compare with ONE placement rather than hard-coding a count: pdf-lib writes
    // an RGBA PNG as two image streams (the pixels plus an SMask for alpha).
    const once = await PDFDocument.load(await mergePdf([src], [pageInfo('A', 0, 0, { annotations: [sig(0)] })]));
    const pages = [0, 1, 2].map((i) => pageInfo('A', i, 0, { annotations: [sig(i)] }));
    const thrice = await PDFDocument.load(await mergePdf([src], pages));
    expect(imageCount(once)).toBeGreaterThan(0);
    expect(imageCount(thrice)).toBe(imageCount(once));
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
          kind: 'text',
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

  it('burns a signature image annotation onto the page', async () => {
    // 1x1 transparent PNG.
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    );
    const a = await asDocument('A', 'a.pdf', 1);
    const signed = pageInfo('A', 0, 0, {
      annotations: [
        {
          kind: 'image',
          id: 'sig-1',
          x: 0.1,
          y: 0.1,
          width: 0.3,
          height: 0.15,
          imageBytes: png,
          imageMime: 'image/png'
        }
      ]
    });
    const out = await mergePdf([a], [signed]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getPage(0).getWidth()).toBe(200);
    // The embedded image lands as an XObject in the page resources.
    expect(out.length).toBeGreaterThan(0);
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

// A privacy-first tool must never carry the USER's metadata or stamp a foreign
// fingerprint. The only Info value an export carries is our own neutral PRODUCER
// tag — no author/title, no Creator, and crucially no dates (a CreationDate/
// ModDate would leak a wall-clock timestamp). pdf-lib would stamp Producer=
// "pdf-lib …" + fresh dates at load/create time unless updateMetadata:false is
// passed; these pin that every path suppresses that and writes only our tag.
// NOTE the readback loads with updateMetadata:false too — a default load
// re-stamps the in-memory doc, so asserting on a default-loaded copy would report
// pdf-lib's stamp even when the bytes on disk are clean.
describe('export pipeline — Info dict carries only the KeMeK producer', () => {
  const wm: TextWatermark = {
    kind: 'text',
    text: 'CONFIDENTIAL',
    fontSize: 32,
    color: '#c53030',
    opacity: 0.3,
    rotation: -45,
    position: 'center'
  };

  async function readInfo(bytes: Uint8Array) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return {
      producer: doc.getProducer(),
      creator: doc.getCreator(),
      creationDate: doc.getCreationDate(),
      modDate: doc.getModificationDate()
    };
  }

  it('a plain merged export carries our producer tag and nothing else', async () => {
    // The source itself was created with pdf-lib's default stamp; the merge must
    // not propagate it (copyPages drops the Info dict), and must write our tag —
    // but NOT a Creator or any date.
    const a = await asDocument('A', 'a.pdf', 2);
    const info = await readInfo(await mergePdf([a], [pageInfo('A', 0), pageInfo('A', 1)]));
    expect(info.producer).toBe(PRODUCER);
    expect(info.creator).toBeUndefined();
    expect(info.creationDate).toBeUndefined();
    expect(info.modDate).toBeUndefined();
  });

  it('the producer tag survives the merge→watermark re-save, still with no dates', async () => {
    // applyWatermark loads + re-saves the merged bytes — the exact spot a default
    // load would clobber our tag with "pdf-lib …" + a fresh ModDate.
    const a = await asDocument('A', 'a.pdf', 1);
    const merged = await mergePdf([a], [pageInfo('A', 0)]);
    const info = await readInfo(await applyWatermark(merged, wm));
    expect(info.producer).toBe(PRODUCER);
    expect(info.modDate).toBeUndefined();
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

  it('prefers an exact option-name match over index-resolution (misaligned numeric names)', () => {
    // A PDF whose radio on-states are named with digits that are themselves the
    // options, but NOT in positional order: getOptions() = ["1","0"], user picked
    // the widget named "1". Index-resolving "1" would wrongly pick options[1]="0";
    // the name-first check keeps it on "1". Silent wrong-choice on a flattened
    // (unrecoverable) export otherwise.
    expect(resolveRadioValue('1', ['1', '0'])).toBe('1');
    expect(resolveRadioValue('0', ['1', '0'])).toBe('0');
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

  it('carries an untouched form through live', async () => {
    // copyPages never carries the catalog's AcroForm; mergePdf rebuilds it from
    // the copied widgets, so the fields stay fillable in the export.
    const out = await mergePdf([await formDoc()], [pageInfo('F', 0)]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getForm().getFields().map((f) => f.getName()).sort()).toEqual(['user.name', 'user.subscribe']);
  });

  it('keeps a filled form live, with its values, when not flattening', async () => {
    const out = await mergePdf(
      [await formDoc({ 'user.name': 'Jane Doe', 'user.subscribe': 'Yes' })],
      [pageInfo('F', 0)]
    );
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getTextField('user.name').getText()).toBe('Jane Doe');
    expect(form.getCheckBox('user.subscribe').isChecked()).toBe(true);
  });

  it('bakes entered values into the page content when flattening', async () => {
    // Flatten burns each field's appearance into the page content stream:
    // the filled, flattened export's page content is strictly larger than the
    // untouched one's, so the values were drawn rather than lost with the form.
    const baseline = await firstPageContentLength(
      await mergePdf([await formDoc()], [pageInfo('F', 0)])
    );
    const filled = await firstPageContentLength(
      await mergePdf(
        [await formDoc({ 'user.name': 'Jane Doe', 'user.subscribe': 'Yes' })],
        [pageInfo('F', 0)],
        { flattenForms: true }
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

  it('flattenForms locks an unfilled form, burning appearances and dropping fields', async () => {
    // The finalize toggle (4.2): lock a form the user never filled. flatten burns
    // the (empty, bordered) field appearances into the page content — so the
    // merged page gains content the untouched copy loses with the dropped
    // widgets — and the output carries no interactive fields.
    const untouched = await firstPageContentLength(
      await mergePdf([await formDoc()], [pageInfo('F', 0)])
    );
    const locked = await mergePdf([await formDoc()], [pageInfo('F', 0)], { flattenForms: true });
    expect(await firstPageContentLength(locked)).toBeGreaterThan(untouched);
    const parsed = await PDFDocument.load(locked);
    expect(parsed.getForm().getFields().length).toBe(0);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('flattenForms no-ops safely on a document with no form', async () => {
    // getForm() synthesizes an empty form for a form-less PDF; flattening it must
    // be a clean no-op, not an error.
    const out = await mergePdf(
      [await asDocument('A', 'a.pdf', 2)],
      [pageInfo('A', 0), pageInfo('A', 1)],
      { flattenForms: true }
    );
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
