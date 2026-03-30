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
  } from '$lib/stores/app.svelte.js';

  let exporting = $state(false);
  let exportProgress = $state(0);
  let windowDragOver = $state(false);
  let showExportDialog = $state(false);
  let exportFilename = $state('');
  let exportInputEl = $state<HTMLInputElement | null>(null);

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
    const defaultName = documents.length === 1
      ? documents[0].name.replace(/\.pdf$/i, '')
      : 'merged';
    exportFilename = defaultName;
    showExportDialog = true;
    // Focus + select the input after Svelte renders it
    requestAnimationFrame(() => exportInputEl?.select());
  }

  async function confirmExport() {
    showExportDialog = false;
    const name = (exportFilename.trim() || 'merged') + '.pdf';
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
      onundo={undo}
      onredo={redo}
      onexport={openExportDialog}
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

  {#if showExportDialog}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="export-overlay" onclick={() => (showExportDialog = false)}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="export-dialog" onclick={(e) => e.stopPropagation()}>
        <h3 class="export-dialog-title">Export PDF</h3>
        <label class="export-label" for="export-filename">Filename</label>
        <div class="export-input-row">
          <input
            id="export-filename"
            class="export-input"
            type="text"
            bind:value={exportFilename}
            bind:this={exportInputEl}
            onkeydown={(e) => { if (e.key === 'Enter') confirmExport(); }}
            spellcheck="false"
          />
          <span class="export-ext">.pdf</span>
        </div>
        <div class="export-actions">
          <button class="export-cancel" onclick={() => (showExportDialog = false)}>Cancel</button>
          <button class="export-confirm" onclick={confirmExport}>Export</button>
        </div>
      </div>
    </div>
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

  /* ── Export dialog ── */

  .export-overlay {
    position: fixed;
    inset: 0;
    background: var(--pdf-lab-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.12s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .export-dialog {
    background: var(--pdf-lab-surface);
    border-radius: 12px;
    padding: 1.5rem;
    min-width: 340px;
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .export-dialog-title {
    margin: 0 0 1rem;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .export-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--pdf-lab-text-secondary);
    margin-bottom: 0.375rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .export-input-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .export-input-row:focus-within {
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 3px var(--pdf-lab-primary-glow);
  }

  .export-input {
    flex: 1;
    padding: 0.5rem 0.625rem;
    border: none;
    background: transparent;
    color: var(--pdf-lab-text);
    font-size: 0.875rem;
    font-family: var(--pdf-lab-font);
    outline: none;
  }

  .export-ext {
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--pdf-lab-text-tertiary);
    background: var(--pdf-lab-surface-hover);
    border-left: 1px solid var(--pdf-lab-border);
    user-select: none;
  }

  .export-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }

  .export-cancel,
  .export-confirm {
    padding: 0.4375rem 0.875rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .export-cancel {
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    border: 1px solid var(--pdf-lab-border);
  }

  .export-cancel:hover {
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border-strong);
  }

  .export-confirm {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border: 1px solid var(--pdf-lab-primary);
    box-shadow: 0 1px 2px rgba(21, 128, 61, 0.2);
  }

  .export-confirm:hover {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }

  .export-confirm:active,
  .export-cancel:active {
    transform: scale(0.97);
  }
</style>
