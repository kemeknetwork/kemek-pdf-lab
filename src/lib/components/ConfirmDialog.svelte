<script lang="ts">
  import { trapTab } from '$lib/utils/focus-trap';

  interface Props {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { visible, title, message, confirmLabel, danger = false, onconfirm, oncancel }: Props = $props();

  let confirmEl = $state<HTMLButtonElement | null>(null);
  let cancelEl = $state<HTMLButtonElement | null>(null);
  let cardEl = $state<HTMLDivElement | null>(null);
  let lastFocused: HTMLElement | null = null;
  const dialogId = $props.id();

  $effect(() => {
    if (visible) {
      const active = document.activeElement;
      lastFocused = active instanceof HTMLElement ? active : null;
      // A destructive confirm must not be one Enter away: start on Cancel.
      requestAnimationFrame(() => (danger ? cancelEl : confirmEl)?.focus());
    } else if (lastFocused) {
      const toRestore = lastFocused;
      lastFocused = null;
      requestAnimationFrame(() => toRestore.focus());
    }
  });
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog-overlay" onclick={oncancel}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dialog-card"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title-{dialogId}"
      aria-describedby="confirm-msg-{dialogId}"
      tabindex="-1"
      bind:this={cardEl}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === 'Escape') oncancel();
        else trapTab(e, cardEl);
      }}
    >
      <h3 class="dialog-title" id="confirm-title-{dialogId}">{title}</h3>
      <p class="dialog-message" id="confirm-msg-{dialogId}">{message}</p>
      <div class="dialog-actions">
        <button class="dialog-btn cancel" bind:this={cancelEl} onclick={oncancel}>Cancel</button>
        <button
          class="dialog-btn confirm"
          class:danger
          bind:this={confirmEl}
          onclick={onconfirm}
        >{confirmLabel}</button>
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
    width: min(400px, 100%);
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .dialog-title {
    margin: 0 0 0.5rem;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .dialog-message {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--pdf-lab-text-secondary);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;
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
  .dialog-btn.confirm.danger {
    background: var(--pdf-lab-danger, #c53030);
    border-color: var(--pdf-lab-danger, #c53030);
    color: #fff;
  }
  .dialog-btn.confirm.danger:hover {
    filter: brightness(1.08);
  }

  .dialog-btn:active {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-overlay,
    .dialog-card {
      animation: none;
    }
  }
</style>
