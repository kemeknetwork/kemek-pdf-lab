/**
 * A single page in the workspace. Pages are copied from source documents and
 * can be reordered, rotated, and deleted independently. The {@link id} is
 * unique across all loaded documents.
 */
export interface PageInfo {
  id: string;
  /** ID of the {@link Document} this page was extracted from. */
  sourceDocumentId: string;
  /** Zero-based page index within the source PDF. */
  originalIndex: number;
  /** Cumulative rotation applied by the user (degrees clockwise). */
  rotation: 0 | 90 | 180 | 270;
  /** User-assigned label for organizing pages (not embedded in exported PDF). */
  label?: string;
}

/**
 * A loaded PDF document. Holds the raw bytes for export and a snapshot of
 * the pages it contributed to the workspace.
 */
export interface Document {
  id: string;
  /** Original filename as provided by the user. */
  name: string;
  /** Raw PDF binary — kept in memory for pdf-lib export. */
  pdfBytes: Uint8Array;
  /** Pages that were created when this document was added. */
  pages: PageInfo[];
  pageCount: number;
}

/** Top-level application state shape (for reference — actual state lives in app.svelte.ts runes). */
export interface AppState {
  documents: Document[];
  pages: PageInfo[];
  selection: Set<string>;
  undoStack: Action[];
  redoStack: Action[];
}

/**
 * Discriminated union of undoable/redoable actions. Each variant stores enough
 * data to reverse the operation (undo) or replay it (redo).
 */
export type Action =
  | { type: 'reorder'; pageIds: string[]; fromIndices: number[]; toIndices: number[] }
  | { type: 'rotate'; pageIds: string[]; from: number; to: number }
  | { type: 'delete'; pages: { page: PageInfo; index: number }[] }
  | { type: 'add-document'; documentId: string; pageIds: string[]; document: Document; pages: PageInfo[] }
  | { type: 'label'; pageId: string; from: string | undefined; to: string | undefined };
