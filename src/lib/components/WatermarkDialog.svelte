<script lang="ts">
  import { Stamp, Type, Image as ImageIcon } from 'lucide-svelte';
  import {
    getPages,
    getDocuments,
    getSelection,
    getWatermark,
    getWatermarkTargetIds,
    setWatermark
  } from '$lib/stores/app.svelte.js';
  import { mergePdf } from '$lib/pdf/operator.js';
  import { applyWatermark } from '$lib/pdf/watermark.js';
  import { renderBytesFirstPage } from '$lib/pdf/renderer.js';
  import { detectImageMime } from '$lib/pdf/image-import.js';
  import type { WatermarkConfig, WatermarkPosition } from '$lib/pdf/types.js';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // The 9 single-point anchors, laid out exactly as the picker grid renders
  // them. 'tile' is handled by a separate toggle.
  const ANCHORS: WatermarkPosition[][] = [
    ['top-left', 'top-center', 'top-right'],
    ['middle-left', 'center', 'middle-right'],
    ['bottom-left', 'bottom-center', 'bottom-right']
  ];

  // Hydrate the draft from an existing watermark so re-opening edits in place.
  const existing = getWatermark();
  const existingTargets = getWatermarkTargetIds();

  // The grid selection at open time is what "Selected pages" snapshots. Read
  // reactively so the count and preview track changes (e.g. if the user opened
  // with nothing selected, then this is harmless).
  const pages = $derived(getPages());
  const selectedPages = $derived(pages.filter((p) => getSelection().has(p.id)));

  // "Apply to" scope. 'selected' means the current grid selection, or — when
  // re-editing with nothing newly selected — the existing target snapshot.
  let scope = $state<'all' | 'selected'>(existingTargets ? 'selected' : 'all');

  // Pages the 'selected' scope will actually target on Apply: a fresh grid
  // selection wins; otherwise fall back to the stored snapshot so editing only
  // the look (opacity, color…) doesn't silently widen scope to all pages.
  const scopeTargetPages = $derived(
    selectedPages.length > 0
      ? selectedPages
      : pages.filter((p) => (existingTargets ?? []).includes(p.id))
  );
  const selectableCount = $derived(scopeTargetPages.length);
  // Once there's nothing to target, 'selected' is meaningless — force 'all'.
  const effectiveScope = $derived(scope === 'selected' && selectableCount > 0 ? 'selected' : 'all');

  let mode = $state<'text' | 'image'>(existing?.kind ?? 'text');
  // Placement is shared across modes so toggling Text/Image keeps the layout.
  let opacity = $state(existing?.opacity ?? 0.2);
  let rotation = $state(existing?.rotation ?? -45);
  let position = $state<WatermarkPosition>(existing?.position ?? 'center');

  let textValue = $state(existing?.kind === 'text' ? existing.text : 'DRAFT');
  let fontSize = $state(existing?.kind === 'text' ? existing.fontSize : 48);
  let color = $state(existing?.kind === 'text' ? existing.color : '#15803d');

  let imageBytes = $state<Uint8Array | null>(existing?.kind === 'image' ? existing.imageBytes : null);
  let imageMime = $state<'image/png' | 'image/jpeg'>(existing?.kind === 'image' ? existing.imageMime : 'image/png');
  let imageName = $state(existing?.kind === 'image' ? 'current image' : '');
  let imageUrl = $state<string | null>(null);
  let imageError = $state<string | null>(null);
  let scale = $state(existing?.kind === 'image' ? existing.scale : 1);

  let cardEl = $state<HTMLDivElement | null>(null);
  let dragOver = $state(false);
  const dialogId = Math.random().toString(36).slice(2, 10);

  const config = $derived<WatermarkConfig | null>(
    mode === 'text'
      ? textValue.trim() === ''
        ? null
        : { kind: 'text', text: textValue, fontSize, color, opacity, rotation, position }
      : imageBytes === null
        ? null
        : { kind: 'image', imageBytes, imageMime, scale, opacity, rotation, position }
  );

  // Preview the first page that will actually be stamped: under 'selected'
  // scope that's the first targeted page, otherwise page 1 — so the preview is
  // never a page the watermark skips.
  const previewPage = $derived(
    (effectiveScope === 'selected' ? scopeTargetPages[0] : pages[0]) ?? pages[0]
  );
  const previewPageNumber = $derived(previewPage ? pages.indexOf(previewPage) + 1 : 1);

  // Build the preview base from that page (rotations + annotations already
  // burned in by mergePdf), so the watermark previews over the same pixels
  // export produces. Only the one source document is loaded.
  let baseBytes = $state<Uint8Array | null>(null);
  let baseError = $state<string | null>(null);
  $effect(() => {
    const first = previewPage;
    const srcDoc = first && getDocuments().find((d) => d.id === first.sourceDocumentId);
    if (!first || !srcDoc) {
      baseError = 'Nothing to preview.';
      return;
    }
    baseError = null;
    let cancelled = false;
    mergePdf([srcDoc], [first])
      .then((b) => { if (!cancelled) baseBytes = b; })
      .catch((e: unknown) => { if (!cancelled) baseError = String(e); });
    return () => { cancelled = true; };
  });

  // Debounced WYSIWYG preview: stamp the base with the live config and
  // rasterize it. Debounce absorbs slider/keystroke churn; the cancel token
  // discards a stale render if the config changes mid-flight.
  let previewSrc = $state<string | null>(null);
  let previewBusy = $state(false);
  $effect(() => {
    const cfg = config;
    const base = baseBytes;
    if (!base) return;
    let cancelled = false;
    previewBusy = true;
    const handle = setTimeout(() => {
      (cfg ? applyWatermark(base, cfg) : Promise.resolve(base))
        .then((stamped) => renderBytesFirstPage(stamped, 460))
        .then((url) => { if (!cancelled) { previewSrc = url; previewBusy = false; } })
        .catch(() => { if (!cancelled) previewBusy = false; });
    }, 180);
    return () => { cancelled = true; clearTimeout(handle); };
  });

  // Own the thumbnail object URL: (re)create when the image bytes change,
  // revoke the prior URL on change and on unmount. Covers the hydrated
  // existing image, a fresh upload, and a replace — no manual juggling.
  $effect(() => {
    const bytes = imageBytes;
    if (!bytes) {
      imageUrl = null;
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageMime }));
    imageUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  $effect(() => {
    requestAnimationFrame(() => {
      cardEl?.querySelector<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])')?.focus();
    });
  });

  async function loadImageFile(file: File) {
    imageError = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = detectImageMime(bytes);
      if (!mime) {
        imageError = 'Only PNG or JPEG images are supported.';
        return;
      }
      // imageUrl is derived from these by the object-URL effect above.
      imageBytes = bytes;
      imageMime = mime;
      imageName = file.name;
    } catch {
      imageError = 'Could not read that image.';
    }
  }

  function pickImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg,image/png,image/jpeg';
    input.onchange = () => { if (input.files?.[0]) loadImageFile(input.files[0]); };
    input.click();
  }

  function handleImageDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) loadImageFile(file);
  }

  function apply() {
    if (!config) return;
    const targetIds = effectiveScope === 'selected' ? scopeTargetPages.map((p) => p.id) : null;
    setWatermark(config, targetIds);
    onclose();
  }

  function remove() {
    setWatermark(null);
    onclose();
  }

  function handleWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }

  // Keep Tab inside the dialog — without this it leaks to the grid behind.
  function trapTab(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !cardEl) return;
    const f = cardEl.querySelectorAll<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const opacityPct = $derived(Math.round(opacity * 100));
  const canApply = $derived(config !== null);
