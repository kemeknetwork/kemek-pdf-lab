<script lang="ts">
  interface Props {
    filename: string;
    error: string | null;
    visible: boolean;
    onconfirm: (password: string) => void;
    oncancel: () => void;
  }

  let { filename, error, visible, onconfirm, oncancel }: Props = $props();

  let password = $state('');
  let reveal = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);
  let cardEl = $state<HTMLDivElement | null>(null);
  let lastFocused: HTMLElement | null = null;
  const dialogId = Math.random().toString(36).slice(2, 10);

  // Reset + focus on each open (incl. a wrong-password re-prompt). Restore the
  // pre-open focus owner on close — the shared focus-restore pattern across the
  // app's dialogs.
  $effect(() => {
    if (visible) {
      password = '';
      reveal = false;
      const active = document.activeElement;
      lastFocused = active instanceof HTMLElement ? active : null;
      requestAnimationFrame(() => inputEl?.focus());
    } else {
      // Drop the entered secret the moment the dialog closes — don't let it
      // linger in component state until the next unlock.
      password = '';
      reveal = false;
      if (lastFocused) {
        const toRestore = lastFocused;
        lastFocused = null;
        requestAnimationFrame(() => toRestore.focus());
      }
    }
  });

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
    if (password) onconfirm(password);
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
      aria-labelledby="pw-title-{dialogId}"
      bind:this={cardEl}
      onclick={(e) => e.stopPropagation()}
      onkeydown={trapTab}
    >
      <div class="dialog-head">
        <span class="lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <div class="head-text">
          <h3 class="dialog-title" id="pw-title-{dialogId}">Unlock PDF</h3>
          <p class="dialog-file" title={filename}>{filename}</p>
        </div>
      </div>

      <label class="dialog-label" for="pw-input-{dialogId}">Password</label>
      <div class="dialog-input-row" class:error={!!error}>
        <input
          id="pw-input-{dialogId}"
          class="dialog-input"
          type={reveal ? 'text' : 'password'}
          bind:value={password}
          bind:this={inputEl}
          onkeydown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') oncancel(); }}
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
        />
        <button
          type="button"
          class="reveal"
          aria-label={reveal ? 'Hide password' : 'Show password'}
          aria-pressed={reveal}
          onclick={() => (reveal = !reveal)}
        >{reveal ? 'Hide' : 'Show'}</button>
      </div>

      {#if error}
        <p class="dialog-error" role="alert">{error}</p>
      {/if}

      <p class="dialog-note">
        Decrypted on your device — the password never leaves your browser.
      </p>

      <div class="dialog-actions">
        <button class="dialog-btn cancel" onclick={oncancel}>Cancel</button>
        <button class="dialog-btn confirm" onclick={confirm} disabled={!password}>Unlock</button>
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
    min-width: 360px;
    max-width: 420px;
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .dialog-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .lock {
    flex: 0 0 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--pdf-lab-primary-glow);
    color: var(--pdf-lab-primary);
  }
  .lock svg { width: 20px; height: 20px; }

  .head-text { min-width: 0; }

  .dialog-title {
    margin: 0;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .dialog-file {
    margin: 0.125rem 0 0;
    font-size: 0.8125rem;
    color: var(--pdf-lab-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dialog-input-row:focus-within {
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 3px var(--pdf-lab-primary-glow);
  }

  .dialog-input-row.error {
    border-color: var(--pdf-lab-danger, #c53030);
  }
  .dialog-input-row.error:focus-within {
    box-shadow: 0 0 0 3px rgba(197, 48, 48, 0.18);
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
    letter-spacing: 0.02em;
  }

  .reveal {
    padding: 0.5rem 0.625rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--pdf-lab-text-tertiary);
    background: var(--pdf-lab-surface-hover);
    border: none;
    border-left: 1px solid var(--pdf-lab-border);
    cursor: pointer;
    transition: color 0.12s ease;
  }
  .reveal:hover { color: var(--pdf-lab-text); }

  .dialog-error {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--pdf-lab-danger, #c53030);
  }

  .dialog-note {
    margin: 0.875rem 0 0;
    font-size: 0.6875rem;
    line-height: 1.4;
    color: var(--pdf-lab-text-tertiary);
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
