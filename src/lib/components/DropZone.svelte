<script lang="ts">
  import { FileUp } from 'lucide-svelte';

  interface Props {
    onfiles: (files: File[]) => void;
  }

  let { onfiles }: Props = $props();

  let dragOver = $state(false);
  let errorMessage = $state('');

  const MAX_SIZE = 200 * 1024 * 1024; // 200MB
  const WARN_SIZE = 100 * 1024 * 1024; // 100MB

  function isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  async function validateMagicBytes(file: File): Promise<boolean> {
    const buffer = await file.slice(0, 5).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // %PDF-
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
        // Still allow it, just warn
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
    <div class="drop-icon">
      <FileUp size={48} strokeWidth={1.5} />
    </div>
    <h2 class="drop-title">Drop PDFs here</h2>
    <p class="drop-subtitle">or click the button below to browse</p>
    <button class="drop-button" onclick={handleClick}>
      <FileUp size={18} />
      Choose PDF files
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
    margin: 2rem;
    border: 2px dashed var(--pdf-lab-border);
    border-radius: 12px;
    background: var(--pdf-lab-surface);
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .drop-zone.drag-over {
    border-color: var(--pdf-lab-primary);
    background: var(--pdf-lab-selection-bg);
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem;
  }

  .drop-icon {
    color: var(--pdf-lab-text-secondary);
    margin-bottom: 0.5rem;
  }

  .drag-over .drop-icon {
    color: var(--pdf-lab-primary);
  }

  .drop-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--pdf-lab-text);
    margin: 0;
  }

  .drop-subtitle {
    color: var(--pdf-lab-text-secondary);
    margin: 0;
    font-size: 0.9rem;
  }

  .drop-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    background: var(--pdf-lab-primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    margin-top: 0.5rem;
    transition: background 0.15s ease;
  }

  .drop-button:hover {
    background: var(--pdf-lab-primary-hover);
  }

  .drop-error {
    color: var(--pdf-lab-danger);
    font-size: 0.85rem;
    margin: 0;
    margin-top: 0.5rem;
  }
</style>
