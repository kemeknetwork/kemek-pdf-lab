<script lang="ts">
  let visible = $state(false);
  let closeBtnEl = $state<HTMLButtonElement | null>(null);

  function isTextInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target instanceof HTMLInputElement) return true;
    if (target instanceof HTMLTextAreaElement) return true;
    return target.isContentEditable;
  }

  // Capture phase so we pre-empt the page-level <svelte:window> handler:
  // when help is open we eat every key (so R/Delete/Ctrl-Z don't fall
  // through), and on Esc we close the modal without also clearing the
  // grid selection underneath.
  function onKeydownCapture(e: KeyboardEvent) {
    if (visible) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopImmediatePropagation();
        visible = false;
      } else {
        e.stopImmediatePropagation();
      }
      return;
    }
    if (isTextInput(e.target)) return;
    if (e.key === '?') {
      e.preventDefault();
      visible = true;
    }
  }

  $effect(() => {
    window.addEventListener('keydown', onKeydownCapture, { capture: true });
    return () => window.removeEventListener('keydown', onKeydownCapture, true);
  });

  $effect(() => {
    if (visible) requestAnimationFrame(() => closeBtnEl?.focus());
  });
</script>

<button
  class="kb-fab"
  type="button"
  aria-label="Show keyboard shortcuts"
  title="Keyboard shortcuts (?)"
  onclick={() => (visible = true)}
>
  ?
</button>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="kb-overlay" onclick={() => (visible = false)}>
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      class="kb-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-title"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="kb-head">
        <h3 class="kb-title" id="kb-title">Keyboard shortcuts</h3>
        <button
          class="kb-close"
          type="button"
          aria-label="Close"
          bind:this={closeBtnEl}
          onclick={() => (visible = false)}
        >
          ×
        </button>
      </div>

      <dl class="kb-list">
        <div class="kb-row">
          <dt><kbd>?</kbd></dt>
          <dd>Show this help</dd>
        </div>
        <div class="kb-row">
          <dt><kbd>Esc</kbd></dt>
          <dd>Close dialog or clear selection</dd>
        </div>
        <div class="kb-section">Selection</div>
        <div class="kb-row">
          <dt>Click</dt>
          <dd>Toggle page selection</dd>
        </div>
        <div class="kb-row">
          <dt><kbd>Shift</kbd>+Click</dt>
          <dd>Select range from last clicked page</dd>
        </div>
        <div class="kb-row">
          <dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>A</kbd></dt>
          <dd>Select all pages</dd>
        </div>
        <div class="kb-section">Edit</div>
        <div class="kb-row">
          <dt><kbd>R</kbd></dt>
          <dd>Rotate selected pages clockwise</dd>
        </div>
        <div class="kb-row">
          <dt><kbd>Delete</kbd> or <kbd>Backspace</kbd></dt>
          <dd>Delete selected pages</dd>
        </div>
        <div class="kb-row">
          <dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd></dt>
          <dd>Undo</dd>
        </div>
        <div class="kb-row">
          <dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dt>
          <dd>Redo</dd>
        </div>
      </dl>
    </div>
  </div>
{/if}

<style>
  .kb-fab {
    position: fixed;
    right: 0.875rem;
    bottom: 0.875rem;
    width: 2rem;
    height: 2rem;
    border-radius: 9999px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-secondary);
    border: 1px solid var(--pdf-lab-border);
    box-shadow: var(--pdf-lab-shadow-sm);
    font-family: var(--pdf-lab-font);
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: all 0.12s ease;
    z-index: 40;
  }

  .kb-fab:hover {
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border-strong);
    box-shadow: var(--pdf-lab-shadow-md);
  }

  .kb-fab:active {
    transform: scale(0.95);
  }

  .kb-overlay {
    position: fixed;
    inset: 0;
    background: var(--pdf-lab-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: kbFade 0.12s ease-out;
  }

  @keyframes kbFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .kb-card {
    background: var(--pdf-lab-surface);
    border-radius: 12px;
    padding: 1.25rem 1.5rem 1.5rem;
    min-width: 360px;
    max-width: min(480px, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: kbPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes kbPop {
    from { transform: scale(0.96); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .kb-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .kb-title {
    margin: 0;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .kb-close {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    border: 1px solid transparent;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .kb-close:hover {
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border);
  }

  .kb-list {
    margin: 0;
    display: grid;
    gap: 0.4rem;
  }

  .kb-section {
    margin-top: 0.6rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--pdf-lab-text-tertiary);
  }

  .kb-section:first-child {
    margin-top: 0;
  }

  .kb-row {
    display: grid;
    grid-template-columns: minmax(9rem, auto) 1fr;
    gap: 1rem;
    align-items: center;
    font-size: 0.8125rem;
  }

  .kb-row dt {
    color: var(--pdf-lab-text-secondary);
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    align-items: center;
  }

  .kb-row dd {
    margin: 0;
    color: var(--pdf-lab-text);
  }

  kbd {
    display: inline-block;
    padding: 0.05rem 0.35rem;
    background: var(--pdf-lab-surface-hover);
    border: 1px solid var(--pdf-lab-border);
    border-bottom-width: 2px;
    border-radius: 4px;
    font-family: var(--pdf-lab-font);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--pdf-lab-text);
    line-height: 1.2;
  }
</style>
