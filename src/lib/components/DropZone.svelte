<!--
  DropZone — landing screen for importing PDFs.

  Shown when no documents are loaded. Accepts files via drag-and-drop or a
  native file picker. Validates file type (MIME + magic bytes) and size before
  forwarding to the parent.

  @prop onfiles — callback receiving validated File[] to load into the workspace.
-->
<script lang="ts">
  interface Props {
    onfiles: (files: File[]) => void;
  }

  let { onfiles }: Props = $props();

  let dragOver = $state(false);
  let errorMessage = $state('');

  /** Hard block — files above this are rejected outright. */
  const MAX_SIZE = 200 * 1024 * 1024;
  /** Soft warning — file processes but user sees a notice. */
  const WARN_SIZE = 100 * 1024 * 1024;

  function isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  /** Check the first 5 bytes for the %PDF- magic header. */
  async function validateMagicBytes(file: File): Promise<boolean> {
    const buffer = await file.slice(0, 5).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  }

  async function processFiles(fileList: FileList | File[]) {
    errorMessage = '';
    const files = Array.from(fileList);
    const validFiles: File[] = [];

    for (const file of files) {
      if (!isPdf(file)) {
        errorMessage = `"${file.name}" is not a PDF file.`;
        continue;
      }
      if (file.size > MAX_SIZE) {
        errorMessage = `"${file.name}" exceeds the 200MB size limit.`;
        continue;
      }
      const valid = await validateMagicBytes(file);
      if (!valid) {
        errorMessage = `"${file.name}" does not appear to be a valid PDF.`;
        continue;
      }
      if (file.size > WARN_SIZE) {
        errorMessage = `Warning: "${file.name}" is large (${Math.round(file.size / 1024 / 1024)}MB) and may be slow to process.`;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onfiles(validFiles);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) {
      processFiles(e.dataTransfer.files);
    }
  }

  function handleClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.multiple = true;
    input.onchange = () => {
      if (input.files) processFiles(input.files);
    };
    input.click();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="drop-zone"
  class:drag-over={dragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="drop-content">
    <div class="drop-icon" class:active={dragOver}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <rect x="8" y="4" width="32" height="42" rx="3" stroke="currentColor" stroke-width="1.75" opacity="0.25"/>
        <rect x="16" y="10" width="32" height="42" rx="3" fill="var(--pdf-lab-surface)" stroke="currentColor" stroke-width="1.75"/>
        <line x1="24" y1="24" x2="40" y2="24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
        <line x1="24" y1="30" x2="36" y2="30" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
        <line x1="24" y1="36" x2="38" y2="36" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.2"/>
      </svg>
    </div>

    <div class="drop-text">
      <h2 class="drop-title">Drop PDF files here</h2>
      <p class="drop-subtitle">Merge, reorder, and rotate pages — everything runs locally in your browser</p>
    </div>

    <button class="drop-button" onclick={handleClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Browse files
    </button>

    {#if errorMessage}
      <p class="drop-error">{errorMessage}</p>
    {/if}
  </div>
</div>

<style>
  .drop-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    margin: 0 1.5rem 0.5rem;
    border: 2px dashed var(--pdf-lab-border-strong);
    border-radius: 12px;
    background:
      radial-gradient(circle at 1px 1px, var(--pdf-lab-grid-dot) 1px, transparent 0) 0 0 / 24px 24px,
      var(--pdf-lab-surface);
    transition: all 0.25s ease;
    cursor: pointer;
    position: relative;
  }

  .drop-zone::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 10px;
    background: var(--pdf-lab-primary-soft);
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
  }

  .drop-zone.drag-over {
    border-color: var(--pdf-lab-primary);
    border-style: solid;
  }

  .drop-zone.drag-over::before {
    opacity: 1;
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 3rem 2rem;
    position: relative;
    z-index: 1;
  }

  .drop-icon {
    color: var(--pdf-lab-text-tertiary);
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .drop-icon.active {
    color: var(--pdf-lab-primary);
    transform: scale(1.1) translateY(-4px);
  }

  .drop-text {
    text-align: center;
  }

  .drop-title {
    font-family: var(--pdf-lab-font-display);
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
    margin: 0 0 0.375rem;
    letter-spacing: -0.02em;
  }

  .drop-subtitle {
    color: var(--pdf-lab-text-secondary);
    margin: 0;
    font-size: 0.875rem;
    max-width: 320px;
    line-height: 1.5;
  }

  .drop-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.375rem;
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(21, 128, 61, 0.25);
  }

  .drop-button:hover {
    background: var(--pdf-lab-primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(21, 128, 61, 0.3);
  }

  .drop-button:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(21, 128, 61, 0.2);
  }

  .drop-error {
    color: var(--pdf-lab-danger);
    font-size: 0.8125rem;
    margin: 0;
    font-weight: 500;
  }
</style>
