/**
 * Application state store — Svelte 5 runes.
 *
 * All mutable state lives here as module-level `$state` variables. Components
 * access state through getter functions and mutate it through action functions.
 * Every user action that modifies pages pushes an {@link Action} onto the undo
 * stack so the operation can be reversed.
 *
 * File must be `.svelte.ts` for rune compilation.
 */

import type { PageInfo, Document, Action } from '$lib/pdf/types.js';
import { releaseDocument } from '$lib/pdf/renderer.js';

function generateId(): string {
  return crypto.randomUUID();
}

// ── Reactive state (Svelte 5 runes) ─────────────────────────────────────────
let documents = $state<Document[]>([]);
let pages = $state<PageInfo[]>([]);
let selection = $state<Set<string>>(new Set());
let undoStack = $state<Action[]>([]);
let redoStack = $state<Action[]>([]);
let lastSelectedId = $state<string | null>(null);

// ── Getters (read reactive state from components) ────────────────────────────

export function getDocuments(): Document[] { return documents; }
export function getPages(): PageInfo[] { return pages; }
export function getSelection(): Set<string> { return selection; }
export function getUndoStack(): Action[] { return undoStack; }
export function getRedoStack(): Action[] { return redoStack; }
export function getLastSelectedId(): string | null { return lastSelectedId; }

// ── Mutations (each pushes an Action for undo/redo) ──────────────────────────

/**
 * Register a new PDF document and add its pages to the workspace.
 * Accepts an optional pre-generated {@link id} so the caller can load the
 * document into the renderer cache first (avoiding a race condition).
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

  const doc: Document = {
    id: docId,
    name,
    pdfBytes,
    pages: docPages,
    pageCount
  };

  documents = [...documents, doc];
  pages = [...pages, ...docPages];

  const action: Action = {
    type: 'add-document',
    documentId: docId,
    pageIds: docPages.map((p) => p.id),
    document: doc,
    pages: docPages
  };
  undoStack = [...undoStack, action];
  redoStack = [];

  return docId;
}

/** Replace the page array with a new order (called by drag-and-drop). */
export function reorderPages(newPages: PageInfo[]): void {
  const oldIds = pages.map((p) => p.id);
  const newIds = newPages.map((p) => p.id);

  // Check if order actually changed
  if (oldIds.every((id, i) => id === newIds[i])) return;

  const fromIndices = oldIds.map((_, i) => i);
  const toIndices = oldIds.map((id) => newIds.indexOf(id));

  const action: Action = {
    type: 'reorder',
    pageIds: oldIds,
    fromIndices,
    toIndices
  };
  undoStack = [...undoStack, action];
  redoStack = [];

  pages = newPages;
}

/** Rotate all selected pages 90 degrees in the given direction. */
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

  const action: Action = {
    type: 'rotate',
    pageIds: [...selectedIds],
    rotations
  };
  undoStack = [...undoStack, action];
  redoStack = [];
}

/** Remove all selected pages from the workspace. */
export function deletePages(): void {
  if (selection.size === 0) return;

  const selectedIds = new Set(selection);
  const deletedPages: { page: PageInfo; index: number }[] = [];

  pages.forEach((p, i) => {
    if (selectedIds.has(p.id)) {
      deletedPages.push({ page: { ...p }, index: i });
    }
  });

  const action: Action = {
    type: 'delete',
    pages: deletedPages
  };
  undoStack = [...undoStack, action];
  redoStack = [];

  pages = pages.filter((p) => !selectedIds.has(p.id));
  selection = new Set();
}

/** Set or clear the label on a single page. */
export function setPageLabel(pageId: string, label: string | undefined): void {
  const page = pages.find((p) => p.id === pageId);
  if (!page) return;

  const from = page.label;
  if (from === label) return;

  pages = pages.map((p) => (p.id === pageId ? { ...p, label } : p));

  const action: Action = { type: 'label', pageId, from, to: label };
  undoStack = [...undoStack, action];
  redoStack = [];
}

// ── Undo / Redo ──────────────────────────────────────────────────────────────

/** Pop the last action off the undo stack and reverse it. */
export function undo(): void {
  if (undoStack.length === 0) return;

  const action = undoStack[undoStack.length - 1];
  undoStack = undoStack.slice(0, -1);
  redoStack = [...redoStack, action];

  switch (action.type) {
    case 'reorder': {
      // Reverse: build the original order from toIndices -> fromIndices
      const reordered = new Array<PageInfo>(pages.length);
      for (let i = 0; i < action.fromIndices.length; i++) {
        const currentIdx = action.toIndices[i];
        const originalIdx = action.fromIndices[i];
        reordered[originalIdx] = pages[currentIdx];
      }
      pages = reordered;
      break;
    }
    case 'rotate': {
      pages = pages.map((p) => {
        const entry = action.rotations.get(p.id);
        if (!entry) return p;
        return { ...p, rotation: entry.from };
      });
      break;
    }
    case 'delete': {
      // Re-insert deleted pages at their original positions
      const newPages = [...pages];
      const sorted = [...action.pages].sort((a, b) => a.index - b.index);
      for (const { page, index } of sorted) {
        newPages.splice(index, 0, page);
      }
      pages = newPages;
      break;
    }
    case 'add-document': {
      const pageIdSet = new Set(action.pageIds);
      pages = pages.filter((p) => !pageIdSet.has(p.id));
      documents = documents.filter((d) => d.id !== action.documentId);
      releaseDocument(action.documentId);
      break;
    }
    case 'label': {
      pages = pages.map((p) => (p.id === action.pageId ? { ...p, label: action.from } : p));
      break;
    }
  }
}

/** Pop the last action off the redo stack and replay it. */
export function redo(): void {
  if (redoStack.length === 0) return;

  const action = redoStack[redoStack.length - 1];
  redoStack = redoStack.slice(0, -1);
  undoStack = [...undoStack, action];

  switch (action.type) {
    case 'reorder': {
      const reordered = new Array<PageInfo>(pages.length);
      for (let i = 0; i < action.toIndices.length; i++) {
        const fromIdx = action.fromIndices[i];
        const toIdx = action.toIndices[i];
        reordered[toIdx] = pages[fromIdx];
      }
      pages = reordered;
      break;
    }
    case 'rotate': {
      pages = pages.map((p) => {
        const entry = action.rotations.get(p.id);
        if (!entry) return p;
        return { ...p, rotation: entry.to };
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
  }
}

// ── Selection ────────────────────────────────────────────────────────────────

/** Toggle a single page in/out of the selection (default click behavior). */
export function toggleSelect(pageId: string): void {
  const newSelection = new Set(selection);
  if (newSelection.has(pageId)) {
    newSelection.delete(pageId);
  } else {
    newSelection.add(pageId);
  }
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

  for (let i = start; i <= end; i++) {
    newSelection.add(pages[i].id);
  }

  selection = newSelection;
  lastSelectedId = pageId;
}

/** Replace the entire selection with a single page. */
export function selectSingle(pageId: string): void {
  selection = new Set([pageId]);
  lastSelectedId = pageId;
}

/** Select every page in the workspace (Ctrl+A). */
export function selectAll(): void {
  selection = new Set(pages.map((p) => p.id));
}

/** Deselect all pages (Escape). */
export function clearSelection(): void {
  selection = new Set();
  lastSelectedId = null;
}
