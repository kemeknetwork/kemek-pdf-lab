// Pure reading-order text assembler (4.5), split from the pdfjs shell in
// renderer.ts so the geometry — line grouping, word spacing, paragraph breaks —
// is unit-testable without a real PDF. pdfjs hands back positioned text runs in
// roughly content order; this re-derives human reading order from their
// coordinates rather than trusting that order.

/** One positioned text run from pdfjs (one `getTextContent` item). Coordinates
 *  are the run's baseline in PDF points, origin BOTTOM-left — so a larger `y` is
 *  higher up the page (earlier in reading order). */
export interface TextPiece {
  str: string;
  x: number;
  y: number;
  /** advance width in points (used to detect inter-run gaps → spaces). */
  width: number;
  /** text height ≈ font size in points (used to scale the tolerances). */
  height: number;
}

/**
 * Assemble positioned text runs into reading-order plain text.
 *
 * Tolerances scale to the page's median text height so the same logic handles a
 * 6pt footnote and a 48pt heading: runs within half a line of each other share a
 * line; a vertical gap wider than ~1.4 lines starts a new paragraph (blank
 * line); within a line, a horizontal gap wider than ~a quarter-em inserts a
 * space (pdfjs splits a line into runs that often lack the joining space).
 */
export function assembleText(pieces: TextPiece[]): string {
  const runs = pieces.filter((p) => p.str.length > 0);
  if (runs.length === 0) return '';

  const heights = runs
    .map((p) => p.height)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 12;
  const lineTol = medianH * 0.5;
  const paraGap = medianH * 1.4;
  const spaceThresh = medianH * 0.25;

  // Top-to-bottom: stable sort by descending y. Same-line runs (y within lineTol)
  // end up adjacent, so a single forward pass can group them.
  const sorted = [...runs].sort((a, b) => b.y - a.y);

  const lines: { y: number; runs: TextPiece[] }[] = [];
  for (const run of sorted) {
    const line = lines[lines.length - 1];
    if (line && line.y - run.y <= lineTol) {
      line.runs.push(run);
    } else {
      lines.push({ y: run.y, runs: [run] });
    }
  }

  const out: string[] = [];
  let prevY: number | null = null;
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);

    let text = '';
    let prevEnd: number | null = null;
    for (const run of line.runs) {
      if (
        prevEnd !== null &&
        run.x - prevEnd > spaceThresh &&
        !text.endsWith(' ') &&
        !run.str.startsWith(' ')
      ) {
        text += ' ';
      }
      text += run.str;
      prevEnd = run.x + run.width;
    }
    text = text.replace(/[ \t]{2,}/g, ' ').trimEnd();

    // A vertical gap wider than a paragraph's worth → blank line separator.
    if (prevY !== null && prevY - line.y > paraGap) out.push('');
    out.push(text);
    prevY = line.y;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
