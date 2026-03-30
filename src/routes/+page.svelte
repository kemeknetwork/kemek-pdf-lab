<script lang="ts">
  import DropZone from '$lib/components/DropZone.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import PageGrid from '$lib/components/PageGrid.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import { loadDocument } from '$lib/pdf/renderer.js';
  import { mergePdf } from '$lib/pdf/operator.js';
  import { savePdf } from '$lib/utils/file-access.js';
  import {
    getDocuments,
    getPages,
    getSelection,
    getUndoStack,
    getRedoStack,
    addDocument,
    reorderPages,
    rotatePages,
    deletePages,
    undo,
    redo,
    toggleSelect,
    selectRange,
    selectSingle,
    selectAll,
    clearSelection
  } from '$lib/stores/app.js';

  let exporting = $state(false);
  let exportProgress = $state(0);
  let windowDragOver = $state(false);

  // Reactive derived state
  let documents = $derived(getDocuments());
  let pages = $derived(getPages());
  let selection = $derived(getSelection());
  let undoStack = $derived(getUndoStack());
  let redoStack = $derived(getRedoStack());
  let hasDocuments = $derived(documents.length > 0);
  let selectedCount = $derived(selection.size);

  async function handleFiles(files: File[]) {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { pageCount } = await loadDocument(crypto.randomUUID(), bytes);
      const docId = addDocument(file.name, bytes, pageCount);
      // Re-load with the actual document ID from the store
      // The store generates its own ID, so we need to reload with that
      const docs = getDocuments();
      const doc = docs[docs.length - 1];
      await loadDocument(doc.id, bytes);
    }
  }

  function handleAddFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.multiple = true;
    input.onchange = async () => {
      if (input.files) {
        await handleFiles(Array.from(input.files));
      }
    };
    input.click();
  }

  async function handleExport() {
    if (pages.length === 0) return;
    exporting = true;
    exportProgress = 0;

    try {
      exportProgress = 30;
      const bytes = await mergePdf(documents, pages);
      exportProgress = 80;
      const name = documents.length === 1 ? documents[0].name : 'merged.pdf';
      await savePdf(bytes, name);
      exportProgress = 100;
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed. Please try again.');
    } finally {
      setTimeout(() => {
        exporting = false;
        exportProgress = 0;
      }, 300);
    }
  }

  function handleSelect(pageId: string, event: MouseEvent) {
    if (event.shiftKey) {
      selectRange(pageId);
    } else if (event.ctrlKey || event.metaKey) {
      toggleSelect(pageId);
    } else {
      selectSingle(pageId);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // Don't handle if user is in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deletePages();
    } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      rotatePages('cw');
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      selectAll();
    } else if (e.key === 'Escape') {
      clearSelection();
    }
  }

  // Window-level drag for adding files when documents already loaded
  function handleWindowDragOver(e: DragEvent) {
    if (!hasDocuments) return;
    e.preventDefault();
    windowDragOver = true;
  }

  function handleWindowDragLeave(e: DragEvent) {
    // Only clear if actually leaving the window
    if (e.relatedTarget === null) {
      windowDragOver = false;
    }
  }

  function handleWindowDrop(e: DragEvent) {
    if (!hasDocuments) return;
    e.preventDefault();
    windowDragOver = false;
    if (e.dataTransfer?.files) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }
</script>

<svelte:window
  onkeydown={handleKeydown}
  ondragover={handleWindowDragOver}
  ondragleave={handleWindowDragLeave}
  ondrop={handleWindowDrop}
/>

<div class="app-layout">
  {#if hasDocuments}
    <Toolbar
      canUndo={undoStack.length > 0}
      canRedo={redoStack.length > 0}
      {exporting}
      onundo={undo}
      onredo={redo}
      onexport={handleExport}
      onaddfile={handleAddFile}
    />

    {#if windowDragOver}
      <div class="overlay-drop">
        <div class="overlay-drop-content">Drop PDFs to add more files</div>
      </div>
    {/if}

    <PageGrid
      {pages}
      {selection}
      onreorder={reorderPages}
      onselect={handleSelect}
    />

    <StatusBar
      totalPages={pages.length}
      {selectedCount}
      onrotatecw={() => rotatePages('cw')}
      onrotateccw={() => rotatePages('ccw')}
      ondelete={deletePages}
    />
  {:else}
    <DropZone onfiles={handleFiles} />
  {/if}

  {#if exporting}
    <ProgressBar progress={exportProgress} />
  {/if}
</div>

<style>
  .app-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: relative;
  }

  .overlay-drop {
    position: absolute;
    inset: 0;
    background: rgba(59, 130, 246, 0.08);
    border: 3px dashed var(--pdf-lab-primary);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    pointer-events: none;
  }

  .overlay-drop-content {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--pdf-lab-primary);
    background: var(--pdf-lab-surface);
    padding: 1rem 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  }
</style>
