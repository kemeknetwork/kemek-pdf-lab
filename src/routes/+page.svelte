<script lang="ts">
  import { onMount } from 'svelte';
  import DropZone from '#lib/components/DropZone.svelte';
  import ThemeToggle from '#lib/components/ThemeToggle.svelte';
  import ProgressBar from '#lib/components/ProgressBar.svelte';
  import ExportDialog from '#lib/components/ExportDialog.svelte';
  import SplitDialog from '#lib/components/SplitDialog.svelte';
  import PasswordDialog from '#lib/components/PasswordDialog.svelte';
  // The four heaviest dialogs are lazy-imported at their {#if} usage sites below
  // (PagePreviewModal, WatermarkDialog, StampDialog, InspectDialog) so they land
  // in on-demand chunks instead of the initial route bundle — they only render
  // on interaction. Cached after first open.
  import PrivacyNote from '#lib/components/PrivacyNote.svelte';
  import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
  // Eager (NOT lazy): this is the fallback shown when a lazy dialog chunk fails
  // to fetch — it must already be in the bundle, or the fallback could fail too.
  import ChunkLoadError from '#lib/components/ChunkLoadError.svelte';
  import WorkspacePending from '#lib/components/WorkspacePending.svelte';
  import { loadDocument, releaseAll, releaseDocument, renderBytesToImages, extractEmbeddedImages, extractText } from '#lib/pdf/renderer.js';
  import { DamagedPdfError, decryptPdf, isPasswordRequired, WrongPasswordError } from '#lib/pdf/decrypt.js';
  import { mergePdf, watermarkTargetIndices } from '#lib/pdf/operator.js';
  import { applyWatermark } from '#lib/pdf/watermark.js';
  import { applyStamp } from '#lib/pdf/stamp.js';
  import { splitGroups, type SplitMode } from '#lib/pdf/split.js';
  import { makeZip } from '#lib/utils/zip.js';
  import { savePdf, saveZip, saveImage, saveText, imageExt, sanitizeBaseName } from '#lib/utils/file-access.js';
  import { validateFiles } from '#lib/utils/validate.js';
  import { generateId } from '#lib/utils/id.js';
  import type { PageInfo } from '#lib/pdf/types.js';
  import { getLastExportName, setLastExportName } from '#lib/stores/preferences.svelte.js';
  import { holdQuietUpdate } from '#lib/stores/pwa.svelte.js';
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
    duplicatePages,
    reversePages,
    setPageLabel,
    undo,
    redo,
    toggleSelect,
    selectRange,
    selectAll,
    clearSelection,
    clearWorkspace,
    onDocumentDiscarded,
    getWatermark,
    getWatermarkTargetIds,
    getStamp,
    getFlattenForms,
    setFlattenForms
  } from '#lib/stores/app.svelte.js';

  // An undone document whose redo can no longer happen is released from the
  // renderer cache (and the shared pdf.js worker) instead of living until Clear.
  onDocumentDiscarded(releaseDocument);

  let exporting = $state(false);
  let exportProgress = $state(0);
  let windowDragOver = $state(false);
  let showExportDialog = $state(false);
  let exportFilename = $state('');
  let showSplitDialog = $state(false);
  let splitFilename = $state('');
  let previewPageId = $state<string | null>(null);
  let showWatermarkDialog = $state(false);
  let showStampDialog = $state(false);
  let showAlternateDialog = $state(false);
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

  // The working view never renders before a file opens, so it stays out of the
  // first-paint bundle: Toolbar, PageGrid and StatusBar, and svelte-dnd-action
  // with the grid. It is fetched once the page is idle, so it is already in
  // memory when a dropped file finishes parsing, and a later deploy can't
  // remove its chunk from under a tab that opened before it. A failed load is
  // forgotten rather than cached here, but that alone is not a retry: Chromium
  // keeps the failed module fetch and fails the same import again, without a
  // request, until the page reloads (measured 2026-11-12).
  function loadWorkspace() {
    return Promise.all([
      import('#lib/components/Toolbar.svelte'),
      import('#lib/components/PageGrid.svelte'),
      import('#lib/components/StatusBar.svelte')
    ]).then(([toolbar, grid, status]) => ({
      Toolbar: toolbar.default,
      PageGrid: grid.default,
      StatusBar: status.default
    }));
  }
  let workspace: ReturnType<typeof loadWorkspace> | null = null;
  function workspaceModules() {
    return (workspace ??= loadWorkspace().catch((err) => {
      workspace = null;
      throw err;
    }));
  }
  // What the page renders from: the shared load, plus state the keyboard and drop
  // handlers can read (an {#await} branch is invisible to them). Until the
  // workspace mounts, grid shortcuts would act on pages nobody can see.
  let workspaceReady = $state(false);
  let workspaceFailed = $state(false);
  function openWorkspace() {
    return workspaceModules().then(
      (modules) => {
        workspaceReady = true;
        return modules;
      },
      (err) => {
        workspaceFailed = true;
        throw err;
      }
    );
  }
  onMount(() => {
    const prefetch = () => void workspaceModules().catch(() => {});
    if ('requestIdleCallback' in window) requestIdleCallback(prefetch, { timeout: 2000 });
    else setTimeout(prefetch, 200);
  });
  let selectedCount = $derived(selection.size);
  // Alternate & mix needs two interleavable sides: 2+ distinct source documents
  // still represented in the current page list (a doc whose pages were all
  // deleted no longer counts).
  let alternateEligible = $derived(new Set(pages.map((p) => p.sourceDocumentId)).size >= 2);
  let watermark = $derived(getWatermark());
  let stamp = $derived(getStamp());
  let flattenForms = $derived(getFlattenForms());
  let showInspectDialog = $state(false);

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
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (e) {
      // The file moved or changed after it was picked, or a cloud placeholder
      // failed to download: this file's problem, not the rest of the batch's.
      console.error(`Failed to read "${file.name}":`, e);
      loadErrors.push(`"${file.name}" could not be read — it may have moved or changed since it was chosen.`);
      return;
    }
    const docId = generateId();
    try {
      // Parse into the renderer cache first so PageThumbnail components can
      // start rendering as soon as Svelte mounts them.
      const { pageCount, encrypted } = await loadDocument(docId, bytes);
      if (!encrypted) {
        addDocument(file.name, bytes, pageCount, docId);
        return;
      }
      // Opened with no password, so only an owner password (print/copy
      // restrictions) guards it. Every export would refuse the encrypted bytes,
      // so decrypt with the empty user password and store the cleartext.
      try {
        addDocument(file.name, await decryptPdf(bytes, ''), pageCount, docId);
      } catch (err) {
        console.error(`Failed to remove the restrictions on "${file.name}":`, err);
        releaseDocument(docId);
        loadErrors.push(`"${file.name}" has restrictions this app could not remove, so it can't be edited.`);
      }
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
        loadErrors.push(
          err instanceof DamagedPdfError
            ? `"${file.name}" could not be unlocked — the file appears to be damaged.`
            : `"${file.name}" could not be unlocked.`
        );
        return;
      }
    }
  }

  // Files that arrive while a batch is still loading (a second drop during a
  // password prompt or a long parse) wait their turn instead of being dropped.
  let queuedFiles: File[] = [];

  async function handleFiles(files: File[]) {
    if (loadingBatch) {
      queuedFiles = [...queuedFiles, ...files];
      return;
    }
    loadingBatch = true;
    // A file still being read isn't in the store yet; keep a hidden tab from
    // applying a waiting update over it. The hold spans queued files too.
    const releaseUpdateHold = holdQuietUpdate();
    try {
      let batch = files;
      while (batch.length > 0) {
        const { valid, errors, warnings } = await validateFiles(batch);
        const loadErrors: string[] = [];
        for (const file of valid) await loadOne(file, loadErrors);
        const messages = [...errors, ...loadErrors, ...warnings];
        if (messages.length > 0) {
          alert(messages.join('\n'));
        }
        batch = queuedFiles;
        queuedFiles = [];
      }
    } catch (e) {
      console.error('Adding files failed:', e);
      alert(`Could not add those files: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      queuedFiles = [];
      loadingBatch = false;
      releaseUpdateHold();
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

  // Clear the progress bar a beat after an export/split/extract settles (success
  // or failure), leaving the 100% bar briefly visible. Shared by all four export
  // paths' finally blocks.
  function finishExport() {
    setTimeout(() => {
      exporting = false;
      exportProgress = 0;
    }, 300);
  }

  // What an export renders, read once BEFORE its first await. Reading the live
  // state after one let a change made meanwhile reach part of the output: the
  // watermark's targets were resolved against the pages as they were AFTER the
  // merge, so a Delete during export moved the watermark onto other pages.
  interface ExportSnapshot {
    documents: typeof documents;
    pages: PageInfo[];
    flattenForms: boolean;
    watermark: typeof watermark;
    watermarkTargetIds: string[] | null;
    stamp: typeof stamp;
  }

  function exportSnapshot(): ExportSnapshot {
    return { documents, pages, flattenForms, watermark, watermarkTargetIds: getWatermarkTargetIds(), stamp };
  }

  async function confirmExport(result: { format: 'pdf' | 'png' | 'jpeg'; filename: string }) {
    showExportDialog = false;
    setLastExportName(result.filename);
    const base = sanitizeBaseName(result.filename);
    const snap = exportSnapshot();
    exporting = true;
    exportProgress = 0;

    try {
      // Assemble the export PDF (reorder / rotation / annotations / watermark) —
      // the source of truth for both PDF and image output.
      exportProgress = 25;
      let bytes = await mergePdf(snap.documents, snap.pages, { flattenForms: snap.flattenForms });
      if (snap.watermark) {
        exportProgress = 50;
        bytes = await applyWatermark(bytes, snap.watermark, watermarkTargetIndices(snap.pages, snap.watermarkTargetIds));
      }
      if (snap.stamp) {
        exportProgress = 65;
        bytes = await applyStamp(bytes, snap.stamp);
      }

      if (result.format === 'pdf') {
        exportProgress = 85;
        await savePdf(bytes, base + '.pdf');
      } else {
        // Rasterize the assembled output to one image per page.
        const mime = result.format === 'png' ? 'image/png' : 'image/jpeg';
        const images = await renderBytesToImages(bytes, { mime, dpi: 150, quality: 0.92 });
        exportProgress = 90;
        const ext = imageExt(result.format);
        if (images.length === 1) {
          await saveImage(new Uint8Array(await images[0].arrayBuffer()), base + ext, result.format);
        } else {
          const width = String(images.length).length;
          const entries = await Promise.all(
            images.map(async (img, i) => ({
              name: `${base}-page-${String(i + 1).padStart(width, '0')}${ext}`,
              data: new Uint8Array(await img.arrayBuffer())
            }))
          );
          await saveZip(makeZip(entries), base + '.zip');
        }
      }
      exportProgress = 100;
    } catch (e) {
      console.error('Export failed:', e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Export failed: ${msg}`);
    } finally {
      finishExport();
    }
  }

  function openSplitDialog() {
    if (pages.length === 0) return;
    splitFilename =
      documents.length === 1 ? documents[0].name.replace(/\.pdf$/i, '') : 'document';
    showSplitDialog = true;
  }

  // Render one group of pages to a PDF, carrying every export modifier — flatten,
  // watermark, and stamp — exactly as a full export would, so each active feature
  // shows up in split output too. The stamp numbers each group from its start (a
  // split file is its own document); watermark targets resolve against the group's
  // pages. Metadata is dropped by mergePdf for every group (see operator.ts).
  async function renderGroup(snap: ExportSnapshot, groupPages: PageInfo[]): Promise<Uint8Array> {
    let bytes = await mergePdf(snap.documents, groupPages, { flattenForms: snap.flattenForms });
    if (snap.watermark) {
      bytes = await applyWatermark(bytes, snap.watermark, watermarkTargetIndices(groupPages, snap.watermarkTargetIds));
    }
    if (snap.stamp) {
      bytes = await applyStamp(bytes, snap.stamp);
    }
    return bytes;
  }

  async function confirmSplit(result: { mode: 'each' | 'chunk' | 'selected'; size: number; filename: string }) {
    showSplitDialog = false;
    const base = sanitizeBaseName(result.filename);
    const snap = exportSnapshot();
    const selected = new Set(selection);
    exporting = true;
    exportProgress = 0;

    try {
      if (result.mode === 'selected') {
        // Extract the selected pages as one PDF (the original "Split" behavior).
        const selectedPages = snap.pages.filter((p) => selected.has(p.id));
        exportProgress = 40;
        const bytes = await renderGroup(snap, selectedPages);
        exportProgress = 85;
        await savePdf(bytes, base + '.pdf');
      } else {
        // True split: render each group to its own PDF, bundle as a ZIP.
        const mode: SplitMode =
          result.mode === 'each' ? { kind: 'each' } : { kind: 'chunk', size: result.size };
        const groups = splitGroups(snap.pages, mode);
        const entries: { name: string; data: Uint8Array }[] = [];
        for (let i = 0; i < groups.length; i++) {
          entries.push({ name: `${base}-${groups[i].suffix}.pdf`, data: await renderGroup(snap, groups[i].pages) });
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
      finishExport();
    }
  }

  async function handleExtractImages() {
    if (pages.length === 0) return;
    exporting = true;
    exportProgress = 10;
    try {
      // Pull embedded images from the SOURCE documents (originals, independent of
      // reorder/edits). Dedup is per-document; a duplicate across two loaded PDFs
      // is a rare edge we don't collapse.
      const docs = documents;
      const images: Blob[] = [];
      for (let i = 0; i < docs.length; i++) {
        images.push(...(await extractEmbeddedImages(docs[i].id)));
        exportProgress = 10 + Math.round(((i + 1) / docs.length) * 70);
      }

      if (images.length === 0) {
        alert('No embedded images found — this PDF has no extractable raster images (vector graphics and text aren’t images).');
        return;
      }

      const base = sanitizeBaseName(docs.length === 1 ? docs[0].name.replace(/\.pdf$/i, '') : 'images');
      if (images.length === 1) {
        await saveImage(new Uint8Array(await images[0].arrayBuffer()), base + '.png', 'png');
      } else {
        const width = String(images.length).length;
        const entries = await Promise.all(
          images.map(async (img, i) => ({
            name: `${base}-image-${String(i + 1).padStart(width, '0')}.png`,
            data: new Uint8Array(await img.arrayBuffer())
          }))
        );
        await saveZip(makeZip(entries), base + '-images.zip');
      }
      exportProgress = 100;
    } catch (e) {
      console.error('Extract images failed:', e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Extract images failed: ${msg}`);
    } finally {
      finishExport();
    }
  }

  async function handleExtractText() {
    if (pages.length === 0) return;
    exporting = true;
    exportProgress = 20;
    try {
      // Extract in the current page arrangement (reorder/delete respected).
      const docs = documents;
      const text = await extractText(pages);
      exportProgress = 80;
      if (text.trim() === '') {
        alert('No selectable text found — this PDF looks like scanned images. Text extraction needs a real text layer (OCR isn’t included).');
        return;
      }
      const base = sanitizeBaseName(docs.length === 1 ? docs[0].name.replace(/\.pdf$/i, '') : 'text');
      await saveText(text, base + '.txt');
      exportProgress = 100;
    } catch (e) {
      console.error('Extract text failed:', e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Extract text failed: ${msg}`);
    } finally {
      finishExport();
    }
  }

  function performClear() {
    // Release EVERY parsed PDF from the renderer cache (releaseAll, not a loop
    // over documents[]) so an undone-add doc still in the cache is forgotten too
    // — Clear is the privacy "forget everything" action. Then wipe all state.
    releaseAll();
    clearWorkspace();
    showClearConfirm = false;
  }

  function handleSelect(pageId: string, event: MouseEvent) {
    // Plain click toggles rather than replaces: the merge flow is usually
    // accumulating a multi-page selection, not browsing one at a time.
    if (event.shiftKey) selectRange(pageId);
    else toggleSelect(pageId);
  }

  // Any overlay that owns the keyboard. Export/Split were missing from the
  // hand-kept list this replaced, so R/Delete/Ctrl+A hit the grid behind them.
  const overlayOpen = $derived(
    !!previewPageId || !!pwPrompt || showWatermarkDialog || showStampDialog || showAlternateDialog ||
      showInspectDialog || showClearConfirm || showExportDialog || showSplitDialog || workspaceFailed
  );
  // The progress overlay blocks the mouse while an export runs; edits by
  // keyboard wait for it too, and for the workspace to be on screen at all.
  const keyboardBlocked = $derived(overlayOpen || exporting || (hasDocuments && !workspaceReady));

  function handleKeydown(e: KeyboardEvent) {
    // A key pressed inside a dialog belongs to it — whichever dialog, including
    // ones added later, with no flag to keep in sync. This runs after the
    // dialog's own handler, so it also swallows the Escape that just closed it
    // (which used to fall through and clear the grid selection too).
    if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="alertdialog"]')) return;
    // Focus can sit outside an open Export/Split card; Escape still closes it.
    if (e.key === 'Escape' && (showExportDialog || showSplitDialog)) {
      showExportDialog = false;
      showSplitDialog = false;
      return;
    }
    if (keyboardBlocked) return;
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
      clearSelection();
    }
  }

  const isFileDrag = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

  // Accept every file drag on the page, so the browser never takes the drop
  // itself: its default opens the file in this tab, replacing the app and every
  // open document (a drop just outside the empty state's box did exactly that).
  function handleWindowDragOver(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (hasDocuments && !overlayOpen) windowDragOver = true;
  }

  function handleWindowDragLeave(e: DragEvent) {
    // relatedTarget is null only when the pointer actually leaves the window;
    // child element transitions would otherwise flicker the overlay off.
    if (e.relatedTarget === null) windowDragOver = false;
  }

  function handleWindowDrop(e: DragEvent) {
    if (!isFileDrag(e)) return;
    // A drop zone inside a dialog (the watermark's image box) or the empty
    // state's own box already took this file: it must not ALSO become pages.
    const taken = e.defaultPrevented;
    e.preventDefault();
    windowDragOver = false;
    // While a password prompt is up the drop still counts: it queues behind the
    // file being unlocked. Any other open dialog owns the screen.
    if (taken || (overlayOpen && !pwPrompt)) return;
    if (e.dataTransfer?.files.length) handleFiles(Array.from(e.dataTransfer.files));
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
    {#await openWorkspace()}
      <WorkspacePending pageCount={pages.length} />
    {:then { Toolbar, PageGrid, StatusBar }}
      <Toolbar
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        {exporting}
        {selectedCount}
        pageCount={pages.length}
        watermarkActive={watermark !== null}
        stampActive={stamp !== null}
        flattenActive={flattenForms}
        {alternateEligible}
        onundo={undo}
        onredo={redo}
        onexport={openExportDialog}
        onsplit={openSplitDialog}
        onaddfile={handleAddFile}
        onalternate={() => (showAlternateDialog = true)}
        onwatermark={() => (showWatermarkDialog = true)}
        onextractimages={handleExtractImages}
        onextracttext={handleExtractText}
        oninspect={() => (showInspectDialog = true)}
        onstamp={() => (showStampDialog = true)}
        onflatten={() => setFlattenForms(!flattenForms)}
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
        onduplicate={duplicatePages}
        onreverse={reversePages}
        ondelete={deletePages}
        onclear={() => (showClearConfirm = true)}
      />
    {:catch}
      <!-- Only reachable before the first successful load (the modules stay in
           memory for the rest of the session). No Dismiss: an empty drop zone
           would only fail the same way on the next open, because the browser
           keeps the failed chunk until a reload. So the files stay until the user
           chooses Reload, and a stray backdrop click no longer clears them. -->
      <ChunkLoadError feature="the workspace" />
    {/await}
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
    <footer class="drop-footer">KeMeK Network &copy; {new Date().getFullYear()} | PDF Lab v{__APP_VERSION__} | License: MIT</footer>
  {/if}

  <ExportDialog
    visible={showExportDialog}
    pageCount={pages.length}
    bind:filename={exportFilename}
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
    {#await import('#lib/components/PagePreviewModal.svelte') then { default: PagePreviewModal }}
      <PagePreviewModal
        pageId={previewPageId}
        onclose={() => (previewPageId = null)}
      />
    {:catch}
      <!-- Chunk fetch failed: reset previewPageId so grid shortcuts (suppressed
           while a preview is "open") come back when the user dismisses. -->
      <ChunkLoadError feature="the editor" onclose={() => (previewPageId = null)} />
    {/await}
  {/if}

  {#if showWatermarkDialog}
    {#await import('#lib/components/WatermarkDialog.svelte') then { default: WatermarkDialog }}
      <WatermarkDialog onclose={() => (showWatermarkDialog = false)} />
    {:catch}
      <ChunkLoadError feature="the watermark panel" onclose={() => (showWatermarkDialog = false)} />
    {/await}
  {/if}

  {#if showStampDialog}
    {#await import('#lib/components/StampDialog.svelte') then { default: StampDialog }}
      <StampDialog onclose={() => (showStampDialog = false)} />
    {:catch}
      <ChunkLoadError feature="the page-number panel" onclose={() => (showStampDialog = false)} />
    {/await}
  {/if}

  {#if showInspectDialog}
    {#await import('#lib/components/InspectDialog.svelte') then { default: InspectDialog }}
      <InspectDialog onclose={() => (showInspectDialog = false)} />
    {:catch}
      <ChunkLoadError feature="the inspector" onclose={() => (showInspectDialog = false)} />
    {/await}
  {/if}

  {#if showAlternateDialog}
    {#await import('#lib/components/AlternateDialog.svelte') then { default: AlternateDialog }}
      <AlternateDialog onclose={() => (showAlternateDialog = false)} />
    {:catch}
      <ChunkLoadError feature="the alternate panel" onclose={() => (showAlternateDialog = false)} />
    {/await}
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
