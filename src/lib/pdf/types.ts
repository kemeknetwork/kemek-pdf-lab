export interface PageInfo {
  id: string;
  sourceDocumentId: string;
  originalIndex: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface Document {
  id: string;
  name: string;
  pdfBytes: Uint8Array;
  pages: PageInfo[];
  pageCount: number;
}

export interface AppState {
  documents: Document[];
  pages: PageInfo[];
  selection: Set<string>;
  undoStack: Action[];
  redoStack: Action[];
}

export type Action =
  | { type: 'reorder'; pageIds: string[]; fromIndices: number[]; toIndices: number[] }
  | { type: 'rotate'; pageIds: string[]; from: number; to: number }
  | { type: 'delete'; pages: { page: PageInfo; index: number }[] }
  | { type: 'add-document'; documentId: string; pageIds: string[] };
