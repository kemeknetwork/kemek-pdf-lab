<script lang="ts">
  import DropZone from '$lib/components/DropZone.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import PageGrid from '$lib/components/PageGrid.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import FilenameDialog from '$lib/components/FilenameDialog.svelte';
  import SplitDialog from '$lib/components/SplitDialog.svelte';
  import PagePreviewModal from '$lib/components/PagePreviewModal.svelte';
  import WatermarkDialog from '$lib/components/WatermarkDialog.svelte';
  import PasswordDialog from '$lib/components/PasswordDialog.svelte';
  import PrivacyNote from '$lib/components/PrivacyNote.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { loadDocument, releaseDocument } from '$lib/pdf/renderer.js';
  import { decryptPdf, isPasswordRequired, WrongPasswordError } from '$lib/pdf/decrypt.js';
  import { mergePdf, watermarkTargetIndices } from '$lib/pdf/operator.js';
  import { applyWatermark } from '$lib/pdf/watermark.js';
  import { splitGroups, type SplitMode } from '$lib/pdf/split.js';
  import { makeZip } from '$lib/utils/zip.js';
  import { savePdf, saveZip, sanitizeBaseName } from '$lib/utils/file-access.js';
  import { validateFiles } from '$lib/utils/validate.js';
  import type { PageInfo } from '$lib/pdf/types.js';
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
    selectAll,
    clearSelection,
    clearWorkspace,
    getWatermark,
    getWatermarkTargetIds
  } from '$lib/stores/app.svelte.js';

  let exporting = $state(false);
  let exportProgress = $state(0);
  let windowDragOver = $state(false);
  let showExportDialog = $state(false);
  let exportFilename = $state('');
  let showSplitDialog = $state(false);
  let splitFilename = $state('');
  let previewPageId = $state<string | null>(null);
  let showWatermarkDialog = $state(false);
  let showClearConfirm = $state(false);
  // Password prompt for encrypted PDFs. Non-null while a file awaits its
  // password; the load loop awaits the promise held in pwResolve.
  let pwPrompt = $state<{ filename: string; error: string | null } | null>(null);
  let pwResolve: ((value: string | null) => void) | null = null;
  // Guards re-entrant drops: a batch can sit awaiting a password prompt, and a
  // concurrent drop would overwrite the single pwResolve slot and strand the
  // first file's prompt forever. Ignore new batches while one is in flight.
  let loadingBatch = false;

  let documents = $derived(getDocuments());
  let pages = $derived(getPages());
  let selection = $derived(getSelection());
  let undoStack = $derived(getUndoStack());
  let redoStack = $derived(getRedoStack());
  let hasDocuments = $derived(documents.length > 0);
  let selectedCount = $derived(selection.size);
  let watermark = $derived(getWatermark());

  function makeDocId(): string {
    try { return crypto.randomUUID(); }
    catch { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }

  // Open the password dialog and resolve once the user submits or cancels.
  function promptPassword(filename: string, error: string | null): Promise<string | null> {
    pwPrompt = { filename, error };
    return new Promise((resolve) => { pwResolve = resolve; });
  }

  function resolvePassword(value: string | null) {
    pwPrompt = null;
    const resolve = pwResolve;
    pwResolve = null;
    resolve?.(value);
  }

  async function loadOne(file: File, loadErrors: string[]) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const docId = makeDocId();
    try {
      // Parse into the renderer cache first so PageThumbnail components can
      // start rendering as soon as Svelte mounts them.
      const { pageCount } = await loadDocument(docId, bytes);
      addDocument(file.name, bytes, pageCount, docId);
      return;
    } catch (e) {
      if (!isPasswordRequired(e)) {
        console.error(`Failed to load "${file.name}":`, e);
        loadErrors.push(`"${file.name}" could not be loaded — it may be corrupt or damaged.`);
        return;
      }
    }
    // Encrypted: prompt → decrypt locally with qpdf → re-load the cleartext.
    // Store the DECRYPTED bytes so render + export downstream never see
    // encryption (no passwords threaded through the pipeline).
    let error: string | null = null;
    for (;;) {
      const password = await promptPassword(file.name, error);
      if (password === null) {
        loadErrors.push(`"${file.name}" was skipped — still locked.`);
        return;
      }
      try {
        const decrypted = await decryptPdf(bytes, password);
        const { pageCount } = await loadDocument(docId, decrypted);
        addDocument(file.name, decrypted, pageCount, docId);
        return;
      } catch (err) {
        if (err instanceof WrongPasswordError) {
          error = 'Incorrect password — try again.';
          continue;
        }
        console.error(`Failed to unlock "${file.name}":`, err);
        loadErrors.push(`"${file.name}" could not be unlocked.`);
        return;
      }
    }
  }

  async function handleFiles(files: File[]) {
    if (loadingBatch) return;
    loadingBatch = true;
    try {
      const { valid, errors, warnings } = await validateFiles(files);
      const loadErrors: string[] = [];
      for (const file of valid) await loadOne(file, loadErrors);
      const messages = [...errors, ...loadErrors, ...warnings];
      if (messages.length > 0) {
        alert(messages.join('\n'));
      }
    } finally {
      loadingBatch = false;
    }
  }

  function handleAddFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf,.jpg,.jpeg,.png,image/jpeg,image/png';
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
    const name = sanitizeBaseName(filename) + '.pdf';
    exporting = true;
    exportProgress = 0;

    try {
      exportProgress = 30;
      let bytes = await mergePdf(documents, pages);
      if (watermark) {
        exportProgress = 60;
        bytes = await applyWatermark(bytes, watermark, watermarkTargetIndices(pages, getWatermarkTargetIds()));
      }
      exportProgress = 80;
      await savePdf(bytes, name);
      exportProgress = 100;
    } catch (e) {
      console.error('Export failed:', e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Export failed: ${msg}`);
    } finally {
      setTimeout(() => {
        exporting = false;
        exportProgress = 0;
      }, 300);
    }
  }

  function openSplitDialog() {
    if (pages.length === 0) return;
    splitFilename =
      documents.length === 1 ? documents[0].name.replace(/\.pdf$/i, '') : 'document';
    showSplitDialog = true;
  }

  // Render one group of pages to a PDF, carrying the watermark exactly as a full
  // export would (targets resolved against that group's pages).
  async function renderGroup(groupPages: PageInfo[]): Promise<Uint8Array> {
    const bytes = await mergePdf(documents, groupPages);
    if (!watermark) return bytes;
    return applyWatermark(bytes, watermark, watermarkTargetIndices(groupPages, getWatermarkTargetIds()));
  }

  async function confirmSplit(result: { mode: 'each' | 'chunk' | 'selected'; size: number; filename: string }) {
    showSplitDialog = false;
    const base = sanitizeBaseName(result.filename);
    exporting = true;
    exportProgress = 0;

    try {
      if (result.mode === 'selected') {
        // Extract the selected pages as one PDF (the original "Split" behavior).
        const selectedPages = pages.filter((p) => selection.has(p.id));
        exportProgress = 40;
        const bytes = await renderGroup(selectedPages);
        exportProgress = 85;
        await savePdf(bytes, base + '.pdf');
      } else {
        // True split: render each group to its own PDF, bundle as a ZIP.
        const mode: SplitMode =
          result.mode === 'each' ? { kind: 'each' } : { kind: 'chunk', size: result.size };
        const groups = splitGroups(pages, mode);
        const entries: { name: string; data: Uint8Array }[] = [];
        for (let i = 0; i < groups.length; i++) {
          entries.push({ name: `${base}-${groups[i].suffix}.pdf`, data: await renderGroup(groups[i].pages) });
          exportProgress = Math.round(((i + 1) / groups.length) * 90);
        }
        await saveZip(makeZip(entries), base + '.zip');
      }
      exportProgress = 100;
    } catch (e) {
      console.error('Split failed:', e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Split failed: ${msg}`);
    } finally {
      setTimeout(() => {
        exporting = false;
        exportProgress = 0;
      }, 300);
    }
  }

  function performClear() {
    // Release the parsed PDFs from the renderer cache, then wipe all state —
    // the in-memory files are forgotten and the app returns to the empty state.
    for (const doc of documents) releaseDocument(doc.id);
    clearWorkspace();
    showClearConfirm = false;
  }

  function handleSelect(pageId: string, event: MouseEvent) {
    // Plain click toggles rather than replaces: the merge flow is usually
    // accumulating a multi-page selection, not browsing one at a time.
    if (event.shiftKey) selectRange(pageId);
    else toggleSelect(pageId);
  }

  function handleKeydown(e: KeyboardEvent) {
    // PagePreviewModal and WatermarkDialog own the keyboard while open — each
    // has its own Escape handler; suppress every grid-level shortcut so
    // R/Delete/Ctrl-A don't fire on the grid behind the modal.
    if (previewPageId || showWatermarkDialog || pwPrompt || showClearConfirm) return;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;

    // e.key reports the produced character, so Shift+letter yields uppercase
    // ('Z', 'R'). Lowercase here so Ctrl+Shift+Z and Shift+R match.
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (key === 'z' && mod && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (key === 'z' && mod) {
      e.preventDefault();
      undo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deletePages();
    } else if (key === 'r' && !mod) {
      e.preventDefault();
      rotatePages(e.shiftKey ? 'ccw' : 'cw');
    } else if (key === 'a' && mod) {
      e.preventDefault();
      selectAll();
    } else if (key === 'd' && mod) {
      e.preventDefault();
      clearSelection();
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

  function handleWindowDragOver(e: DragEvent) {
    if (!hasDocuments) return;
    e.preventDefault();
    windowDragOver = true;
  }

  function handleWindowDragLeave(e: DragEvent) {
    // relatedTarget is null only when the pointer actually leaves the window;
    // child element transitions would otherwise flicker the overlay off.
    if (e.relatedTarget === null) windowDragOver = false;
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
      pageCount={pages.length}
      watermarkActive={watermark !== null}
      onundo={undo}
      onredo={redo}
      onexport={openExportDialog}
      onsplit={openSplitDialog}
      onaddfile={handleAddFile}
      onwatermark={() => (showWatermarkDialog = true)}
    />

    {#if windowDragOver}
      <div class="overlay-drop">
        <div class="overlay-drop-content">Drop PDFs or images to add more files</div>
      </div>
    {/if}

    <PageGrid
      {pages}
      {selection}
      onreorder={reorderPages}
      onselect={handleSelect}
      onlabel={setPageLabel}
      onpreview={(pageId) => (previewPageId = pageId)}
    />

    <StatusBar
      totalPages={pages.length}
      {selectedCount}
      onrotatecw={() => rotatePages('cw')}
      onrotateccw={() => rotatePages('ccw')}
      ondelete={deletePages}
      onclear={() => (showClearConfirm = true)}
    />
  {:else}
    <header class="drop-header">
      <div class="drop-brand">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="drop-logo">
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
    <PrivacyNote />
    <footer class="drop-footer">KeMeK Network &copy; {new Date().getFullYear()} | PDF Lab v{__APP_VERSION__}</footer>
  {/if}

  <FilenameDialog
    title="Export PDF"
    bind:filename={exportFilename}
    visible={showExportDialog}
    onconfirm={confirmExport}
    oncancel={() => (showExportDialog = false)}
  />

  <SplitDialog
    visible={showSplitDialog}
    pageCount={pages.length}
    selectedCount={selectedCount}
    bind:filename={splitFilename}
    onconfirm={confirmSplit}
    oncancel={() => (showSplitDialog = false)}
  />

  {#if exporting}
    <ProgressBar progress={exportProgress} />
  {/if}

  {#if previewPageId}
    <PagePreviewModal
      pageId={previewPageId}
      onclose={() => (previewPageId = null)}
    />
  {/if}

  {#if showWatermarkDialog}
    <WatermarkDialog onclose={() => (showWatermarkDialog = false)} />
  {/if}

  <PasswordDialog
    visible={pwPrompt !== null}
    filename={pwPrompt?.filename ?? ''}
    error={pwPrompt?.error ?? null}
    onconfirm={(pw) => resolvePassword(pw)}
    oncancel={() => resolvePassword(null)}
  />

  <ConfirmDialog
    visible={showClearConfirm}
    title="Clear workspace?"
    message="This forgets every loaded file and all your edits. They're only in memory, so there's nothing to recover — but nothing was ever uploaded either."
    confirmLabel="Clear everything"
    danger
    onconfirm={performClear}
    oncancel={() => (showClearConfirm = false)}
  />
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
    background: var(--pdf-lab-primary-soft);
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
    box-shadow: var(--pdf-lab-shadow-md);
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
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .brand-kemek {
    color: var(--pdf-lab-primary);
  }

  .drop-footer {
    flex-shrink: 0;
    text-align: center;
    padding: 0.625rem;
    font-size: 0.8125rem;
    color: var(--pdf-lab-text-tertiary, var(--pdf-lab-text-secondary));
    letter-spacing: 0.01em;
  }

</style>
