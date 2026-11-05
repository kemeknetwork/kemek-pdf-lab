// pdf-lib (~400KB) is dynamic-imported inside mergePdf rather than statically,
// so it lands in a lazy chunk loaded on first export instead of the initial
// page bundle. The pure watermarkTargetIndices() below stays synchronously
// importable. The `import type` is erased at build time — it adds no runtime
// dependency, just the PDFDocument type for the docMap annotation.
import type { PDFDocument, PDFFont, PDFPage, PDFPageLeaf } from 'pdf-lib';
import type { PageInfo, Document, TextAnnotation } from './types.js';
import { hexToRgb01 } from './color.js';
import { createPdf, openPdf, serializePdf } from './pdf-doc.js';
import { attachForms, prepareForm } from './forms.js';
import { renderTextToPng } from './text-raster.js';
import { canEncodeWinAnsi } from './watermark.js';
import { drawUserImage, embedUserImage, type UserImage } from './user-image.js';
import { displaySize, pageFrame, rotateOffset, toUserSpace, type PageFrame } from './page-geometry.js';

export { resolveRadioValue } from './forms.js';

// The one tag we DO write to an export's Info dict. Tool-identifying, not
// user-identifying — and deliberately carries no version or date, so it never
// narrows the build or leaks a timestamp (the things updateMetadata:false kills).
// Exported so the regression test pins the exact string in lockstep.
export const PRODUCER = 'KeMeK PDF Lab (https://pdf.kemek.com)';

/**
 * Build a merged PDF in the current workspace order. User rotations stack on
 * any rotation already present in the source page so the exported file
 * matches the on-screen preview. Annotations placed in the preview modal are
 * burned into each page; form fields carry through live unless `flattenForms`.
 */
export async function mergePdf(
  documents: Document[],
  pages: PageInfo[],
  opts: { flattenForms?: boolean } = {}
): Promise<Uint8Array> {
  const { flattenForms = false } = opts;
  const lib = await import('pdf-lib');
  const { StandardFonts, degrees, rgb, PDFArray, PDFName, PDFObjectCopier } = lib;
  // createPdf/openPdf pass updateMetadata:false, so pdf-lib stamps no Producer or
  // dates of its own; the source's Info dict and catalog XMP are never copied;
  // and serializePdf scrubs the page level. The only Info value an export
  // carries is the neutral PRODUCER tag set below.
  const outputPdf = await createPdf();

  // Only documents that still have a page in this export are opened: one that
  // can't be (still encrypted, damaged) must not fail an export it isn't in.
  const used = new Set(pages.map((p) => p.sourceDocumentId));
  const docMap = new Map<string, PDFDocument>();
  const formSources: { pdf: PDFDocument; needAppearances: boolean }[] = [];
  for (const doc of documents) {
    if (!used.has(doc.id)) continue;
    const pdf = await openPdf(doc.pdfBytes);
    docMap.set(doc.id, pdf);
    // Write entered values (and flatten, when asked) BEFORE copyPages, so the
    // copied widgets carry their new values and appearances, then flush: pdf-lib
    // writes the fonts and images an appearance uses only on flush, and a source
    // is copied from, never saved, so without it the copy would point at a font
    // object that was never written.
    const hasValues = !!doc.fieldValues && Object.keys(doc.fieldValues).length > 0;
    const prepared =
      hasValues || flattenForms
        ? await prepareForm(pdf, doc.fieldValues, flattenForms)
        : { needAppearances: false };
    await pdf.flush();
    formSources.push({ pdf, needAppearances: prepared.needAppearances });
  }

  // Embed Helvetica once and reuse — only when some page actually has a TEXT
  // annotation (image/signature annotations need no font).
  const hasText = pages.some((p) => p.annotations?.some((a) => a.kind === 'text'));
  const helvetica = hasText ? await outputPdf.embedFont(StandardFonts.Helvetica) : null;

  // Copy each source's pages in ONE copyPages call: pdf-lib dedupes the objects
  // pages share (fonts, images, ICC profiles) only within a call, so a call per
  // page wrote every shared resource once per page (a 10-page document with one
  // 200 KB shared image exported at ~2 MB). Only the FIRST use of each source
  // page is batched; a duplicated page gets its own call below, because two
  // copies of one page from a single call share every object the page holds,
  // its /Contents array included.
  const firstUse = new Map<string, Map<number, PageInfo>>();
  for (const page of pages) {
    const sourcePdf = docMap.get(page.sourceDocumentId);
    if (!sourcePdf) {
      throw new Error(`Source document missing for page ${page.originalIndex + 1}. Try reloading the file.`);
    }

    // A stale PageInfo can point past the end of an existing document (e.g. the
    // source was reloaded shorter). copyPages would hand back an empty array and
    // the undefined page would crash opaquely later — guard with the same clean,
    // page-numbered error as the missing-document case above.
    if (page.originalIndex < 0 || page.originalIndex >= sourcePdf.getPageCount()) {
      throw new Error(`Page ${page.originalIndex + 1} no longer exists in its source document. Try reloading the file.`);
    }

    let byIndex = firstUse.get(page.sourceDocumentId);
    if (!byIndex) firstUse.set(page.sourceDocumentId, (byIndex = new Map()));
    if (!byIndex.has(page.originalIndex)) byIndex.set(page.originalIndex, page);
  }
  // Copied by REFERENCE through one copier per source, not with copyPages: that
  // copies each page's dict, so a link from one exported page to another landed
  // on a second, orphaned copy of its target (dead in a viewer, dropped by the
  // scrub). Through the copier's memo, the link and the page tree resolve to the
  // same new object.
  const batched = new Map<PageInfo, PDFPage>();
  const embedded = new Map<Uint8Array, UserImage>();
  for (const [docId, byIndex] of firstUse) {
    const source = docMap.get(docId)!;
    const copier = PDFObjectCopier.for(source.context, outputPdf.context);
    const sourcePages = source.getPages();
    for (const [index, info] of byIndex) {
      const ref = copier.copy(sourcePages[index].ref);
      const leaf = outputPdf.context.lookup(ref) as PDFPageLeaf;
      batched.set(info, lib.PDFPage.of(leaf, ref, outputPdf));
    }
  }

  for (const page of pages) {
    const copiedPage =
      batched.get(page) ??
      (await outputPdf.copyPages(docMap.get(page.sourceDocumentId)!, [page.originalIndex]))[0];

    // Give every page its own /Contents array. Drawing (text here, the stamp
    // and watermark later) inserts into that array in place, so an array that
    // two source pages share by reference, now copied in one batch, would
    // carry one page's marks onto the other. The streams inside stay shared,
    // which is safe: drawing only ever adds streams around them.
    const contents = copiedPage.node.Contents();
    if (contents instanceof PDFArray) copiedPage.node.set(PDFName.Contents, contents.clone());

    // Annotations were placed on the preview, which shows the source page as
    // pdf.js draws it: its visible box turned by its OWN rotation, before the
    // user's. Capture that frame before the user rotation is added; the user
    // rotation then turns page and marks together.
    const frame = pageFrame(copiedPage);
    if (page.rotation !== 0) {
      copiedPage.setRotation(degrees(copiedPage.getRotation().angle + page.rotation));
    }

    if (page.annotations && page.annotations.length > 0) {
      const display = displaySize(frame);
      for (const ann of page.annotations) {
        if (ann.kind === 'text') {
          if (!helvetica) continue; // hasText guarantees this is set; guard for the type
          // Stored (x, y) is the text BASELINE, normalized to the displayed page.
          await drawTextAnnotation(outputPdf, copiedPage, ann, helvetica, frame, rgb);
        } else {
          // Signature image. Stored (x, y) is the box TOP-LEFT, width/height are
          // fractions of the displayed page; drawImage anchors on the box's
          // bottom-left, turned with the page's own rotation so it reads upright.
          const w = ann.width * display.width;
          const h = ann.height * display.height;
          // One embed per distinct image: a signature placed on several pages
          // (or a duplicated page) shares one Uint8Array, so it is decoded and
          // written into the file once instead of once per placement.
          let img = embedded.get(ann.imageBytes);
          if (!img) {
            img = await embedUserImage(outputPdf, ann.imageBytes, ann.imageMime);
            embedded.set(ann.imageBytes, img);
          }
          const corner = toUserSpace(frame, ann.x, ann.y + ann.height);
          await drawUserImage(copiedPage, img, { x: corner.x, y: corner.y, width: w, height: h }, { rotate: frame.rotate });
        }
      }
    }

    outputPdf.addPage(copiedPage);
  }

  await attachForms(outputPdf, formSources);

  // Set OUR producer last, on the assembled output. The watermark/stamp passes
  // load with updateMetadata:false, so they carry this Info dict through their
  // re-save untouched rather than clobbering it.
  outputPdf.setProducer(PRODUCER);
  return serializePdf(outputPdf);
}

