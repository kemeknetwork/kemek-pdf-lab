<script lang="ts">
  interface Props {
    title: string;
    filename: string;
    visible: boolean;
    onconfirm: (filename: string) => void;
    oncancel: () => void;
  }

  let { title, filename = $bindable(), visible, onconfirm, oncancel }: Props = $props();

  let inputEl = $state<HTMLInputElement | null>(null);
  let cardEl = $state<HTMLDivElement | null>(null);
  let lastFocused: HTMLElement | null = null;
  const dialogId = Math.random().toString(36).slice(2, 10);

  // Save the pre-open focus owner so we can return focus on close. The
  // matching restore in the same $effect mirrors KeyboardHelp.svelte.
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

  // Tab cycling within the dialog: without this, Tab from the Confirm
  // button leaks to the toolbar/grid behind, defeating the modal contract.
  function trapTab(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !cardEl) return;
    const focusables = cardEl.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function confirm() {
    onconfirm(filename.trim() || 'document');
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog-overlay" onclick={oncancel}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title-{dialogId}" bind:this={cardEl} onclick={(e) => e.stopPropagation()} onkeydown={trapTab}>
      <h3 class="dialog-title" id="dialog-title-{dialogId}">{title}</h3>
      <label class="dialog-label" for="dialog-filename-{dialogId}">Filename</label>
      <div class="dialog-input-row">
        <input
          id="dialog-filename-{dialogId}"
          class="dialog-input"
          type="text"
          bind:value={filename}
          bind:this={inputEl}
          onkeydown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') oncancel(); }}
          spellcheck="false"
        />
        <span class="dialog-ext">.pdf</span>
      </div>
      <div class="dialog-actions">
        <button class="dialog-btn cancel" onclick={oncancel}>Cancel</button>
        <button class="dialog-btn confirm" onclick={confirm}>{title.split(' ')[0]}</button>
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
    min-width: 340px;
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

  .dialog-btn.confirm:hover {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }

  .dialog-btn:active {
    transform: scale(0.97);
  }
</style>
