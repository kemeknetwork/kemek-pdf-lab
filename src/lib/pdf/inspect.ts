// Pure helpers for the metadata inspector (4.4), split out from the pdfjs-driving
// shell in renderer.ts so the field selection, privacy classification, and PDF
// date formatting are unit-testable without a real PDF.

/** One displayable metadata entry. `sensitive` marks identifying values (who
 *  made the file, with what tool, and when) so the UI can flag them — these are
 *  exactly what the "Remove metadata" toggle (4.3) strips. */
export interface MetadataField {
  key: string;
  label: string;
  value: string;
  sensitive: boolean;
}

/** Everything the inspector shows for one document. Assembled in renderer.ts
 *  from pdfjs' getMetadata() + structural probes; the field list is built by the
 *  pure {@link buildMetadataFields} below. */
export interface DocumentMetadata {
  /** The loaded document's unique id — distinct even for two files with the
   *  same name, so it can key the inspector's per-document list safely. */
  id: string;
  name: string;
  pageCount: number;
  /** PDF spec version (e.g. "1.7"), or null when pdfjs doesn't report one. */
  version: string | null;
  fields: MetadataField[];
  hasXmp: boolean;
  hasAcroForm: boolean;
  hasXfa: boolean;
  hasJavaScript: boolean;
  attachmentCount: number;
  encrypted: boolean;
}

/** Info-dict keys we surface, in display order, with their privacy weighting.
 *  Author / Creator / Producer / dates identify a person, a tool, and a time —
 *  flagged sensitive. Title / Subject / Keywords are content descriptors — shown
 *  but not flagged. */
const FIELD_DEFS: { key: string; label: string; sensitive: boolean; date?: boolean }[] = [
  { key: 'Title', label: 'Title', sensitive: false },
  { key: 'Author', label: 'Author', sensitive: true },
  { key: 'Subject', label: 'Subject', sensitive: false },
  { key: 'Keywords', label: 'Keywords', sensitive: false },
  { key: 'Creator', label: 'Creator app', sensitive: true },
  { key: 'Producer', label: 'Producer', sensitive: true },
  { key: 'CreationDate', label: 'Created', sensitive: true, date: true },
  { key: 'ModDate', label: 'Modified', sensitive: true, date: true }
];

/**
 * Format a PDF date string (`D:YYYYMMDDHHmmSS±HH'mm'`, most parts after the year
 * optional) as a readable `YYYY-MM-DD HH:MM:SS`. The components are reformatted
 * in place with NO timezone conversion — deliberately, so the output can't drift
 * with the viewer's locale/offset (a classic date-handling bug). An unparseable
 * value is returned verbatim rather than dropped.
 */
export function formatPdfDate(raw: string): string {
  const m = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(raw.trim());
  if (!m) return raw.trim();
  const [, y, mo = '01', d = '01', h, mi, s] = m;
  const datePart = `${y}-${mo}-${d}`;
  if (h === undefined) return datePart;
  return `${datePart} ${h}:${mi ?? '00'}:${s ?? '00'}`;
}

/**
 * Project a pdfjs `info` object into the displayable, privacy-classified field
 * list. Only keys actually present (non-empty string) appear; dates are
 * reformatted via {@link formatPdfDate}. Order follows {@link FIELD_DEFS}.
 */
export function buildMetadataFields(info: Record<string, unknown>): MetadataField[] {
  const out: MetadataField[] = [];
  for (const def of FIELD_DEFS) {
    const raw = info[def.key];
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    out.push({
      key: def.key,
      label: def.label,
      value: def.date ? formatPdfDate(raw) : raw.trim(),
      sensitive: def.sensitive
    });
  }
  return out;
}

/** Count of identifying fields present — drives the inspector's summary line and
 *  whether the "Remove metadata" nudge is worth showing. */
export function countSensitive(meta: DocumentMetadata): number {
  return meta.fields.filter((f) => f.sensitive).length;
}
