<script lang="ts">
  import { Undo2, Redo2, Download, Plus } from 'lucide-svelte';

  interface Props {
    canUndo: boolean;
    canRedo: boolean;
    exporting: boolean;
    onundo: () => void;
    onredo: () => void;
    onexport: () => void;
    onaddfile: () => void;
  }

  let { canUndo, canRedo, exporting, onundo, onredo, onexport, onaddfile }: Props = $props();
</script>

<header class="toolbar">
  <div class="toolbar-left">
    <h1 class="toolbar-title">KeMeK PDF Lab</h1>
  </div>

  <div class="toolbar-actions">
    <button
      class="toolbar-btn"
      disabled={!canUndo}
      onclick={onundo}
      title="Undo (Ctrl+Z)"
    >
      <Undo2 size={18} />
    </button>
    <button
      class="toolbar-btn"
      disabled={!canRedo}
      onclick={onredo}
      title="Redo (Ctrl+Shift+Z)"
    >
      <Redo2 size={18} />
    </button>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn" onclick={onaddfile} title="Add PDF file">
      <Plus size={18} />
      <span>Add File</span>
    </button>

    <button
      class="toolbar-btn primary"
      disabled={exporting}
      onclick={onexport}
      title="Export merged PDF"
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
    padding: 0.625rem 1rem;
    background: var(--pdf-lab-surface);
    border-bottom: 1px solid var(--pdf-lab-border);
    flex-shrink: 0;
  }

  .toolbar-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.625rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: var(--pdf-lab-surface-hover);
  }

  .toolbar-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .toolbar-btn.primary {
    background: var(--pdf-lab-primary);
    color: white;
    border-color: var(--pdf-lab-primary);
  }

  .toolbar-btn.primary:hover:not(:disabled) {
    background: var(--pdf-lab-primary-hover);
  }

  .toolbar-divider {
    width: 1px;
    height: 24px;
    background: var(--pdf-lab-border);
    margin: 0 0.25rem;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
  }
</style>
