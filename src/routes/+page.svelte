<!--
  +page.svelte — App shell / root page.

  Two states:
    1. Drop state  — no documents loaded → shows DropZone with brand header/footer.
    2. Working state — documents loaded → Toolbar + PageGrid + StatusBar.

  Handles file ingestion, export, keyboard shortcuts, and window-level drag
  for adding files when in working state.
-->
<script lang="ts">
  import DropZone from '$lib/components/DropZone.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import PageGrid from '$lib/components/PageGrid.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import FilenameDialog from '$lib/components/FilenameDialog.svelte';
  import { loadDocument } from '$lib/pdf/renderer.js';
  import { mergePdf } from '$lib/pdf/operator.js';
  import { savePdf } from '$lib/utils/file-access.js';
  import { getLastExportName, setLastExportName } from '$lib/stores/preferences.svelte.js';
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
    setPageLabel,
    undo,
    redo,
    toggleSelect,
    selectRange,
    selectSingle,
    selectAll,
    clearSelection
  } from '$lib/stores/app.svelte.js';

  let exporting = $state(false);
  let exportProgress = $state(0);
  let windowDragOver = $state(false);
  let showExportDialog = $state(false);
  let exportFilename = $state('');
  let showSplitDialog = $state(false);
  let splitFilename = $state('');

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
      const docId = crypto.randomUUID();
      // Load into renderer cache FIRST so thumbnails can render immediately
      // when addDocument triggers the Svelte re-render.
      const { pageCount } = await loadDocument(docId, bytes);
      addDocument(file.name, bytes, pageCount, docId);
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

  function openExportDialog() {
    if (pages.length === 0) return;
    const saved = getLastExportName();
    exportFilename = saved || (documents.length === 1
      ? documents[0].name.replace(/\.pdf$/i, '')
      : 'merged');
    showExportDialog = true;
  }

  async function confirmExport(filename: string) {
    showExportDialog = false;
    setLastExportName(filename);
    const name = filename + '.pdf';
    exporting = true;
    exportProgress = 0;

    try {
      exportProgress = 30;
      const bytes = await mergePdf(documents, pages);
      exportProgress = 80;
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

  function openSplitDialog() {
    if (selection.size === 0) return;
    // If all selected pages are from the same document, use its name
    const selectedPages = pages.filter((p) => selection.has(p.id));
    const sourceIds = new Set(selectedPages.map((p) => p.sourceDocumentId));
    if (sourceIds.size === 1) {
      const doc = documents.find((d) => d.id === [...sourceIds][0]);
      splitFilename = (doc?.name ?? 'extracted').replace(/\.pdf$/i, '') + '-extract';
    } else {
      splitFilename = 'extracted';
    }
    showSplitDialog = true;
  }

  async function confirmSplit(filename: string) {
    showSplitDialog = false;
    const name = filename + '.pdf';
    const selectedPages = pages.filter((p) => selection.has(p.id));
    exporting = true;
    exportProgress = 0;

    try {
      exportProgress = 30;
      const bytes = await mergePdf(documents, selectedPages);
      exportProgress = 80;
      await savePdf(bytes, name);
      exportProgress = 100;
    } catch (e) {
      console.error('Split failed:', e);
      alert('Split failed. Please try again.');
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
    } else {
      // Default click toggles selection — natural for a merge tool where
      // you're building up a multi-page selection, not browsing one at a time.
      toggleSelect(pageId);
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
      if (showExportDialog) {
        showExportDialog = false;
      } else if (showSplitDialog) {
        showSplitDialog = false;
      } else {
        clearSelection();
      }
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
      {selectedCount}
      onundo={undo}
      onredo={redo}
      onexport={openExportDialog}
      onsplit={openSplitDialog}
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
      onlabel={setPageLabel}
    />

    <StatusBar
      totalPages={pages.length}
      {selectedCount}
      onrotatecw={() => rotatePages('cw')}
      onrotateccw={() => rotatePages('ccw')}
      ondelete={deletePages}
    />
  {:else}
    <header class="drop-header">
      <div class="drop-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="drop-logo">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="13" y2="17"/>
        </svg>
        <span class="drop-title"><span class="brand-kemek">KeMeK</span> PDF Lab</span>
      </div>
      <ThemeToggle />
    </header>
    <DropZone onfiles={handleFiles} />
    <footer class="drop-footer">&copy; {new Date().getFullYear()} KeMeK Network</footer>
  {/if}

  <FilenameDialog
    title="Export PDF"
    bind:filename={exportFilename}
    visible={showExportDialog}
    onconfirm={confirmExport}
    oncancel={() => (showExportDialog = false)}
  />

  <FilenameDialog
    title="Split PDF"
    bind:filename={splitFilename}
    visible={showSplitDialog}
    onconfirm={confirmSplit}
    oncancel={() => (showSplitDialog = false)}
  />

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
    background: rgba(21, 128, 61, 0.08);
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

  .drop-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    flex-shrink: 0;
    flex-wrap: nowrap;
  }

  .drop-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .drop-logo {
    color: var(--pdf-lab-primary);
  }

  .drop-title {
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
    letter-spacing: -0.02em;
  }

  .brand-kemek {
    color: var(--pdf-lab-primary);
  }

  .drop-footer {
    flex-shrink: 0;
    text-align: center;
    padding: 0.625rem;
    font-size: 0.7rem;
    color: var(--pdf-lab-text-tertiary, var(--pdf-lab-text-secondary));
    letter-spacing: 0.01em;
  }

</style>
