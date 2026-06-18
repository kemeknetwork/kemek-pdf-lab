<script lang="ts">
  import { trapTab } from '$lib/utils/focus-trap.js';
  import type { SignatureResult } from '$lib/pdf/types.js';

  interface Props {
    onsign: (result: SignatureResult) => void;
    oncancel: () => void;
  }

  let { onsign, oncancel }: Props = $props();

  type Mode = 'draw' | 'type' | 'upload';
  let mode = $state<Mode>('draw');

  // Ink color: black for formal docs, a blue that reads as "pen, not print".
  const INKS = [
    { id: 'black', label: 'Black', css: '#1a1a1a' },
    { id: 'blue', label: 'Blue', css: '#1d4ed8' }
  ] as const;
  let ink = $state<(typeof INKS)[number]['css']>(INKS[0].css);

  let cardEl = $state<HTMLDivElement | null>(null);
  let lastFocused: HTMLElement | null = null;
  const dialogId = $props.id();

  $effect(() => {
    const active = document.activeElement;
    lastFocused = active instanceof HTMLElement ? active : null;
    return () => requestAnimationFrame(() => lastFocused?.focus());
  });

  // ── DRAW ──────────────────────────────────────────────────────────────────
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let drawing = false;
  let hasInk = $state(false);
  const LOGICAL_W = 560;
  const LOGICAL_H = 200;

  // Set up the backing store at device resolution so strokes stay crisp; the
  // export reads these (higher-than-CSS) pixels, so signatures land sharp.
  function setupCanvas() {
    const c = canvasEl;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = LOGICAL_W * dpr;
    c.height = LOGICAL_H * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  $effect(() => {
    if (mode === 'draw' && canvasEl) {
      setupCanvas();
      hasInk = false;
    }
  });

  function pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvasEl!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * LOGICAL_W,
      y: ((e.clientY - rect.top) / rect.height) * LOGICAL_H
    };
  }

  function strokeStart(e: PointerEvent) {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;
    drawing = true;
    canvasEl!.setPointerCapture(e.pointerId);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.6;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A dot so a single tap leaves a mark.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    hasInk = true;
  }

  function strokeMove(e: PointerEvent) {
    if (!drawing) return;
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function strokeEnd() {
    drawing = false;
  }

  function clearCanvas() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx || !canvasEl) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    hasInk = false;
  }

  // ── TYPE ──────────────────────────────────────────────────────────────────
  let typed = $state('');
  const SIGNATURE_FONT = "'Segoe Script', 'Bradley Hand', 'Snell Roundhand', 'Brush Script MT', cursive";

  // ── UPLOAD ────────────────────────────────────────────────────────────────
  let uploaded = $state<{ url: string; result: SignatureResult } | null>(null);
  let uploadError = $state<string | null>(null);

  async function onUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadError = null;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      uploadError = 'Use a PNG or JPG image.';
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const bitmap = await createImageBitmap(new Blob([bytes], { type: file.type }));
      const result: SignatureResult = {
        bytes,
        mime: file.type as 'image/png' | 'image/jpeg',
        width: bitmap.width,
        height: bitmap.height
      };
      bitmap.close();
      if (uploaded) URL.revokeObjectURL(uploaded.url);
      uploaded = { url: URL.createObjectURL(new Blob([bytes], { type: file.type })), result };
    } catch {
      uploadError = 'That image couldn’t be read.';
    }
  }

  $effect(() => () => {
    if (uploaded) URL.revokeObjectURL(uploaded.url);
  });

  // ── PRODUCE ─────────────────────────────────────────────────────────────────
  function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('toBlob failed'));
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
      }, 'image/png');
    });
  }

  // Crop a canvas to the bounding box of its non-transparent pixels (+ a small
  // margin) so a signature isn't mostly empty canvas when placed. Returns null
  // if nothing was drawn.
  function trimmedCanvas(src: HTMLCanvasElement): HTMLCanvasElement | null {
    const ctx = src.getContext('2d');
    if (!ctx) return null;
    const { width, height } = src;
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const pad = Math.round(Math.max(width, height) * 0.02);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d')!.drawImage(src, minX, minY, w, h, 0, 0, w, h);
    return out;
  }

  // Render typed text in a cursive face to a tightly-fit transparent PNG.
  function renderTyped(text: string): HTMLCanvasElement | null {
    if (text.trim() === '') return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const fontPx = 96;
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = `${fontPx}px ${SIGNATURE_FONT}`;
    const m = measure.measureText(text);
    const ascent = m.actualBoundingBoxAscent || fontPx * 0.8;
    const descent = m.actualBoundingBoxDescent || fontPx * 0.3;
    const padX = fontPx * 0.25;
    const padY = fontPx * 0.2;
    const w = Math.ceil(m.width + padX * 2);
    const h = Math.ceil(ascent + descent + padY * 2);
    const c = document.createElement('canvas');
    c.width = Math.max(1, w * dpr);
    c.height = Math.max(1, h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.font = `${fontPx}px ${SIGNATURE_FONT}`;
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, padX, padY + ascent);
    return c;
  }

  let busy = $state(false);

  async function use() {
    if (busy) return;
    busy = true;
    try {
      if (mode === 'upload') {
        if (uploaded) onsign(uploaded.result);
        return;
      }
      const source = mode === 'draw' ? (canvasEl ? trimmedCanvas(canvasEl) : null) : renderTyped(typed);
      if (!source) return;
      const bytes = await canvasToPng(source);
      onsign({ bytes, mime: 'image/png', width: source.width, height: source.height });
    } finally {
      busy = false;
    }
  }

  const canUse = $derived(
    mode === 'draw' ? hasInk : mode === 'type' ? typed.trim() !== '' : uploaded !== null
  );

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      oncancel();
    }
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="dialog-overlay" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sig-title-{dialogId}"
    tabindex="-1"
    bind:this={cardEl}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => trapTab(e, cardEl)}
  >
    <div class="head">
      <h3 class="dialog-title" id="sig-title-{dialogId}">Add your signature</h3>
      <div class="seg" role="tablist" aria-label="Signature method">
        <button class="seg-btn" class:on={mode === 'draw'} role="tab" aria-selected={mode === 'draw'} onclick={() => (mode = 'draw')}>Draw</button>
        <button class="seg-btn" class:on={mode === 'type'} role="tab" aria-selected={mode === 'type'} onclick={() => (mode = 'type')}>Type</button>
        <button class="seg-btn" class:on={mode === 'upload'} role="tab" aria-selected={mode === 'upload'} onclick={() => (mode = 'upload')}>Upload</button>
      </div>
    </div>

    {#if mode === 'draw'}
      <div class="pad-wrap">
        <canvas
          bind:this={canvasEl}
          class="pad"
          style:aspect-ratio="{LOGICAL_W} / {LOGICAL_H}"
          onpointerdown={strokeStart}
          onpointermove={strokeMove}
          onpointerup={strokeEnd}
          onpointerleave={strokeEnd}
        ></canvas>
        <div class="pad-baseline" aria-hidden="true"><span class="pad-x">✕</span></div>
        {#if !hasInk}<span class="pad-hint" aria-hidden="true">Sign here</span>{/if}
      </div>
    {:else if mode === 'type'}
      <input
        class="type-input"
        type="text"
        bind:value={typed}
        placeholder="Type your name"
        spellcheck="false"
        autocomplete="off"
      />
      <div class="type-preview" style:font-family={SIGNATURE_FONT} style:color={ink}>
        {typed || 'Your name'}
      </div>
    {:else}
      <div class="upload-area">
        {#if uploaded}
          <img class="upload-preview" src={uploaded.url} alt="Uploaded signature preview" />
        {:else}
          <p class="upload-empty">Upload a PNG or JPG of your signature. PNG keeps a transparent background.</p>
        {/if}
        <label class="upload-btn">
          {uploaded ? 'Choose a different image' : 'Choose image'}
          <input type="file" accept="image/png,image/jpeg" onchange={onUpload} hidden />
        </label>
        {#if uploadError}<p class="upload-error" role="alert">{uploadError}</p>{/if}
      </div>
    {/if}

    <div class="controls">
      {#if mode !== 'upload'}
        <div class="ink" role="radiogroup" aria-label="Ink color">
          {#each INKS as i (i.id)}
            <button
              class="ink-swatch"
              class:on={ink === i.css}
              style:--swatch={i.css}
              aria-label={i.label}
              aria-pressed={ink === i.css}
              onclick={() => (ink = i.css)}
            ></button>
          {/each}
        </div>
      {/if}
      {#if mode === 'draw'}
        <button class="ghost-btn" onclick={clearCanvas} disabled={!hasInk}>Clear</button>
      {/if}
    </div>

    <p class="dialog-note">Stays on your device — the signature is drawn into the PDF locally, never uploaded.</p>

    <div class="dialog-actions">
      <button class="dialog-btn cancel" onclick={oncancel}>Cancel</button>
      <button class="dialog-btn confirm" onclick={use} disabled={!canUse || busy}>Place signature</button>
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
    z-index: 120;
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
    width: min(620px, 100%);
    box-sizing: border-box;
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.125rem;
    flex-wrap: wrap;
  }

  .dialog-title {
    margin: 0;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .seg {
    display: inline-flex;
    background: var(--pdf-lab-surface-hover);
    border: 1px solid var(--pdf-lab-border);
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
  }
  .seg-btn {
    padding: 0.3125rem 0.75rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .seg-btn:hover {
    color: var(--pdf-lab-text);
  }
  .seg-btn.on {
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-primary);
    box-shadow: var(--pdf-lab-shadow-sm);
  }

  /* DRAW PAD — an off-white sheet with a ruled baseline + an X start mark, so it
     reads as a place to sign rather than a blank box. */
  /* The pad is always light "paper" regardless of theme: signatures are dark ink,
     and this is also how they'll sit on the (white) PDF page — so dark mode must
     not turn the signing surface dark and hide the stroke. */
  .pad-wrap {
    position: relative;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 8px;
    overflow: hidden;
    background: #fafaf7;
  }
  .pad {
    display: block;
    width: 100%;
    height: auto;
    touch-action: none;
    cursor: crosshair;
    position: relative;
    z-index: 1;
  }
  .pad-baseline {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 26%;
    border-bottom: 1.5px solid rgba(0, 0, 0, 0.22);
    display: flex;
    align-items: flex-end;
    z-index: 0;
  }
  .pad-x {
    color: rgba(0, 0, 0, 0.38);
    font-size: 0.875rem;
    transform: translateY(40%);
    margin-right: 0.25rem;
  }
  .pad-hint {
    position: absolute;
    left: calc(6% + 1.25rem);
    bottom: calc(26% + 0.25rem);
    color: rgba(0, 0, 0, 0.3);
    font-size: 0.8125rem;
    font-style: italic;
    pointer-events: none;
    z-index: 0;
  }

  /* TYPE */
  .type-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.9375rem;
    font-family: var(--pdf-lab-font);
    padding: 0.5rem 0.625rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .type-input:focus {
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 3px var(--pdf-lab-primary-glow);
  }
  .type-preview {
    margin-top: 0.75rem;
    min-height: 96px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    font-size: 3.25rem;
    line-height: 1.1;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 8px;
    overflow: hidden;
    white-space: nowrap;
    /* Light paper, like the draw pad — the typed name is dark ink. */
    background: #fafaf7;
  }

  /* UPLOAD */
  .upload-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.875rem;
    padding: 1.25rem;
    border: 1px dashed var(--pdf-lab-border-strong);
    border-radius: 8px;
    text-align: center;
  }
  .upload-empty {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--pdf-lab-text-secondary);
    max-width: 36ch;
    line-height: 1.5;
  }
  .upload-preview {
    max-width: 100%;
    max-height: 150px;
    object-fit: contain;
  }
  .upload-btn {
    display: inline-flex;
    align-items: center;
    padding: 0.4375rem 0.875rem;
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .upload-btn:hover {
    border-color: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
  }
  .upload-error {
    margin: 0;
    font-size: 0.75rem;
    color: var(--pdf-lab-danger, #c53030);
  }

  /* CONTROLS — ink swatches + clear */
  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.875rem;
    min-height: 1.75rem;
  }
  .ink {
    display: flex;
    gap: 0.5rem;
  }
  .ink-swatch {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--swatch);
    border: 2px solid var(--pdf-lab-border);
    cursor: pointer;
    transition: transform 0.1s ease, box-shadow 0.12s ease, border-color 0.12s ease;
  }
  .ink-swatch:hover {
    transform: scale(1.08);
  }
  .ink-swatch.on {
    border-color: var(--pdf-lab-surface);
    box-shadow: 0 0 0 2px var(--pdf-lab-text);
  }
  .ghost-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 6px;
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .ghost-btn:hover:not(:disabled) {
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border-strong);
    background: var(--pdf-lab-surface-hover);
  }
  .ghost-btn:disabled {
    opacity: 0.4;
    cursor: default;
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
