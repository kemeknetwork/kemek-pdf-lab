export interface PageInfo {
  /** Unique across all loaded documents in the workspace. */
  id: string;
  sourceDocumentId: string;
  /** Zero-based page index within the source PDF. */
  originalIndex: number;
  /** Cumulative user rotation in degrees clockwise. */
  rotation: 0 | 90 | 180 | 270;
  /** Optional user label, shown in the UI only — not embedded in the export. */
  label?: string;
  /** User-placed text overlays. Burned into PDF at export via pdf-lib drawText. */
  annotations?: TextAnnotation[];
}

export interface TextAnnotation {
  id: string;
  /**
   * Position in normalized page-relative coordinates, origin top-left,
   * 0..1 on each axis. Stored normalized so it survives page resizing
   * during preview. Converted to PDF points (origin bottom-left) at export.
   */
  x: number;
  y: number;
  text: string;
  /** Point size at export (PDF points, 1pt = 1/72 inch). */
  fontSize: number;
  /** Hex color, e.g. "#000000". */
  color: string;
}

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'listbox';

/** One on-page placement of a field. Radio groups and repeated fields (e.g. a
 *  name shown in every footer) have several widgets sharing one field name. */
export interface FormFieldWidget {
  /** Zero-based page index within the source document. */
  pageIndex: number;
  /** Rect in viewport-normalized coords, origin top-left, 0..1 on each axis —
   *  the same space the text-overlay layer positions in. */
  rect: { x: number; y: number; width: number; height: number };
  /** Checkbox/radio: the value this specific widget turns the field "on" to. */
  onValue?: string;
}

export interface FormFieldOption {
  /** Value written to the PDF. */
  value: string;
  /** Human-readable label shown in the UI (falls back to value). */
  label: string;
}

/** A detected AcroForm field. Descriptors are derived from the PDF (pdfjs) for
 *  the fill UI only — the export path re-derives fields by name via pdf-lib, so
 *  these never need to round-trip. */
export interface FormField {
  /** Fully-qualified AcroForm field name — document-unique, the value key. */
  name: string;
  type: FormFieldType;
  /** Friendly alternate name (AcroForm /TU) when present; field names are
   *  often machine-generated (e.g. `f1_07[0]`), so prefer this for labels. */
  label?: string;
  readOnly: boolean;
  required: boolean;
  multiline?: boolean;
  maxLen?: number;
  /** dropdown / listbox / radio choices. */
  options?: FormFieldOption[];
  /** Every on-page placement of this field. */
  widgets: FormFieldWidget[];
}

export interface Document {
  id: string;
  name: string;
  /** Raw PDF bytes retained for pdf-lib export. */
  pdfBytes: Uint8Array;
  pages: PageInfo[];
  pageCount: number;
  /** AcroForm fields detected from the PDF, cached lazily on first preview.
   *  UI-only; absent until detection runs, empty array = no form. */
  formFields?: FormField[];
  /** User-entered form values, field name → value. Baked into the export by
   *  filling + flattening the form before page copy (mirrors how the watermark
   *  is export-only state). Checkbox: onValue when checked, '' when not.
   *  Presence of any entry = the user engaged the form → fill+flatten on export. */
  fieldValues?: Record<string, string>;
}

export type WatermarkPosition =
  | 'center' | 'tile'
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface TextWatermark {
  kind: 'text';
  text: string;
  /** PDF points. */
  fontSize: number;
  /** Hex "#RRGGBB". */
  color: string;
  /** 0..1; clamped on apply. */
  opacity: number;
  /** Degrees, passed to pdf-lib degrees(). */
  rotation: number;
  position: WatermarkPosition;
}

export interface ImageWatermark {
  kind: 'image';
  imageBytes: Uint8Array;
  imageMime: 'image/png' | 'image/jpeg';
  /** Multiplier on the embedded image's natural size. */
  scale: number;
  /** 0..1; clamped on apply. */
  opacity: number;
  /** Degrees. */
  rotation: number;
  position: WatermarkPosition;
}

export type WatermarkConfig = TextWatermark | ImageWatermark;

/** The 6 header/footer anchors a page number / stamp can sit at. */
export type StampPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** A page-numbering / header-footer stamp, burned into the export. The template
 *  carries `{n}` (the page number) and/or `{total}` (page count); plain text with
 *  neither is a fixed header/footer. `{n}` = start + export-order index, zero-
 *  padded to padWidth (Bates-style). Export-only state, like the watermark. */
export interface StampConfig {
  template: string;
  start: number;
  padWidth: number;
  position: StampPosition;
  fontSize: number;
  color: string;
}

/** Shape of app.svelte.ts state — kept for reference; runes hold the live copy. */
export interface AppState {
  documents: Document[];
  pages: PageInfo[];
  selection: Set<string>;
  undoStack: Action[];
  redoStack: Action[];
}

/** Reversible actions recorded on the undo stack. */
export type Action =
  | { type: 'reorder'; pageIds: string[]; fromIndices: number[]; toIndices: number[] }
  | { type: 'rotate'; pageIds: string[]; rotations: Map<string, { from: 0 | 90 | 180 | 270; to: 0 | 90 | 180 | 270 }> }
  | { type: 'delete'; pages: { page: PageInfo; index: number }[]; selection: string[] }
  | { type: 'duplicate'; pages: { page: PageInfo; index: number }[] }
  | { type: 'add-document'; documentId: string; pageIds: string[]; document: Document; pages: PageInfo[] }
  | { type: 'label'; pageId: string; from: string | undefined; to: string | undefined }
  | { type: 'add-text'; pageId: string; annotation: TextAnnotation }
  | { type: 'delete-text'; pageId: string; annotation: TextAnnotation; index: number };
