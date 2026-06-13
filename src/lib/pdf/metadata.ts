// Strip a PDF's identifying metadata at export — the engine behind the
// "Remove metadata" finalize toggle (4.3). pdf-lib is dynamic-imported here so
// it stays out of the initial page bundle, exactly like applyWatermark /
// applyStamp.

/**
 * Remove the document's metadata and return the new bytes: empties the Info
 * dictionary (Title / Author / Subject / Keywords / Creator / Producer /
 * CreationDate / ModDate) and drops the XMP metadata stream from the catalog.
 *
 * Two non-obvious things drive the shape:
 *
 *  1. **`updateMetadata: false` is load-bearing, not cosmetic.** pdf-lib's
 *     default load/create stamps `Producer` (to "pdf-lib …"), `Creator`, and a
 *     fresh `CreationDate`/`ModDate` into the Info dict — so a naive
 *     delete-then-save would replace the user's metadata with pdf-lib's own
 *     fingerprint + the current time, which is *worse* for privacy. The flag
 *     suppresses that stamp so the cleared dict actually survives the save. The
 *     other export passes (merge / watermark / stamp / image-import) now pass the
 *     same flag, so the pipeline never adds a fingerprint in the first place —
 *     this strip is the explicit, defense-in-depth scrub of any *source*
 *     metadata, not the sole thing standing between the user and a leak.
 *
 *  2. The Info dict and the XMP stream are two independent channels. Clearing
 *     one leaves the other intact, so both are removed.
 *
 * Out of scope (kept deliberately narrow): the trailer `/ID` file identifier and
 * per-object metadata — removing `/ID` can break linearization / signatures, and
 * it isn't author-identifying the way the Info dict + XMP are.
 */
export async function stripMetadata(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib');
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });

  const infoRef = pdf.context.trailerInfo.Info;
  if (infoRef) {
    const info = pdf.context.lookupMaybe(infoRef, PDFDict);
    if (info) for (const key of [...info.keys()]) info.delete(key);
  }

  pdf.catalog.delete(PDFName.of('Metadata'));

  return pdf.save();
}
