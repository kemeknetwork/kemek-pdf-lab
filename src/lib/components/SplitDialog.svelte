<script lang="ts">
  import { trapTab } from '$lib/utils/focus-trap.js';

  interface Props {
    visible: boolean;
    pageCount: number;
    selectedCount: number;
    filename: string;
    onconfirm: (result: { mode: 'each' | 'chunk' | 'selected'; size: number; filename: string }) => void;
    oncancel: () => void;
  }

  let { visible, pageCount, selectedCount, filename = $bindable(), onconfirm, oncancel }: Props = $props();

  let mode = $state<'each' | 'chunk' | 'selected'>('each');
  let size = $state(2);
  let inputEl = $state<HTMLInputElement | null>(null);
  let cardEl = $state<HTMLDivElement | null>(null);
  let lastFocused: HTMLElement | null = null;
  const dialogId = $props.id();

  $effect(() => {
    if (visible) {
      // 'selected' mode is only meaningful with a selection; otherwise default
      // to the headline "each page" split.
      if (mode === 'selected' && selectedCount === 0) mode = 'each';
      const active = document.activeElement;
      lastFocused = active instanceof HTMLElement ? active : null;
      requestAnimationFrame(() => inputEl?.select());
    } else if (lastFocused) {
      const toRestore = lastFocused;
      lastFocused = null;
      requestAnimationFrame(() => toRestore.focus());
    }
  });

  const safeSize = $derived(Math.max(1, Math.floor(size) || 1));
  const fileCount = $derived(
    mode === 'selected' ? 1 : mode === 'each' ? pageCount : Math.ceil(pageCount / safeSize)
  );
  const outputHint = $derived(
    mode === 'selected'
      ? `→ 1 PDF (${selectedCount} page${selectedCount === 1 ? '' : 's'})`
      : `→ ${fileCount} file${fileCount === 1 ? '' : 's'} in a .zip`
  );

  function confirm() {
    onconfirm({ mode, size: safeSize, filename: filename.trim() || 'document' });
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog-overlay" onclick={oncancel}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      class="dialog-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="split-title-{dialogId}"
      bind:this={cardEl}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') oncancel(); trapTab(e, cardEl); }}
    >
      <h3 class="dialog-title" id="split-title-{dialogId}">Split</h3>

      <div class="modes" role="radiogroup" aria-label="Split mode">
        <label class="mode" class:checked={mode === 'each'}>
          <input type="radio" name="split-mode-{dialogId}" value="each" bind:group={mode} />
          <span class="mode-text">
            <span class="mode-label">Each page as a separate file</span>
            <span class="mode-sub">{pageCount} page{pageCount === 1 ? '' : 's'} → {pageCount} PDFs</span>
          </span>
        </label>

        <label class="mode" class:checked={mode === 'chunk'}>
          <input type="radio" name="split-mode-{dialogId}" value="chunk" bind:group={mode} />
          <span class="mode-text">
            <span class="mode-label">
              Every
              <input
                class="chunk-input"
                type="number"
                min="1"
                max={Math.max(1, pageCount)}
                bind:value={size}
                onfocus={() => (mode = 'chunk')}
                aria-label="Pages per file"
              />
              pages
            </span>
            <span class="mode-sub">a file every {safeSize} page{safeSize === 1 ? '' : 's'}</span>
          </span>
        </label>

        {#if selectedCount > 0}
          <label class="mode" class:checked={mode === 'selected'}>
            <input type="radio" name="split-mode-{dialogId}" value="selected" bind:group={mode} />
            <span class="mode-text">
              <span class="mode-label">Selected pages as one PDF</span>
              <span class="mode-sub">extract {selectedCount} selected page{selectedCount === 1 ? '' : 's'}</span>
            </span>
          </label>
        {/if}
      </div>

      <label class="dialog-label" for="split-name-{dialogId}">Filename</label>
      <div class="dialog-input-row">
        <input
          id="split-name-{dialogId}"
          class="dialog-input"
          type="text"
          bind:value={filename}
          bind:this={inputEl}
          onkeydown={(e) => { if (e.key === 'Enter') confirm(); }}
          spellcheck="false"
        />
        <span class="dialog-ext">{mode === 'selected' ? '.pdf' : '.zip'}</span>
      </div>

      <p class="output-hint">{outputHint}</p>

      <div class="dialog-actions">
        <button class="dialog-btn cancel" onclick={oncancel}>Cancel</button>
        <button class="dialog-btn confirm" onclick={confirm} disabled={pageCount === 0}>Split</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: var(--pdf-lab-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
    animation: fadeIn 0.12s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog-card {
    background: var(--pdf-lab-surface);
    border-radius: 12px;
    padding: 1.5rem;
    width: min(440px, 100%);
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .dialog-title {
    margin: 0 0 1rem;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .modes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .mode {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .mode:hover {
    border-color: var(--pdf-lab-border-strong);
    background: var(--pdf-lab-surface-hover);
  }
  .mode.checked {
    border-color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
  }

  .mode input[type='radio'] {
    margin-top: 0.1875rem;
    accent-color: var(--pdf-lab-primary);
    flex: 0 0 auto;
  }

  .mode-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }
  .mode-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--pdf-lab-text);
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .mode-sub {
    font-size: 0.75rem;
    color: var(--pdf-lab-text-tertiary);
  }

  .chunk-input {
    width: 3.25rem;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 5px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.8125rem;
    font-family: var(--pdf-lab-font);
    text-align: center;
  }
  .chunk-input:focus {
    outline: none;
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 2px var(--pdf-lab-primary-glow);
  }

  .dialog-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--pdf-lab-text-secondary);
    margin-bottom: 0.375rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .dialog-input-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }
  .dialog-input-row:focus-within {
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 3px var(--pdf-lab-primary-glow);
  }

  .dialog-input {
    flex: 1;
    padding: 0.5rem 0.625rem;
    border: none;
    background: transparent;
    color: var(--pdf-lab-text);
    font-size: 0.875rem;
    font-family: var(--pdf-lab-font);
    outline: none;
  }
  .dialog-ext {
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--pdf-lab-text-tertiary);
    background: var(--pdf-lab-surface-hover);
    border-left: 1px solid var(--pdf-lab-border);
    user-select: none;
    font-variant-numeric: tabular-nums;
  }

  .output-hint {
    margin: 0.75rem 0 0;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--pdf-lab-primary);
    font-variant-numeric: tabular-nums;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }

  .dialog-btn {
    padding: 0.4375rem 0.875rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .dialog-btn.cancel {
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    border: 1px solid var(--pdf-lab-border);
  }
  .dialog-btn.cancel:hover {
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border-strong);
  }
  .dialog-btn.confirm {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border: 1px solid var(--pdf-lab-primary);
    box-shadow: var(--pdf-lab-shadow-sm);
  }
  .dialog-btn.confirm:hover:not(:disabled) {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }
  .dialog-btn.confirm:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .dialog-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-overlay,
    .dialog-card {
      animation: none;
    }
  }
</style>
