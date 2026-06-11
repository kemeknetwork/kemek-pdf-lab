// Workspace state — Svelte 5 runes.
//
// All mutable state lives in module-level $state. Every page-mutating action
// pushes an Action onto the undo stack so operations can be reversed.
// File must be `.svelte.ts` for rune compilation.

import type { PageInfo, Document, Action, TextAnnotation, WatermarkConfig, FormField } from '$lib/pdf/types.js';

function generateId(): string {
  // crypto.randomUUID() requires a secure context (HTTPS or localhost). The
  // dev server on a tailscale IP over plain HTTP is not secure, so we fall
  // back to a Math.random-based ID rather than crashing.
  try { return crypto.randomUUID(); }
  catch { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
}

let documents = $state<Document[]>([]);
let pages = $state<PageInfo[]>([]);
let selection = $state<Set<string>>(new Set());
let undoStack = $state<Action[]>([]);
let redoStack = $state<Action[]>([]);
let lastSelectedId = $state<string | null>(null);

// Document-level watermark, burned into exported pages at save time (mirrors
// how text annotations are burned in mergePdf). Deliberately NOT on the undo
// stack: it mutates no page state, only the pending export, so the dialog's own
// Apply/Remove is the reversal — keeping it off-stack avoids polluting
// page-edit undo semantics.
let watermark = $state<WatermarkConfig | null>(null);
// Snapshot of the page ids the watermark targets, captured at Apply time. null
// = every page. Stored as ids (not output indices) so the choice survives
// reorder/delete between configuring and exporting; resolved to indices against
// the actual export page list via watermarkTargetIndices() at save time.
let watermarkTargetIds = $state<string[] | null>(null);

export function getDocuments(): Document[] { return documents; }
export function getPages(): PageInfo[] { return pages; }
export function getSelection(): Set<string> { return selection; }
export function getUndoStack(): Action[] { return undoStack; }
export function getRedoStack(): Action[] { return redoStack; }
export function getWatermark(): WatermarkConfig | null { return watermark; }
export function getWatermarkTargetIds(): string[] | null { return watermarkTargetIds; }

/**
 * Set (or clear, with null) the watermark burned into exports. `targetIds`
 * scopes it to specific pages (null = all pages); ignored when clearing.
 */
export function setWatermark(config: WatermarkConfig | null, targetIds: string[] | null = null): void {
  watermark = config;
  watermarkTargetIds = config ? targetIds : null;
}

// Form filling. Detected field descriptors (UI-only, from pdfjs) and the user's
// entered values both live on the Document. Like the watermark, entered values
// are export-only state kept OFF the page-undo stack — they mutate no page, the
// field UI's own re-edit/clear is the reversal, and they're baked into the
// export by fill+flatten in mergePdf. Native input undo covers in-field typing
// (the preview modal owns the keyboard while open).

/** Cache the AcroForm fields detected for a document (idempotent at the call
 *  site — detection runs once per doc, then this stores the result). */
export function setDocumentFormFields(docId: string, fields: FormField[]): void {
  documents = documents.map((d) => (d.id === docId ? { ...d, formFields: fields } : d));
}

export function getDocumentFormFields(docId: string): FormField[] | undefined {
  return documents.find((d) => d.id === docId)?.formFields;
}

export function getFieldValues(docId: string): Record<string, string> {
  return documents.find((d) => d.id === docId)?.fieldValues ?? {};
}

/** Set one field's value by name. An entry of '' is meaningful — it blanks a
 *  field that shipped with a default. Any entry present marks the form as
 *  engaged, so the export fills + flattens it. */
export function setFieldValue(docId: string, fieldName: string, value: string): void {
  documents = documents.map((d) =>
    d.id === docId ? { ...d, fieldValues: { ...(d.fieldValues ?? {}), [fieldName]: value } } : d
  );
}

/** Drop all entered values for a document (the field panel's Reset) so the
 *  export leaves its form untouched/interactive again. */
export function clearFieldValues(docId: string): void {
  documents = documents.map((d) => (d.id === docId ? { ...d, fieldValues: {} } : d));
}

/**
 * Register a new PDF and append its pages to the workspace. The optional
 * {@link id} lets the caller populate the renderer cache first so thumbnails
 * are ready by the time Svelte re-renders the grid.
 */
export function addDocument(name: string, pdfBytes: Uint8Array, pageCount: number, id?: string): string {
  const docId = id ?? generateId();
  const docPages: PageInfo[] = [];

  for (let i = 0; i < pageCount; i++) {
    docPages.push({
      id: generateId(),
      sourceDocumentId: docId,
      originalIndex: i,
      rotation: 0
    });
  }

  const doc: Document = { id: docId, name, pdfBytes, pages: docPages, pageCount };

  documents = [...documents, doc];
  pages = [...pages, ...docPages];

  undoStack = [...undoStack, {
    type: 'add-document',
    documentId: docId,
    pageIds: docPages.map((p) => p.id),
    document: doc,
    pages: docPages
  }];
  redoStack = [];

  return docId;
}

export function reorderPages(newPages: PageInfo[]): void {
  const oldIds = pages.map((p) => p.id);
  const newIds = newPages.map((p) => p.id);
  if (oldIds.every((id, i) => id === newIds[i])) return;

  const fromIndices = oldIds.map((_, i) => i);
  const toIndices = oldIds.map((id) => newIds.indexOf(id));

  undoStack = [...undoStack, { type: 'reorder', pageIds: oldIds, fromIndices, toIndices }];
  redoStack = [];

  pages = newPages;
}

export function rotatePages(direction: 'cw' | 'ccw'): void {
  if (selection.size === 0) return;

  const delta = direction === 'cw' ? 90 : -90;
  const selectedIds = new Set(selection);
  const rotations = new Map<string, { from: 0 | 90 | 180 | 270; to: 0 | 90 | 180 | 270 }>();

  pages = pages.map((p) => {
    if (!selectedIds.has(p.id)) return p;
    const newRotation = (((p.rotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    rotations.set(p.id, { from: p.rotation, to: newRotation });
    return { ...p, rotation: newRotation };
  });

  undoStack = [...undoStack, { type: 'rotate', pageIds: [...selectedIds], rotations }];
  redoStack = [];
}

export function deletePages(): void {
  if (selection.size === 0) return;

  const selectedIds = new Set(selection);
  const deletedPages: { page: PageInfo; index: number }[] = [];

  pages.forEach((p, i) => {
    if (selectedIds.has(p.id)) deletedPages.push({ page: { ...p }, index: i });
  });

  undoStack = [...undoStack, { type: 'delete', pages: deletedPages, selection: [...selection] }];
  redoStack = [];

  pages = pages.filter((p) => !selectedIds.has(p.id));
  selection = new Set();
}

export function addTextAnnotation(
  pageId: string,
  data: Omit<TextAnnotation, 'id'>
): string | null {
  const page = pages.find((p) => p.id === pageId);
  if (!page) return null;

  const annotation: TextAnnotation = { id: generateId(), ...data };

  pages = pages.map((p) =>
    p.id === pageId
      ? { ...p, annotations: [...(p.annotations ?? []), annotation] }
      : p
  );

  undoStack = [...undoStack, { type: 'add-text', pageId, annotation }];
  redoStack = [];

  return annotation.id;
}

export function deleteTextAnnotation(pageId: string, annotationId: string): void {
  const page = pages.find((p) => p.id === pageId);
  const list = page?.annotations;
  if (!list) return;

  const index = list.findIndex((a) => a.id === annotationId);
  if (index === -1) return;

  const annotation = list[index];

  pages = pages.map((p) =>
    p.id === pageId
      ? { ...p, annotations: (p.annotations ?? []).filter((a) => a.id !== annotationId) }
      : p
  );

  undoStack = [...undoStack, { type: 'delete-text', pageId, annotation, index }];
  redoStack = [];
}

export function setPageLabel(pageId: string, label: string | undefined): void {
  const page = pages.find((p) => p.id === pageId);
  if (!page) return;

  const from = page.label;
  if (from === label) return;

  pages = pages.map((p) => (p.id === pageId ? { ...p, label } : p));

  undoStack = [...undoStack, { type: 'label', pageId, from, to: label }];
  redoStack = [];
}

export function undo(): void {
  if (undoStack.length === 0) return;

  const action = undoStack[undoStack.length - 1];
  undoStack = undoStack.slice(0, -1);
  redoStack = [...redoStack, action];

  switch (action.type) {
    case 'reorder': {
      const reordered = new Array<PageInfo>(pages.length);
      for (let i = 0; i < action.fromIndices.length; i++) {
        reordered[action.fromIndices[i]] = pages[action.toIndices[i]];
      }
      pages = reordered;
      break;
    }
    case 'rotate': {
      pages = pages.map((p) => {
        const entry = action.rotations.get(p.id);
        return entry ? { ...p, rotation: entry.from } : p;
      });
      break;
    }
    case 'delete': {
      const newPages = [...pages];
      const sorted = [...action.pages].sort((a, b) => a.index - b.index);
      for (const { page, index } of sorted) newPages.splice(index, 0, page);
      pages = newPages;
      selection = new Set(action.selection);
      break;
    }
    case 'add-document': {
      // Intentionally don't release the parsed PDF from the renderer cache:
      // redo() is synchronous, so a future redo couldn't re-parse in time.
      const pageIdSet = new Set(action.pageIds);
      pages = pages.filter((p) => !pageIdSet.has(p.id));
      documents = documents.filter((d) => d.id !== action.documentId);
      break;
    }
    case 'label': {
      pages = pages.map((p) => (p.id === action.pageId ? { ...p, label: action.from } : p));
      break;
    }
    case 'add-text': {
      pages = pages.map((p) =>
        p.id === action.pageId
          ? {
              ...p,
              annotations: (p.annotations ?? []).filter((a) => a.id !== action.annotation.id)
            }
          : p
      );
      break;
    }
    case 'delete-text': {
      pages = pages.map((p) => {
        if (p.id !== action.pageId) return p;
        const restored = [...(p.annotations ?? [])];
        restored.splice(action.index, 0, action.annotation);
        return { ...p, annotations: restored };
      });
      break;
    }
  }
}

export function redo(): void {
  if (redoStack.length === 0) return;

  const action = redoStack[redoStack.length - 1];
  redoStack = redoStack.slice(0, -1);
  undoStack = [...undoStack, action];

  switch (action.type) {
    case 'reorder': {
      const reordered = new Array<PageInfo>(pages.length);
      for (let i = 0; i < action.toIndices.length; i++) {
        reordered[action.toIndices[i]] = pages[action.fromIndices[i]];
      }
      pages = reordered;
      break;
    }
    case 'rotate': {
      pages = pages.map((p) => {
        const entry = action.rotations.get(p.id);
        return entry ? { ...p, rotation: entry.to } : p;
      });
      break;
    }
    case 'delete': {
      const deletedIds = new Set(action.pages.map((dp) => dp.page.id));
      pages = pages.filter((p) => !deletedIds.has(p.id));
      selection = new Set();
      break;
    }
    case 'add-document': {
      documents = [...documents, action.document];
      pages = [...pages, ...action.pages];
      break;
    }
    case 'label': {
      pages = pages.map((p) => (p.id === action.pageId ? { ...p, label: action.to } : p));
      break;
    }
    case 'add-text': {
      pages = pages.map((p) =>
        p.id === action.pageId
          ? { ...p, annotations: [...(p.annotations ?? []), action.annotation] }
          : p
      );
      break;
    }
    case 'delete-text': {
      pages = pages.map((p) =>
        p.id === action.pageId
          ? {
              ...p,
              annotations: (p.annotations ?? []).filter((a) => a.id !== action.annotation.id)
            }
          : p
      );
      break;
    }
  }
}

export function toggleSelect(pageId: string): void {
  const newSelection = new Set(selection);
  if (newSelection.has(pageId)) newSelection.delete(pageId);
  else newSelection.add(pageId);
  selection = newSelection;
  lastSelectedId = pageId;
}

/** Extend the selection from the last-selected page to this one (Shift+click). */
export function selectRange(pageId: string): void {
  if (!lastSelectedId) {
    toggleSelect(pageId);
    return;
  }

  const lastIdx = pages.findIndex((p) => p.id === lastSelectedId);
  const currentIdx = pages.findIndex((p) => p.id === pageId);

  if (lastIdx === -1 || currentIdx === -1) {
    toggleSelect(pageId);
    return;
  }

  const start = Math.min(lastIdx, currentIdx);
  const end = Math.max(lastIdx, currentIdx);
  const newSelection = new Set(selection);
  for (let i = start; i <= end; i++) newSelection.add(pages[i].id);

  selection = newSelection;
  lastSelectedId = pageId;
}

export function selectAll(): void {
  selection = new Set(pages.map((p) => p.id));
}

export function clearSelection(): void {
  selection = new Set();
  lastSelectedId = null;
}
