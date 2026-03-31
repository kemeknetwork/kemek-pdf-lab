<!--
  Toolbar — top bar shown when documents are loaded.

  Contains the brand mark, theme toggle, undo/redo, add-file, and export
  controls. Undo/redo are grouped with joined border-radius.

  @prop canUndo / canRedo — enable the history buttons.
  @prop exporting — disables export while a merge is in progress.
  @prop onundo / onredo / onexport / onaddfile — action callbacks.
-->
<script lang="ts">
  import { Undo2, Redo2, Download, Plus, Scissors } from 'lucide-svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  interface Props {
    canUndo: boolean;
    canRedo: boolean;
    exporting: boolean;
    selectedCount: number;
    onundo: () => void;
    onredo: () => void;
    onexport: () => void;
    onsplit: () => void;
    onaddfile: () => void;
  }

  let { canUndo, canRedo, exporting, selectedCount, onundo, onredo, onexport, onsplit, onaddfile }: Props = $props();
</script>

<header class="toolbar">
  <div class="toolbar-left">
    <div class="toolbar-logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
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
        <Undo2 size={16} />
      </button>
      <button
        class="toolbar-btn icon-only"
        disabled={!canRedo}
        onclick={onredo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={16} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn" onclick={onaddfile} title="Add PDF file">
      <Plus size={16} />
      <span>Add File</span>
    </button>

    <button
      class="toolbar-btn"
      disabled={selectedCount === 0 || exporting}
      onclick={onsplit}
      title="Export selected pages as separate PDF"
    >
      <Scissors size={16} />
      <span>Split</span>
    </button>

    <button
      class="toolbar-btn primary"
      disabled={exporting}
      onclick={onexport}
      title="Export all pages as merged PDF"
    >
      <Download size={16} />
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
    height: 3rem;
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
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
    margin: 0;
    letter-spacing: -0.01em;
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
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
    height: 2rem;
  }

  .toolbar-btn.icon-only {
    padding: 0.375rem 0.5rem;
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
</style>
