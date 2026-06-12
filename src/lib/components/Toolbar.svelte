<script lang="ts">
  import { Undo2, Redo2, Download, Plus, Scissors, Stamp, ImageDown, Hash } from 'lucide-svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  interface Props {
    canUndo: boolean;
    canRedo: boolean;
    exporting: boolean;
    selectedCount: number;
    pageCount: number;
    watermarkActive: boolean;
    stampActive: boolean;
    onundo: () => void;
    onredo: () => void;
    onexport: () => void;
    onsplit: () => void;
    onaddfile: () => void;
    onwatermark: () => void;
    onextractimages: () => void;
    onstamp: () => void;
  }

  let { canUndo, canRedo, exporting, selectedCount, pageCount, watermarkActive, stampActive, onundo, onredo, onexport, onsplit, onaddfile, onwatermark, onextractimages, onstamp }: Props = $props();
</script>

<header class="toolbar">
  <div class="toolbar-left">
    <div class="toolbar-logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <line x1="9" y1="17" x2="13" y2="17"/>
      </svg>
    </div>
    <h1 class="toolbar-title"><span class="title-kemek">KeMeK</span> <span class="title-pdflab">PDF Lab</span></h1>
  </div>

  <div class="toolbar-actions">
    <ThemeToggle />

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button
        class="toolbar-btn icon-only"
        disabled={!canUndo}
        onclick={onundo}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={18} />
      </button>
      <button
        class="toolbar-btn icon-only"
        disabled={!canRedo}
        onclick={onredo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={18} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn" onclick={onaddfile} title="Add PDF file">
      <Plus size={18} />
      <span>Add File</span>
    </button>

    <button
      class="toolbar-btn"
      disabled={pageCount === 0 || exporting}
      onclick={onsplit}
      title="Split into separate files, or extract selected pages"
    >
      <Scissors size={18} />
      <span>Split</span>
    </button>

    <button
      class="toolbar-btn"
      disabled={pageCount === 0 || exporting}
      onclick={onextractimages}
      title="Extract the embedded images from the PDF"
    >
      <ImageDown size={18} />
      <span>Images</span>
    </button>

    <button
      class="toolbar-btn"
      class:active={watermarkActive}
      onclick={onwatermark}
      title={watermarkActive ? 'Watermark active — click to edit' : 'Add a watermark to the export'}
    >
      <Stamp size={18} />
      <span>Watermark</span>
      {#if watermarkActive}<span class="active-dot" aria-hidden="true"></span>{/if}
    </button>

    <button
      class="toolbar-btn"
      class:active={stampActive}
      disabled={pageCount === 0}
      onclick={onstamp}
      title={stampActive ? 'Page numbers active — click to edit' : 'Add page numbers or a header/footer stamp'}
    >
      <Hash size={18} />
      <span>Number</span>
      {#if stampActive}<span class="active-dot" aria-hidden="true"></span>{/if}
    </button>

    <button
      class="toolbar-btn primary"
      disabled={exporting}
      onclick={onexport}
      title="Export all pages as merged PDF"
    >
      <Download size={18} />
      <span>Export</span>
    </button>
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 3.25rem;
    background: var(--pdf-lab-surface);
    border-bottom: 1px solid var(--pdf-lab-border);
    flex-shrink: 0;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-logo {
    color: var(--pdf-lab-primary);
    display: flex;
    align-items: center;
  }

  .toolbar-title {
    font-family: var(--pdf-lab-font-display);
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
    margin: 0;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .title-kemek {
    color: var(--pdf-lab-primary);
  }

  .title-pdflab {
    color: var(--pdf-lab-text);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toolbar-group {
    display: flex;
    gap: 1px;
  }

  .toolbar-group .toolbar-btn {
    border-radius: 0;
  }

  .toolbar-group .toolbar-btn:first-child {
    border-radius: 6px 0 0 6px;
  }

  .toolbar-group .toolbar-btn:last-child {
    border-radius: 0 6px 6px 0;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    padding: 0.4375rem 0.8125rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
    height: 2.25rem;
  }

  .toolbar-btn.icon-only {
    padding: 0.4375rem 0.5625rem;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: var(--pdf-lab-surface-hover);
    border-color: var(--pdf-lab-border-strong);
  }

  .toolbar-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .toolbar-btn:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 1px;
  }

  .toolbar-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .toolbar-btn.active {
    color: var(--pdf-lab-primary);
    border-color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
    position: relative;
  }

  .toolbar-btn.active:hover:not(:disabled) {
    background: var(--pdf-lab-primary-glow);
    border-color: var(--pdf-lab-primary);
  }

  .active-dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--pdf-lab-primary);
    border: 2px solid var(--pdf-lab-surface);
  }

  .toolbar-btn.primary {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border-color: var(--pdf-lab-primary);
    font-weight: 600;
    box-shadow: var(--pdf-lab-shadow-sm);
  }

  .toolbar-btn.primary:hover:not(:disabled) {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }

  .toolbar-divider {
    width: 1px;
    height: 1.25rem;
    background: var(--pdf-lab-border);
    margin: 0 0.375rem;
  }

  /* Below ~820px the single row can't hold the brand + 6 controls, so it
     overflowed (Export clipped, horizontal scroll). Stack it: brand on line 1,
     the nav controls wrapping onto line 2+ — no horizontal overflow. */
  @media (max-width: 820px) {
    .toolbar {
      flex-direction: column;
      align-items: stretch;
      height: auto;
      gap: 0.5rem;
      padding: 0.625rem 0.875rem;
    }

    .toolbar-actions {
      flex-wrap: wrap;
      justify-content: flex-start;
      row-gap: 0.4375rem;
    }
  }
</style>
