import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './app.svelte.js';

const bytes = new Uint8Array([1]);

beforeEach(() => {
  store.clearWorkspace();
});

describe('undo / redo of an added document', () => {
  it('brings the document back with the form values entered after it was added', () => {
    const id = store.addDocument('a.pdf', bytes, 2);
    store.setFieldValue(id, 'name', 'Alice');
    store.undo();
    expect(store.getDocuments()).toHaveLength(0);
    store.redo();
    expect(store.getDocuments()[0].fieldValues).toEqual({ name: 'Alice' });
  });

  it('drops the removed pages from the selection, so Delete cannot record an empty action', () => {
    store.addDocument('a.pdf', bytes, 2);
    store.addDocument('b.pdf', bytes, 2);
    for (const p of store.getPages().slice(2)) store.toggleSelect(p.id);
    store.undo();
    expect(store.getPages()).toHaveLength(2);
    expect(store.getSelection().size).toBe(0);
    store.deletePages();
    store.rotatePages('cw');
    // Nothing was recorded, so the undone document is still redoable.
    expect(store.getRedoStack()).toHaveLength(1);
    store.redo();
    expect(store.getPages()).toHaveLength(4);
  });
});

describe('selection after undoing a duplicate', () => {
  it('forgets the clone that undo removed', () => {
    store.addDocument('a.pdf', bytes, 2);
    store.toggleSelect(store.getPages()[0].id);
    store.duplicatePages();
    store.clearSelection();
    store.toggleSelect(store.getPages()[1].id); // the clone
    store.undo();
    expect(store.getSelection().size).toBe(0);
  });

  it('keeps selected pages that still exist', () => {
    store.addDocument('a.pdf', bytes, 3);
    const [first, second] = store.getPages();
    store.toggleSelect(first.id);
    store.duplicatePages();
    store.toggleSelect(second.id);
    store.undo();
    expect([...store.getSelection()].sort()).toEqual([first.id, second.id].sort());
  });
});

describe('releasing an undone document', () => {
  it('waits until its redo is discarded by a new action', () => {
    const released = vi.fn();
    store.onDocumentDiscarded(released);
    const a = store.addDocument('a.pdf', bytes, 1);
    store.addDocument('b.pdf', bytes, 1);
    store.undo(); // b is undone, still redoable
    expect(released).not.toHaveBeenCalled();
    store.toggleSelect(store.getPages()[0].id);
    store.rotatePages('cw'); // a new action: b can never come back
    expect(released).toHaveBeenCalledTimes(1);
    expect(released).not.toHaveBeenCalledWith(a);
  });
});
