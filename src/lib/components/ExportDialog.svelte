<script lang="ts">
  import { trapTab } from '#lib/utils/focus-trap.js';

  interface Props {
    visible: boolean;
    pageCount: number;
    filename: string;
    onconfirm: (result: { format: 'pdf' | 'png' | 'jpeg'; filename: string }) => void;
    oncancel: () => void;
  }

  let { visible, pageCount, filename = $bindable(), onconfirm, oncancel }: Props = $props();

  let format = $state<'pdf' | 'png' | 'jpeg'>('pdf');
  let inputEl = $state<HTMLInputElement | null>(null);
  let cardEl = $state<HTMLDivElement | null>(null);
  let lastFocused: HTMLElement | null = null;
  const dialogId = $props.id();

  $effect(() => {
    if (visible) {
      const active = document.activeElement;
      lastFocused = active instanceof HTMLElement ? active : null;
      requestAnimationFrame(() => inputEl?.select());
    } else if (lastFocused) {
      const toRestore = lastFocused;
      lastFocused = null;
      requestAnimationFrame(() => toRestore.focus());
    }
  });

  const ext = $derived(format === 'pdf' ? '.pdf' : pageCount > 1 ? '.zip' : format === 'png' ? '.png' : '.jpg');
  const outputHint = $derived(
    format === 'pdf'
      ? `→ 1 PDF (${pageCount} page${pageCount === 1 ? '' : 's'})`
      : pageCount > 1
        ? `→ ${pageCount} ${format.toUpperCase()} images in a .zip`
        : `→ 1 ${format.toUpperCase()} image`
  );

  const formats: { value: 'pdf' | 'png' | 'jpeg'; label: string; sub: string }[] = [
    { value: 'pdf', label: 'PDF document', sub: 'One merged file' },
    { value: 'png', label: 'PNG images', sub: 'One image per page · lossless' },
    { value: 'jpeg', label: 'JPEG images', sub: 'One image per page · smaller' }
  ];

  function confirm() {
    onconfirm({ format, filename: filename.trim() || 'document' });
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
      aria-labelledby="export-title-{dialogId}"
      bind:this={cardEl}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') oncancel(); trapTab(e, cardEl); }}
    >
      <h3 class="dialog-title" id="export-title-{dialogId}">Export</h3>

      <div class="modes" role="radiogroup" aria-label="Export format">
        {#each formats as f (f.value)}
          <label class="mode" class:checked={format === f.value}>
            <input type="radio" name="export-format-{dialogId}" value={f.value} bind:group={format} />
            <span class="mode-text">
              <span class="mode-label">{f.label}</span>
              <span class="mode-sub">{f.sub}</span>
            </span>
          </label>
        {/each}
      </div>

      <label class="dialog-label" for="export-name-{dialogId}">Filename</label>
      <div class="dialog-input-row">
        <input
          id="export-name-{dialogId}"
          class="dialog-input"
          type="text"
          bind:value={filename}
          bind:this={inputEl}
          onkeydown={(e) => { if (e.key === 'Enter') confirm(); }}
          spellcheck="false"
        />
        <span class="dialog-ext">{ext}</span>
      </div>

      <p class="output-hint">{outputHint}</p>

      <div class="dialog-actions">
        <button class="dialog-btn cancel" onclick={oncancel}>Cancel</button>
        <button class="dialog-btn confirm" onclick={confirm} disabled={pageCount === 0}>Export</button>
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
  }
  .mode-sub {
    font-size: 0.75rem;
    color: var(--pdf-lab-text-tertiary);
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
    border: 1px solid var(--pdf-lab-border-input);
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
    min-width: 2.75rem;
    text-align: center;
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
