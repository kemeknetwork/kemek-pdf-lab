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
}

export interface Document {
  id: string;
  name: string;
  /** Raw PDF bytes retained for pdf-lib export. */
  pdfBytes: Uint8Array;
  pages: PageInfo[];
  pageCount: number;
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
  | { type: 'add-document'; documentId: string; pageIds: string[]; document: Document; pages: PageInfo[] }
  | { type: 'label'; pageId: string; from: string | undefined; to: string | undefined };