</script>

<svelte:window onkeydown={handleWindowKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="wm-title-{dialogId}"
    tabindex="-1"
    bind:this={cardEl}
    onclick={(e) => e.stopPropagation()}
    onkeydown={trapTab}
  >
    <header class="card-head">
      <span class="head-glyph"><Stamp size={16} /></span>
      <h2 class="head-title" id="wm-title-{dialogId}">Watermark</h2>
      <span class="head-sub">burned into every exported page</span>
      <button class="head-close" onclick={onclose} aria-label="Close (Esc)">
        <span></span><span></span>
      </button>
    </header>

    <div class="body">
      <div class="controls">
        <div class="seg" role="tablist" aria-label="Watermark type">
          <button
            class="seg-btn"
            class:active={mode === 'text'}
            role="tab"
            aria-selected={mode === 'text'}
            onclick={() => (mode = 'text')}
          >
            <Type size={14} /> Text
          </button>
          <button
            class="seg-btn"
            class:active={mode === 'image'}
            role="tab"
            aria-selected={mode === 'image'}
            onclick={() => (mode = 'image')}
          >
            <ImageIcon size={14} /> Image
          </button>
          <span class="seg-thumb" class:right={mode === 'image'}></span>
        </div>

        {#if mode === 'text'}
          <label class="field">
            <span class="field-label">Text</span>
            <input class="text-input" type="text" bind:value={textValue} spellcheck="false" placeholder="DRAFT" />
          </label>

          <div class="row">
            <label class="field swatch-field">
              <span class="field-label">Color</span>
              <span class="swatch">
                <input type="color" bind:value={color} aria-label="Watermark color" />
                <span class="swatch-hex">{color.toUpperCase()}</span>
              </span>
            </label>
            <label class="field size-field">
              <span class="field-label">Size</span>
              <span class="num">
                <input type="number" min="6" max="240" bind:value={fontSize} />
                <span class="num-unit">pt</span>
              </span>
            </label>
          </div>
        {:else}
          {#if imageBytes}
            <div class="img-loaded">
              <span class="img-chip">
                {#if imageUrl}<img src={imageUrl} alt="" />{/if}
              </span>
              <span class="img-meta">
                <span class="img-name">{imageName}</span>
                <button class="img-replace" onclick={pickImage}>Replace</button>
              </span>
            </div>
            <label class="field">
              <span class="field-label">Scale <span class="field-val">{scale.toFixed(1)}×</span></span>
              <input class="slider" type="range" min="0.1" max="3" step="0.1" bind:value={scale} />
            </label>
          {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="dropzone"
              class:over={dragOver}
              onclick={pickImage}
              ondragover={(e) => { e.preventDefault(); dragOver = true; }}
              ondragleave={() => (dragOver = false)}
              ondrop={handleImageDrop}
            >
              <ImageIcon size={22} />
              <span class="dz-line">Drop a PNG or JPEG</span>
              <span class="dz-sub">or click to browse</span>
            </div>
          {/if}
          {#if imageError}<p class="err">{imageError}</p>{/if}
        {/if}

        <label class="field">
          <span class="field-label">Opacity <span class="field-val">{opacityPct}%</span></span>
          <input class="slider" type="range" min="0" max="100" value={opacityPct} oninput={(e) => (opacity = +e.currentTarget.value / 100)} />
        </label>

        <label class="field">
          <span class="field-label">Rotation <span class="field-val">{rotation}°</span></span>
          <input class="slider" type="range" min="-180" max="180" step="5" bind:value={rotation} />
        </label>

        <div class="field">
          <span class="field-label">Position</span>
          <div class="pos-row">
            <div class="pos-grid" role="group" aria-label="Watermark position">
              {#each ANCHORS as anchorRow}
                {#each anchorRow as anchor}
                  <button
                    class="pos-cell"
                    class:active={position === anchor}
                    aria-label={anchor}
                    aria-pressed={position === anchor}
                    onclick={() => (position = anchor)}
                  ><span class="pos-dot"></span></button>
                {/each}
              {/each}
            </div>
            <button
              class="tile-btn"
              class:active={position === 'tile'}
              aria-pressed={position === 'tile'}
              onclick={() => (position = 'tile')}
            >
              <span class="tile-ico"><i></i><i></i><i></i><i></i></span>
              Tile
            </button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">Apply to</span>
          <div class="scope" role="group" aria-label="Pages to watermark">
            <button
              class="scope-btn"
              class:active={effectiveScope === 'all'}
              aria-pressed={effectiveScope === 'all'}
              onclick={() => (scope = 'all')}
            >
              All pages
            </button>
            <button
              class="scope-btn"
              class:active={effectiveScope === 'selected'}
              aria-pressed={effectiveScope === 'selected'}
              disabled={selectableCount === 0}
              title={selectableCount === 0 ? 'Select pages in the grid first' : undefined}
              onclick={() => (scope = 'selected')}
            >
              Selected {#if selectableCount > 0}<span class="scope-count">{selectableCount}</span>{/if}
            </button>
          </div>
        </div>
      </div>

      <div class="stage">
        <div class="stage-viewport">
          {#if baseError}
            <p class="stage-msg">{baseError}</p>
          {:else if previewSrc}
            <img class="preview-img" class:dim={previewBusy} src={previewSrc} alt="Watermark preview of page {previewPageNumber}" />
          {:else}
            <span class="stage-loader" aria-hidden="true"></span>
          {/if}
        </div>
        <span class="stage-caption">
          {#if previewBusy}Rendering…{:else}Live preview · page {previewPageNumber}{/if}
        </span>
      </div>
    </div>

    <footer class="card-foot">
      {#if existing}
        <button class="foot-btn ghost-danger" onclick={remove}>Remove watermark</button>
      {/if}
      <span class="foot-spacer"></span>
      <button class="foot-btn cancel" onclick={onclose}>Cancel</button>
      <button class="foot-btn apply" disabled={!canApply} onclick={apply}>
        {existing ? 'Update' : 'Apply'}
      </button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--pdf-lab-backdrop);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1.25rem;
    animation: fadeIn 0.14s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .card {
    width: min(740px, 100%);
    max-height: calc(100vh - 2.5rem);
    background: var(--pdf-lab-surface);
    border: 1px solid var(--pdf-lab-border);
    border-radius: 14px;
    box-shadow: var(--pdf-lab-shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: pop 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes pop {
    from { transform: scale(0.97) translateY(6px); opacity: 0; }
    to { transform: scale(1) translateY(0); opacity: 1; }
  }

  /* HEAD */
  .card-head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.875rem 1rem 0.875rem 1.125rem;
    border-bottom: 1px solid var(--pdf-lab-border);
  }

  .head-glyph {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--pdf-lab-primary-soft);
    color: var(--pdf-lab-primary);
  }

  .head-title {
    margin: 0;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.0625rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--pdf-lab-text);
  }

  .head-sub {
    font-size: 0.75rem;
    color: var(--pdf-lab-text-tertiary);
    letter-spacing: 0.01em;
  }

  .head-close {
    margin-left: auto;
    position: relative;
    width: 30px;
    height: 30px;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
  }

  .head-close:hover {
    background: var(--pdf-lab-surface-hover);
    border-color: var(--pdf-lab-border-strong);
  }

  .head-close:active { transform: scale(0.94); }

  .head-close span {
    position: absolute;
    width: 12px;
    height: 1.5px;
    background: var(--pdf-lab-text-secondary);
    border-radius: 1px;
  }
  .head-close span:nth-child(1) { transform: rotate(45deg); }
  .head-close span:nth-child(2) { transform: rotate(-45deg); }

  /* BODY — two panes */
  .body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 0;
    overflow: auto;
  }

  .controls {
    padding: 1.125rem 1.125rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    border-right: 1px solid var(--pdf-lab-border);
  }

  /* Segmented Text/Image toggle with sliding thumb */
  .seg {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: var(--pdf-lab-surface-hover);
    border: 1px solid var(--pdf-lab-border);
    border-radius: 9px;
    padding: 3px;
  }

  .seg-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 3px);
    height: calc(100% - 6px);
    background: var(--pdf-lab-surface);
    border-radius: 6px;
    box-shadow: var(--pdf-lab-shadow-sm);
    transition: transform 0.2s cubic-bezier(0.4, 0.9, 0.3, 1);
  }
  .seg-thumb.right { transform: translateX(100%); }

  .seg-btn {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.4375rem 0;
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--pdf-lab-text-tertiary);
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .seg-btn.active { color: var(--pdf-lab-primary); }

  .field { display: flex; flex-direction: column; gap: 0.4375rem; }

  .field-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--pdf-lab-text-secondary);
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .field-val {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    color: var(--pdf-lab-primary);
    font-variant-numeric: tabular-nums;
  }

  .text-input {
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 7px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.875rem;
    font-family: var(--pdf-lab-font);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .text-input:focus {
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 3px var(--pdf-lab-primary-glow);
  }

  .row { display: grid; grid-template-columns: 1fr auto; gap: 0.75rem; }

  .swatch {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 7px;
    padding: 0.25rem 0.5rem 0.25rem 0.25rem;
    background: var(--pdf-lab-surface);
  }
  .swatch input[type='color'] {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 5px;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  .swatch input[type='color']::-webkit-color-swatch-wrapper { padding: 0; }
  .swatch input[type='color']::-webkit-color-swatch { border: 1px solid var(--pdf-lab-border); border-radius: 5px; }
  .swatch-hex {
    font-size: 0.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--pdf-lab-text-secondary);
    letter-spacing: 0.02em;
  }

  .num {
    display: flex;
    align-items: center;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 7px;
    background: var(--pdf-lab-surface);
    overflow: hidden;
  }
  .num input {
    width: 3.25rem;
    padding: 0.4375rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--pdf-lab-text);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  .num-unit {
    padding: 0 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--pdf-lab-text-tertiary);
    background: var(--pdf-lab-surface-hover);
    align-self: stretch;
    display: flex;
    align-items: center;
    border-left: 1px solid var(--pdf-lab-border);
  }

  .slider {
    width: 100%;
    accent-color: var(--pdf-lab-primary);
    cursor: pointer;
  }

  /* Image dropzone + loaded state */
  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 1.5rem 1rem;
    border: 1.5px dashed var(--pdf-lab-border-strong);
    border-radius: 9px;
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text-tertiary);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .dropzone:hover, .dropzone.over {
    border-color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
    color: var(--pdf-lab-primary);
  }
  .dz-line { font-size: 0.8125rem; font-weight: 600; color: var(--pdf-lab-text-secondary); }
  .dz-sub { font-size: 0.6875rem; }

  .img-loaded {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 9px;
    background: var(--pdf-lab-surface-hover);
  }
  .img-chip {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background:
      repeating-conic-gradient(var(--pdf-lab-border) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px,
      var(--pdf-lab-surface);
    display: grid;
    place-items: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .img-chip img { max-width: 100%; max-height: 100%; }
  .img-meta { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
  .img-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--pdf-lab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 16ch;
  }
  .img-replace {
    align-self: flex-start;
    border: none;
    background: none;
    padding: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--pdf-lab-primary);
    cursor: pointer;
  }
  .img-replace:hover { text-decoration: underline; }

  .err { margin: 0; font-size: 0.75rem; color: var(--pdf-lab-danger); }

  /* Position picker */
  .pos-row { display: flex; align-items: stretch; gap: 0.625rem; }
  .pos-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 3px;
    width: 92px;
    height: 92px;
    padding: 4px;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 8px;
    background: var(--pdf-lab-surface-hover);
  }
  .pos-cell {
    border: none;
    border-radius: 4px;
    background: var(--pdf-lab-surface);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 0.12s, transform 0.1s;
  }
  .pos-cell:hover { background: var(--pdf-lab-primary-soft); }
  .pos-cell:active { transform: scale(0.9); }
  .pos-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--pdf-lab-border-strong);
    transition: background 0.12s, transform 0.12s;
  }
  .pos-cell.active { background: var(--pdf-lab-primary); }
  .pos-cell.active .pos-dot { background: var(--pdf-lab-primary-text); transform: scale(1.5); }

  .tile-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 8px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .tile-btn:hover { border-color: var(--pdf-lab-primary); color: var(--pdf-lab-primary); }
  .tile-ico {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    width: 22px;
    height: 22px;
  }
  .tile-ico i { background: currentColor; border-radius: 2px; opacity: 0.55; }
  .tile-btn.active {
    background: var(--pdf-lab-primary);
    border-color: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
  }
  .tile-btn.active .tile-ico i { opacity: 0.9; }

  /* Apply-to scope */
  .scope { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .scope-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.5rem 0.5rem;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 8px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-secondary);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .scope-btn:hover:not(:disabled):not(.active) {
    border-color: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary);
  }
  .scope-btn.active {
    background: var(--pdf-lab-primary-soft);
    border-color: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary);
  }
  .scope-btn:disabled { opacity: 0.45; cursor: default; }
  .scope-count {
    min-width: 1.25rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25rem;
    text-align: center;
  }
  .scope-btn:not(.active) .scope-count {
    background: var(--pdf-lab-border-strong);
    color: var(--pdf-lab-text-secondary);
  }

  /* STAGE — sunken viewport, checkerboard signals the canvas */
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.625rem;
    padding: 1.125rem;
    background: var(--pdf-lab-bg);
    min-width: 0;
  }
  .stage-viewport {
    flex: 1;
    width: 100%;
    display: grid;
    place-items: center;
    border-radius: 10px;
    padding: 1rem;
    background:
      repeating-conic-gradient(var(--pdf-lab-grid-dot) 0% 25%, transparent 0% 50%) 0 0 / 18px 18px;
    min-height: 220px;
  }
  .preview-img {
    max-width: 100%;
    max-height: 46vh;
    border-radius: 2px;
    background: #fff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.05);
    transition: opacity 0.18s ease;
    animation: preIn 0.2s ease-out;
  }
  .preview-img.dim { opacity: 0.6; }

  @keyframes preIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .stage-msg { font-size: 0.8125rem; color: var(--pdf-lab-text-tertiary); }
  .stage-caption {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--pdf-lab-text-tertiary);
    font-variant-numeric: tabular-nums;
  }
  .stage-loader {
    width: 22px;
    height: 22px;
    border: 2px solid var(--pdf-lab-border-strong);
    border-top-color: var(--pdf-lab-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* FOOT */
  .card-foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    border-top: 1px solid var(--pdf-lab-border);
    background: var(--pdf-lab-surface);
  }
  .foot-spacer { flex: 1; }
  .foot-btn {
    padding: 0.5rem 1rem;
    border-radius: 7px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.12s ease;
  }
  .foot-btn:active:not(:disabled) { transform: scale(0.97); }
  .ghost-danger {
    background: transparent;
    color: var(--pdf-lab-danger);
    border-color: transparent;
  }
  .ghost-danger:hover { background: var(--pdf-lab-danger-bg); }
  .cancel {
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    border-color: var(--pdf-lab-border);
  }
  .cancel:hover { background: var(--pdf-lab-surface-hover); color: var(--pdf-lab-text); border-color: var(--pdf-lab-border-strong); }
  .apply {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border-color: var(--pdf-lab-primary);
    box-shadow: var(--pdf-lab-shadow-sm);
  }
  .apply:hover:not(:disabled) { background: var(--pdf-lab-primary-hover); border-color: var(--pdf-lab-primary-hover); }
  .apply:disabled { opacity: 0.4; cursor: default; }

  @media (max-width: 640px) {
    .body { grid-template-columns: 1fr; }
    .controls { border-right: none; border-bottom: 1px solid var(--pdf-lab-border); }
    .stage-viewport { min-height: 180px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay, .card, .preview-img, .seg-thumb { animation: none; transition-duration: 0s; }
    .stage-loader { animation-duration: 1.4s; }
  }
</style>