/**
 * Burn one text overlay in on its baseline, upright as displayed. Latin text is
 * vector Helvetica; anything WinAnsi can't encode (Ł, Cyrillic, CJK, ✓, emoji)
 * is rendered by the browser's own fonts to an image placed on the same
 * baseline, like the watermark and stamp do, instead of failing the export.
 */
async function drawTextAnnotation(
  pdf: PDFDocument,
  page: PDFPage,
  ann: TextAnnotation,
  font: PDFFont,
  frame: PageFrame,
  rgb: typeof import('pdf-lib').rgb
): Promise<void> {
  const { degrees } = await import('pdf-lib');
  const at = toUserSpace(frame, ann.x, ann.y);
  const rotate = degrees(frame.rotate);
  if (canEncodeWinAnsi(font, ann.text)) {
    const { r, g, b } = hexToRgb01(ann.color);
    page.drawText(ann.text, { x: at.x, y: at.y, size: ann.fontSize, font, color: rgb(r, g, b), rotate });
    return;
  }
  const png = await renderTextToPng(ann.text, { fontSize: ann.fontSize, color: ann.color });
  const image = await pdf.embedPng(png.bytes);
  // The image's corner sits left of and below the baseline origin, in display axes.
  const off = rotateOffset(frame, -png.inset, -png.baseline);
  page.drawImage(image, { x: at.x + off.x, y: at.y + off.y, width: png.width, height: png.height, rotate });
}

/**
 * Map a watermark's stored target page-id snapshot to indices into the actual
 * export page list — which is the page order of the assembled output, so a
 * position here is the output-PDF page index applyWatermark expects.
 *
 * Resolving against the live list (rather than storing indices) keeps the
 * targeting correct after reorder/delete and across both export paths (full
 * merge and split). null targets → undefined (every page). Targeted pages no
 * longer in the export simply drop out; an empty result stamps nothing.
 */
export function watermarkTargetIndices(
  pages: PageInfo[],
  targetIds: string[] | null
): number[] | undefined {
  if (!targetIds) return undefined;
  const wanted = new Set(targetIds);
  const indices: number[] = [];
  pages.forEach((page, i) => {
    if (wanted.has(page.id)) indices.push(i);
  });
  return indices;
}
