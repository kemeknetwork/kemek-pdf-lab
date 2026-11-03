<script lang="ts">
  import { trapTab } from '$lib/utils/focus-trap.js';
  import { getStamp, setStamp } from '$lib/stores/app.svelte.js';
  import type { StampConfig, StampPosition } from '$lib/pdf/types.js';
  import { formatStampText } from '$lib/pdf/stamp.js';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const existing = getStamp();

  let template = $state(existing?.template ?? 'Page {n}');
  let start = $state(existing?.start ?? 1);
  let padWidth = $state(existing?.padWidth ?? 0);
  let position = $state<StampPosition>(existing?.position ?? 'bottom-center');
  let fontSize = $state(existing?.fontSize ?? 10);
  let color = $state(existing?.color ?? '#3f3f46');

  let cardEl = $state<HTMLDivElement | null>(null);
  let lastFocused: HTMLElement | null = null;
  const dialogId = $props.id();

  $effect(() => {
    const active = document.activeElement;
    lastFocused = active instanceof HTMLElement ? active : null;
    return () => requestAnimationFrame(() => lastFocused?.focus());
  });

  // Bottom row first — page numbers live at the foot far more often than the head.
  const ANCHORS: { value: StampPosition; label: string }[][] = [
    [
      { value: 'top-left', label: '↖' },
      { value: 'top-center', label: '↑' },
      { value: 'top-right', label: '↗' }
    ],
    [
      { value: 'bottom-left', label: '↙' },
      { value: 'bottom-center', label: '↓' },
      { value: 'bottom-right', label: '↘' }
    ]
  ];

  const presets: { label: string; template: string; position: StampPosition; pad: number }[] = [
    { label: 'Page N', template: 'Page {n}', position: 'bottom-center', pad: 0 },
    { label: 'N of M', template: 'Page {n} of {total}', position: 'bottom-center', pad: 0 },
    { label: 'Bates', template: 'ABC-{n}', position: 'bottom-right', pad: 6 },
    { label: 'Footer', template: 'CONFIDENTIAL', position: 'bottom-center', pad: 0 }
  ];

  function applyPreset(p: (typeof presets)[number]) {
    template = p.template;
    position = p.position;
    padWidth = p.pad;
  }

  // One normalized config feeds both the preview and the export, and the preview
  // renders through the export's own formatter, so what's shown is what's burned
  // (the hand-rolled preview used the raw inputs: a typed pad width of 1e9 threw
  // inside this $derived, and a start of -3 or 2.5 previewed as typed).
  const config = $derived<StampConfig>({
    template,
    start: Math.max(1, Math.floor(start) || 1),
    padWidth: Math.min(12, Math.max(0, Math.floor(padWidth) || 0)),
    position,
    fontSize: Math.max(4, Math.floor(fontSize) || 10),
    color
  });
  const preview = $derived(formatStampText(config.template, config.start, 12, config.padWidth));

  function apply() {
    if (template.trim() === '') return;
    setStamp({ ...config });
    onclose();
  }

  function remove() {
    setStamp(null);
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    // cardEl was bound but never trapped, so Tab walked out of the modal into
    // the grid behind it.
    trapTab(e, cardEl);
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="dialog-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="stamp-title-{dialogId}"
    tabindex="-1"
    bind:this={cardEl}
    onclick={(e) => e.stopPropagation()}
  >
    <h3 class="dialog-title" id="stamp-title-{dialogId}">Page numbers &amp; stamps</h3>

    <div class="presets">
      {#each presets as p (p.label)}
        <button class="preset" onclick={() => applyPreset(p)}>{p.label}</button>
      {/each}
    </div>

    <label class="dialog-label" for="stamp-template-{dialogId}">Text</label>
    <input
      id="stamp-template-{dialogId}"
      class="dialog-input full"
      type="text"
      bind:value={template}
      spellcheck="false"
    />
    <p class="hint">
      <code>{'{n}'}</code> = page number, <code>{'{total}'}</code> = page count
    </p>

    <div class="row">
      <div class="field">
        <span class="dialog-label">Position</span>
        <div class="anchor-grid" role="radiogroup" aria-label="Position">
          {#each ANCHORS as anchorRow}
            {#each anchorRow as a (a.value)}
              <button
                class="anchor"
                class:checked={position === a.value}
                aria-label={a.value}
                aria-pressed={position === a.value}
                onclick={() => (position = a.value)}>{a.label}</button>
            {/each}
          {/each}
        </div>
      </div>

      <div class="field stack">
        <label class="dialog-label" for="stamp-start-{dialogId}">Start at</label>
        <input id="stamp-start-{dialogId}" class="dialog-input num" type="number" min="0" bind:value={start} />
        <label class="dialog-label" for="stamp-pad-{dialogId}">Zero-pad</label>
        <input id="stamp-pad-{dialogId}" class="dialog-input num" type="number" min="0" max="12" bind:value={padWidth} />
      </div>

      <div class="field stack">
        <label class="dialog-label" for="stamp-size-{dialogId}">Size</label>
        <input id="stamp-size-{dialogId}" class="dialog-input num" type="number" min="4" max="72" bind:value={fontSize} />
        <span class="dialog-label">Color</span>
        <input class="color-input" type="color" bind:value={color} aria-label="Stamp color" />
      </div>
    </div>

    <p class="stamp-preview" style:color>{preview || ' '}</p>

    <div class="dialog-actions">
      <button class="dialog-btn cancel" onclick={onclose}>Cancel</button>
      {#if existing}
        <button class="dialog-btn remove" onclick={remove}>Remove</button>
      {/if}
      <button class="dialog-btn confirm" onclick={apply} disabled={template.trim() === ''}>Apply</button>
    </div>
  </div>
</div>

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
    width: 440px;
    max-width: calc(100vw - 2rem);
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

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }
  .preset {
    padding: 0.3125rem 0.625rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 999px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .preset:hover {
    border-color: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
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

  .dialog-input {
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.875rem;
    font-family: var(--pdf-lab-font);
    padding: 0.5rem 0.625rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .dialog-input:focus {
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 3px var(--pdf-lab-primary-glow);
  }
  .dialog-input.full {
    width: 100%;
    box-sizing: border-box;
  }
  .dialog-input.num {
    width: 100%;
    box-sizing: border-box;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 0.375rem 0 0;
    font-size: 0.6875rem;
    color: var(--pdf-lab-text-tertiary);
  }
  .hint code {
    font-family: ui-monospace, SFMono-Regular, monospace;
    background: var(--pdf-lab-surface-hover);
    padding: 0 3px;
    border-radius: 3px;
    color: var(--pdf-lab-text-secondary);
  }

  .row {
    display: flex;
    gap: 1.25rem;
    margin-top: 1rem;
    align-items: flex-start;
  }
  .field.stack {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }
  .field.stack .dialog-label {
    margin-bottom: 0.125rem;
  }

  .anchor-grid {
    display: grid;
    grid-template-columns: repeat(3, 1.875rem);
    grid-auto-rows: 1.875rem;
    gap: 3px;
  }
  .anchor {
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 4px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-tertiary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .anchor:hover {
    border-color: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary);
  }
  .anchor.checked {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border-color: var(--pdf-lab-primary);
  }

  .color-input {
    width: 100%;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    cursor: pointer;
  }

  .stamp-preview {
    margin: 1.25rem 0 0;
    padding: 0.625rem;
    border: 1px dashed var(--pdf-lab-border);
    border-radius: 6px;
    text-align: center;
    font-family: var(--pdf-lab-font);
    font-size: 0.9375rem;
    min-height: 1.2em;
    background:
      radial-gradient(circle at 1px 1px, var(--pdf-lab-grid-dot) 1px, transparent 0) 0 0 / 16px 16px,
      var(--pdf-lab-surface);
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
  .dialog-btn.remove {
    background: transparent;
    color: var(--pdf-lab-danger, #c53030);
    border: 1px solid var(--pdf-lab-border);
  }
  .dialog-btn.remove:hover {
    border-color: var(--pdf-lab-danger, #c53030);
    background: var(--pdf-lab-danger-bg, rgba(197, 48, 48, 0.08));
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
