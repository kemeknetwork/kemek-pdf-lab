<script lang="ts">
  import {
    getDocuments,
    getPages,
    addAnnotation,
    removeAnnotation,
    moveAnnotation,
    setFieldValue,
    clearFieldValues,
    setDocumentFormFields,
    getDocumentFormFields
  } from '$lib/stores/app.svelte.js';
  import { renderPage, detectFormFields } from '$lib/pdf/renderer.js';
  import SignatureDialog from './SignatureDialog.svelte';
  import type { FormField, FormFieldWidget, ImageAnnotation, SignatureResult } from '$lib/pdf/types.js';

  interface Props {
    pageId: string;
    onclose: () => void;
  }

  let { pageId, onclose }: Props = $props();

  const page = $derived(getPages().find((p) => p.id === pageId));
  const document_ = $derived(
    page ? (getDocuments().find((d) => d.id === page.sourceDocumentId) ?? null) : null
  );
  const annotations = $derived(page?.annotations ?? []);

  let imageSrc = $state<string | null>(null);
  let imageError = $state<string | null>(null);
  let frameEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  let activeInput = $state<{ x: number; y: number } | null>(null);
  let activeText = $state('');

  // Signature flow. The dialog produces a SignatureResult; while one is pending,
  // the next page click places it as an image annotation (and stays pending so
  // the same signature can be placed on several pages until the user is done).
  let showSignatureDialog = $state(false);
  let pendingSignature = $state<SignatureResult | null>(null);

  // Live move/resize of an image annotation — visual only until pointerup, which
  // commits a single undo step via moveAnnotation. While set, the matching
  // annotation renders from this instead of its stored geometry.
  let liveGeom = $state<{ id: string; x: number; y: number; width: number; height: number } | null>(null);
  let dragMode: 'move' | 'resize' | null = null;
  let dragStart = { px: 0, py: 0, x: 0, y: 0, width: 0, height: 0 };

  // bytes → object URL for displaying placed signatures. Memoized by annotation
  // id; all URLs are revoked when the modal closes.
  const urlCache = new Map<string, string>();
  function imageUrl(ann: ImageAnnotation): string {
    let url = urlCache.get(ann.id);
    if (!url) {
      url = URL.createObjectURL(new Blob([ann.imageBytes as BlobPart], { type: ann.imageMime }));
      urlCache.set(ann.id, url);
    }
    return url;
  }
  $effect(() => () => {
    for (const u of urlCache.values()) URL.revokeObjectURL(u);
  });

  // Revoke + drop a signature's object URL when it's deleted, not just on close —
  // and drop the cache entry so an undo-restore re-creates a fresh URL rather than
  // rendering the revoked (broken) one.
  function deleteSignature(id: string) {
    const url = urlCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(id);
    }
    removeAnnotation(pageId, id);
  }

  // Form filling. Detected fields are cached on the document; entered values
  // live in the store (export-only state, like the watermark) and are read back
  // reactively from document_.fieldValues.
  let formFields = $state<FormField[]>([]);
  let panelOpen = $state(true);
  let flashName = $state<string | null>(null);

  // The raster depends on exactly these two ids — never on `document_`/`page`
  // themselves. The store updates immutably, so every form keystroke replaces the
  // document object and hands `document_` a fresh identity; an effect reading the
  // object re-runs per keystroke, blanks imageSrc and tears down the rendered
  // frame, destroying whatever form overlay currently has focus.
  // Keep both primitive: an object or tuple is a new identity per recompute and
  // would carry the same churn straight through.
  const renderDocId = $derived(document_?.id ?? null);
  const renderPageIndex = $derived(page?.originalIndex ?? null);

  // Render at modal-suitable resolution. Browser CSS scales to fit; the
  // higher source resolution keeps the image sharp on retina displays.
  $effect(() => {
    const docId = renderDocId;
    const pageIndex = renderPageIndex;
    if (docId === null || pageIndex === null) return;
    let cancelled = false;
    imageSrc = null;
    imageError = null;
    renderPage(docId, pageIndex, 1400)
      .then((url) => {
        if (!cancelled) imageSrc = url;
      })
      .catch((err: unknown) => {
        if (!cancelled) imageError = String(err);
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (activeInput) requestAnimationFrame(() => inputEl?.focus());
  });

  // Detect AcroForm fields once per document (cached on the doc), then mirror
  // into local state for this preview. A detection failure degrades to "no
  // fields" — never blocks the preview.
  $effect(() => {
    if (!document_) {
      formFields = [];
      return;
    }
    const docId = document_.id;
    const cached = getDocumentFormFields(docId);
    if (cached) {
      formFields = cached;
      return;
    }
    let cancelled = false;
    detectFormFields(docId)
      .then((fields) => {
        if (cancelled) return;
        setDocumentFormFields(docId, fields);
        formFields = fields;
      })
      .catch(() => {
        if (!cancelled) formFields = [];
      });
    return () => {
      cancelled = true;
    };
  });

  const values = $derived(document_?.fieldValues ?? {});
  // Each field widget that sits on the page currently shown, paired with its
  // field, for the in-place overlays. Fields can repeat across pages, so this is
  // per-widget, not per-field.
  const pageWidgets = $derived(
    page
      ? formFields.flatMap((field) =>
          field.widgets
            .filter((w) => w.pageIndex === page!.originalIndex)
            .map((widget) => ({ field, widget }))
        )
      : []
  );
  // Fields with at least one widget on this page, for the sidebar list.
  const pageFields = $derived(
    page ? formFields.filter((f) => f.widgets.some((w) => w.pageIndex === page!.originalIndex)) : []
  );
  const otherPageFieldCount = $derived(formFields.length - pageFields.length);
  const filledOnPage = $derived(pageFields.filter((f) => Boolean(values[f.name])).length);

  const fieldKindLabel: Record<FormField['type'], string> = {
    text: 'Text field',
    checkbox: 'Checkbox',
    radio: 'Choice',
    dropdown: 'Dropdown',
    listbox: 'List'
  };

  function fieldLabel(f: FormField): string {
    if (f.label) return f.label;
    const pageNo = (f.widgets[0]?.pageIndex ?? 0) + 1;
    return `${fieldKindLabel[f.type]} · p.${pageNo}`;
  }

  const fieldGlyph: Record<FormField['type'], string> = {
    text: 'T',
    checkbox: '☑',
    radio: '◉',
    dropdown: '▾',
    listbox: '≡'
  };
  function glyph(t: FormField['type']): string {
    return fieldGlyph[t];
  }

  function optionLabel(f: FormField, value: string): string {
    return f.options?.find((o) => o.value === value)?.label ?? value;
  }

  function setText(name: string, value: string) {
    if (document_) setFieldValue(document_.id, name, value);
  }

  function toggleCheck(field: FormField, widget: FormFieldWidget) {
    if (!document_) return;
    const on = Boolean(values[field.name]);
    setFieldValue(document_.id, field.name, on ? '' : (widget.onValue ?? 'On'));
  }

  function selectRadio(field: FormField, widget: FormFieldWidget) {
    if (document_ && widget.onValue) setFieldValue(document_.id, field.name, widget.onValue);
  }

  function resetForm() {
    if (document_) clearFieldValues(document_.id);
  }

  // Clicking a sidebar row flashes + focuses the field's first on-page widget.
  function locateField(name: string) {
    flashName = name;
    requestAnimationFrame(() => {
      const sel = `[data-field="${CSS.escape(name)}"]`;
      const el = frameEl?.querySelector<HTMLElement>(sel);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    });
  }

  function clearFlash(name: string) {
    if (flashName === name) flashName = null;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleAnnotationLayerClick(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    if (!frameEl) return;

    const rect = frameEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // While a signature is pending, a page click drops it here instead of
    // starting a text annotation.
    if (pendingSignature) {
      placeSignature(x, y);
      return;
    }

    // Clicking elsewhere while an input is open commits the current
    // annotation (blur fires first) and starts a fresh one at the new
    // click position. This keeps the placement loop fluid.
    activeText = '';
    activeInput = { x, y };
  }

  function commitActive() {
    if (!activeInput || !page) {
      cancelActive();
      return;
    }
    const text = activeText.trim();
    if (text) {
      addAnnotation(pageId, {
        kind: 'text',
        x: activeInput.x,
        y: activeInput.y,
        text,
        fontSize: 14,
        color: '#000000'
      });
    }
    activeInput = null;
    activeText = '';
  }

  function cancelActive() {
    activeInput = null;
    activeText = '';
  }

  // ── Signature ────────────────────────────────────────────────────────────
  function onSigned(result: SignatureResult) {
    pendingSignature = result;
    showSignatureDialog = false;
  }

  // Place the pending signature centered on the click, sized to ~30% of the page
  // width with the raster's aspect preserved, clamped inside the page.
  function placeSignature(cx: number, cy: number) {
    if (!pendingSignature || !frameEl) return;
    const fw = frameEl.clientWidth;
    const fh = frameEl.clientHeight;
    if (fw === 0 || fh === 0) return;
    const widthNorm = 0.3;
    const heightNorm = widthNorm * (fw / fh) * (pendingSignature.height / pendingSignature.width);
    const x = Math.min(Math.max(cx - widthNorm / 2, 0), Math.max(0, 1 - widthNorm));
    const y = Math.min(Math.max(cy - heightNorm / 2, 0), Math.max(0, 1 - heightNorm));
    addAnnotation(pageId, {
      kind: 'image',
      x,
      y,
      width: widthNorm,
      height: heightNorm,
      imageBytes: pendingSignature.bytes,
      imageMime: pendingSignature.mime
    });
  }

  function beginDrag(e: PointerEvent, ann: ImageAnnotation, mode: 'move' | 'resize') {
    e.stopPropagation();
    e.preventDefault();
    if (!frameEl) return;
    dragMode = mode;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart = { px: e.clientX, py: e.clientY, x: ann.x, y: ann.y, width: ann.width, height: ann.height };
    liveGeom = { id: ann.id, x: ann.x, y: ann.y, width: ann.width, height: ann.height };
  }

  function onDragMove(e: PointerEvent) {
    if (!dragMode || !liveGeom || !frameEl) return;
    const fw = frameEl.clientWidth;
    const fh = frameEl.clientHeight;
    const dx = (e.clientX - dragStart.px) / fw;
    const dy = (e.clientY - dragStart.py) / fh;
    if (dragMode === 'move') {
      const x = Math.min(Math.max(dragStart.x + dx, 0), Math.max(0, 1 - dragStart.width));
      const y = Math.min(Math.max(dragStart.y + dy, 0), Math.max(0, 1 - dragStart.height));
      liveGeom = { ...liveGeom, x, y };
    } else {
      // Resize from the bottom-right corner: scale width + height by the same
      // factor (preserves the displayed aspect since the page dims are fixed),
      // floored at 4% of the page and clamped to the page edges.
      let width = Math.min(Math.max(0.04, dragStart.width + dx), 1 - dragStart.x);
      let k = width / dragStart.width;
      let height = dragStart.height * k;
      if (dragStart.y + height > 1) {
        height = 1 - dragStart.y;
        k = height / dragStart.height;
        width = dragStart.width * k;
      }
      liveGeom = { ...liveGeom, width, height };
    }
  }

  function endDrag() {
    if (!dragMode || !liveGeom) return;
    const committed = liveGeom;
    const ann = annotations.find((a) => a.id === committed.id);
    dragMode = null;
    liveGeom = null;
    if (ann && ann.kind === 'image') {
      moveAnnotation(
        pageId,
        ann.id,
        { x: ann.x, y: ann.y, width: ann.width, height: ann.height },
        { x: committed.x, y: committed.y, width: committed.width, height: committed.height }
      );
    }
  }

  function handleInputKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelActive();
    }
  }

  function handleWindowKey(e: KeyboardEvent) {
    // The signature sub-dialog owns the keyboard (and Escape) while it's open.
    if (showSignatureDialog) return;
    if (e.key === 'Escape') {
      if (pendingSignature) pendingSignature = null;
      else if (activeInput) cancelActive();
      else onclose();
    }
  }

  const pageLabel = $derived(page ? (page.label ?? `Page ${page.originalIndex + 1}`) : '');
  const rotationNote = $derived(
    page && page.rotation !== 0 ? ` · rotated ${page.rotation}°` : ''
  );
  const footerHint = $derived(
    pendingSignature
      ? 'Click the page to place your signature · Esc when done'
      : activeInput
        ? 'Enter to place · Esc to cancel'
        : 'Click the page to add text, or use Sign'
  );
</script>

<svelte:window onkeydown={handleWindowKey} />

{#if page && document_}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Edit page" tabindex="-1">
    <div class="header">
      <span class="eyebrow">Editing</span>
      <span class="filename">{document_.name}</span>
      <span class="separator">·</span>
      <span class="page-label">{pageLabel}{rotationNote}</span>
      <div class="head-actions">
        <button class="sign-btn" onclick={() => (showSignatureDialog = true)} title="Add a signature">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <span>Sign</span>
        </button>
        <button class="close" onclick={onclose} aria-label="Close (Esc)">
          <span class="close-line"></span>
          <span class="close-line"></span>
        </button>
      </div>
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="stage">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="stage-main" onclick={handleBackdropClick}>
        {#if imageError}
          <div class="status status-error">Could not render page<br /><small>{imageError}</small></div>
        {:else if !imageSrc}
          <div class="status">
            <span class="loader" aria-hidden="true"></span>
            Rendering page…
          </div>
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="frame" bind:this={frameEl} onclick={(e) => e.stopPropagation()}>
            <img class="page-image" src={imageSrc} alt="" draggable="false" />
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="annotation-layer" class:placing={pendingSignature} onclick={handleAnnotationLayerClick}>
              {#each annotations as ann (ann.id)}
                {#if ann.kind === 'text'}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="annotation"
                    style:left="{ann.x * 100}%"
                    style:top="{ann.y * 100}%"
                    style:color={ann.color}
                    style:font-size="{ann.fontSize}px"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <span class="annotation-text">{ann.text}</span>
                    <button
                      class="annotation-delete"
                      aria-label="Delete annotation"
                      onclick={(e) => {
                        e.stopPropagation();
                        removeAnnotation(pageId, ann.id);
                      }}>×</button>
                  </div>
                {:else}
                  {@const g = liveGeom?.id === ann.id ? liveGeom : ann}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="sig-annotation"
                    class:dragging={liveGeom?.id === ann.id}
                    style:left="{g.x * 100}%"
                    style:top="{g.y * 100}%"
                    style:width="{g.width * 100}%"
                    style:height="{g.height * 100}%"
                    onclick={(e) => e.stopPropagation()}
                    onpointerdown={(e) => beginDrag(e, ann, 'move')}
                    onpointermove={onDragMove}
                    onpointerup={endDrag}
                    onpointercancel={endDrag}
                  >
                    <img class="sig-image" src={imageUrl(ann)} alt="Signature" draggable="false" />
                    <button
                      class="annotation-delete"
                      aria-label="Delete signature"
                      onpointerdown={(e) => e.stopPropagation()}
                      onclick={(e) => {
                        e.stopPropagation();
                        deleteSignature(ann.id);
                      }}>×</button>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="sig-resize"
                      title="Drag to resize"
                      onpointerdown={(e) => beginDrag(e, ann, 'resize')}
                      onpointermove={onDragMove}
                      onpointerup={endDrag}
                      onpointercancel={endDrag}
                    ></span>
                  </div>
                {/if}
              {/each}

              {#if activeInput}
                <div
                  class="active-input-wrap"
                  style:left="{activeInput.x * 100}%"
                  style:top="{activeInput.y * 100}%"
                >
                  <input
                    class="active-input"
                    type="text"
                    bind:value={activeText}
                    bind:this={inputEl}
                    onkeydown={handleInputKey}
                    onblur={commitActive}
                    spellcheck="false"
                    autocomplete="off"
                  />
                </div>
              {/if}
            </div>

            {#if pageWidgets.length > 0}
              <!-- Form-field overlays sit above the annotation layer but are
                   click-through except on the controls themselves, so empty page
                   areas still place text annotations. -->
              <div class="form-layer">
                {#each pageWidgets as pw (pw.field.name + '@' + pw.widget.pageIndex + ':' + pw.widget.rect.x + ',' + pw.widget.rect.y)}
                  {@const f = pw.field}
                  {@const w = pw.widget}
                  {@const empty = !values[f.name]}
                  <div
                    class="field-slot"
                    style:left="{w.rect.x * 100}%"
                    style:top="{w.rect.y * 100}%"
                    style:width="{w.rect.width * 100}%"
                    style:height="{w.rect.height * 100}%"
                  >
                    {#if f.readOnly}
                      <div class="f-readonly" title="Read-only field">{values[f.name] ?? ''}</div>
                    {:else if f.type === 'text' && f.multiline}
                      <textarea
                        class="f-text"
                        class:flash={flashName === f.name}
                        class:req={f.required && empty}
                        data-field={f.name}
                        maxlength={f.maxLen}
                        spellcheck="false"
                        bind:value={() => values[f.name] ?? '', (v) => setText(f.name, v)}
                        onanimationend={() => clearFlash(f.name)}
                      ></textarea>
                    {:else if f.type === 'text'}
                      <input
                        class="f-text"
                        class:flash={flashName === f.name}
                        class:req={f.required && empty}
                        type="text"
                        data-field={f.name}
                        maxlength={f.maxLen}
                        spellcheck="false"
                        autocomplete="off"
                        bind:value={() => values[f.name] ?? '', (v) => setText(f.name, v)}
                        onanimationend={() => clearFlash(f.name)}
                      />
                    {:else if f.type === 'checkbox'}
                      <button
                        type="button"
                        class="f-check"
                        class:on={!empty}
                        class:flash={flashName === f.name}
                        class:req={f.required && empty}
                        data-field={f.name}
                        aria-pressed={!empty}
                        aria-label={fieldLabel(f)}
                        onclick={() => toggleCheck(f, w)}
                        onanimationend={() => clearFlash(f.name)}
                      >
                        {#if !empty}
                          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.4l3.4 3.4L13 5" /></svg>
                        {/if}
                      </button>
                    {:else if f.type === 'radio'}
                      <button
                        type="button"
                        class="f-radio"
                        class:on={values[f.name] === w.onValue}
                        class:flash={flashName === f.name}
                        data-field={f.name}
                        aria-label="{w.onValue ?? ''} {fieldLabel(f)}"
                        onclick={() => selectRadio(f, w)}
                        onanimationend={() => clearFlash(f.name)}
                      ></button>
                    {:else}
                      <select
                        class="f-select"
                        class:flash={flashName === f.name}
                        class:req={f.required && empty}
                        data-field={f.name}
                        bind:value={() => values[f.name] ?? '', (v) => setText(f.name, v)}
                        onanimationend={() => clearFlash(f.name)}
                      >
                        <option value="">—</option>
                        {#each f.options ?? [] as o (o.value)}
                          <option value={o.value}>{o.label}</option>
                        {/each}
                      </select>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      {#if pageFields.length > 0}
        <aside class="field-panel" class:collapsed={!panelOpen}>
          {#if panelOpen}
            <div class="panel-head">
              <div class="panel-title">
                <span class="panel-eyebrow">Form</span>
                <span class="panel-count">{filledOnPage}/{pageFields.length} filled</span>
              </div>
              <button
                class="panel-toggle"
                onclick={() => (panelOpen = false)}
                aria-label="Collapse field list"
                title="Collapse">›</button>
            </div>

            <ul class="field-list">
              {#each pageFields as f (f.name)}
                {@const filled = Boolean(values[f.name])}
                {@const reqEmpty = f.required && !filled}
                <li>
                  <button
                    class="field-row"
                    class:filled
                    class:req={reqEmpty}
                    onclick={() => locateField(f.name)}
                  >
                    <span class="row-glyph" data-type={f.type} aria-hidden="true">{glyph(f.type)}</span>
                    <span class="row-main">
                      <span class="row-label">{fieldLabel(f)}</span>
                      <span class="row-sub">
                        {#if f.type === 'text'}
                          {values[f.name] || (reqEmpty ? 'Required' : 'Empty')}
                        {:else if f.type === 'checkbox'}
                          {filled ? 'Checked' : reqEmpty ? 'Required' : 'Unchecked'}
                        {:else}
                          {values[f.name] ? optionLabel(f, values[f.name]) : reqEmpty ? 'Required' : 'Not set'}
                        {/if}
                      </span>
                    </span>
                    <span class="row-state" aria-hidden="true">
                      {#if filled}
                        <svg class="row-check" viewBox="0 0 16 16"><path d="M3 8.4l3.4 3.4L13 5" /></svg>
                      {:else if reqEmpty}
                        <span class="row-dot"></span>
                      {/if}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>

            {#if otherPageFieldCount > 0}
              <p class="panel-note">
                +{otherPageFieldCount} more field{otherPageFieldCount === 1 ? '' : 's'} on other pages
              </p>
            {/if}

            <div class="panel-foot">
              <button class="panel-reset" onclick={resetForm} disabled={filledOnPage === 0}>
                Reset fields
              </button>
            </div>
          {:else}
            <button class="panel-tab" onclick={() => (panelOpen = true)} aria-label="Show form fields">
              <span class="tab-label">FORM</span>
              <span class="tab-count">{pageFields.length}</span>
            </button>
          {/if}
        </aside>
      {/if}
    </div>

    <div class="footer">
      <span class="hint">{footerHint}</span>
      {#if annotations.length > 0}
        <span class="bullet">·</span>
        <span class="count">{annotations.length} {annotations.length === 1 ? 'annotation' : 'annotations'}</span>
      {/if}
    </div>

    {#if pendingSignature}
      <div class="place-bar">
        <span class="place-dot" aria-hidden="true"></span>
        <span class="place-text">Click the page to place your signature</span>
        <button class="place-done" onclick={() => (pendingSignature = null)}>Done</button>
      </div>
    {/if}

    {#if showSignatureDialog}
      <SignatureDialog onsign={onSigned} oncancel={() => (showSignatureDialog = false)} />
    {/if}
  </div>
{/if}

<style>
  /* The whole modal is the focal vacuum — chrome dissolves into the
     darkened backdrop, leaving the page itself as the only object that
     reads as "real". */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 16, 11, 0.62);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    z-index: 100;
    display: grid;
    grid-template-rows: auto 1fr auto;
    animation: overlayFadeIn 0.18s ease-out;
  }

  @keyframes overlayFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* HEADER — peripheral, atmospheric. No card, no panel. */
  .header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 1rem 1.5rem;
    color: rgba(255, 255, 255, 0.65);
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    line-height: 1;
    pointer-events: none;
  }

  .header > * {
    pointer-events: auto;
  }

  .eyebrow {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(74, 222, 128, 0.85);
  }

  .filename {
    color: rgba(255, 255, 255, 0.94);
    font-family: var(--pdf-lab-font-display);
    font-weight: 700;
    font-size: 0.9375rem;
    letter-spacing: -0.01em;
    max-width: 38ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .separator {
    color: rgba(255, 255, 255, 0.25);
  }

  .page-label {
    color: rgba(255, 255, 255, 0.65);
    font-variant-numeric: tabular-nums;
  }

  .head-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .sign-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    height: 32px;
    padding: 0 0.75rem;
    border: 1px solid rgba(74, 222, 128, 0.4);
    border-radius: 6px;
    background: rgba(74, 222, 128, 0.1);
    color: rgba(187, 247, 208, 0.95);
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
  }
  .sign-btn svg {
    width: 15px;
    height: 15px;
  }
  .sign-btn:hover {
    background: rgba(74, 222, 128, 0.18);
    border-color: rgba(74, 222, 128, 0.65);
  }
  .sign-btn:active {
    transform: scale(0.96);
  }

  .close {
    width: 32px;
    height: 32px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
    position: relative;
  }

  .close:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.32);
  }

  .close:active {
    transform: scale(0.94);
  }

  .close-line {
    position: absolute;
    width: 12px;
    height: 1.5px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 1px;
  }

  .close-line:nth-child(1) {
    transform: rotate(45deg);
  }
  .close-line:nth-child(2) {
    transform: rotate(-45deg);
  }

  /* STAGE — the page floats; an optional field rail docks to its right. */
  .stage {
    display: flex;
    align-items: stretch;
    min-height: 0;
    overflow: hidden;
  }

  .stage-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 1.5rem;
    overflow: auto;
    min-width: 0;
  }

  .frame {
    position: relative;
    max-width: 100%;
    box-shadow:
      0 12px 48px rgba(0, 0, 0, 0.45),
      0 1px 2px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.04);
    border-radius: 1px;
    background: #fff;
    animation: pageEnter 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
    line-height: 0;
  }

  @keyframes pageEnter {
    from {
      transform: translateY(8px) scale(0.985);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .page-image {
    display: block;
    max-width: 100%;
    max-height: calc(100vh - 8rem);
    width: auto;
    height: auto;
    user-select: none;
    -webkit-user-drag: none;
  }

  .annotation-layer {
    position: absolute;
    inset: 0;
    cursor: text;
  }
  .annotation-layer.placing {
    cursor: copy;
  }

  /* SIGNATURE — a placed image with a hairline frame on hover, a delete badge,
     and a corner resize grip. Moves with a drag; the grip resizes (aspect-locked). */
  .sig-annotation {
    position: absolute;
    cursor: grab;
    outline: 1px dashed transparent;
    outline-offset: 2px;
    transition: outline-color 0.1s ease;
    touch-action: none;
  }
  .sig-annotation:hover,
  .sig-annotation.dragging {
    outline-color: rgba(74, 222, 128, 0.7);
  }
  .sig-annotation.dragging {
    cursor: grabbing;
  }
  .sig-image {
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
    -webkit-user-drag: none;
    user-select: none;
  }
  .sig-resize {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: var(--pdf-lab-primary, #15803d);
    border: 2px solid #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    cursor: nwse-resize;
    opacity: 0;
    transition: opacity 0.12s ease;
    touch-action: none;
  }
  .sig-annotation:hover .sig-resize,
  .sig-annotation.dragging .sig-resize {
    opacity: 1;
  }

  /* PLACE BAR — floating prompt while a signature is waiting to be dropped. */
  .place-bar {
    position: absolute;
    top: 4.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem 0.5rem 0.875rem;
    background: rgba(16, 26, 20, 0.92);
    border: 1px solid rgba(74, 222, 128, 0.4);
    border-radius: 999px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.8125rem;
    z-index: 6;
    animation: placeBarIn 0.16s ease-out;
  }
  @keyframes placeBarIn {
    from { opacity: 0; transform: translate(-50%, -4px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  .place-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(74, 222, 128, 0.95);
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.6);
    animation: placePulse 1.6s ease-out infinite;
  }
  @keyframes placePulse {
    0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5); }
    70% { box-shadow: 0 0 0 7px rgba(74, 222, 128, 0); }
    100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  }
  .place-text {
    white-space: nowrap;
  }
  .place-done {
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-family: var(--pdf-lab-font);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .place-done:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  /* ANNOTATIONS — render as the actual text would appear, no chrome
     until hover. The dashed outline on hover is the only "this is
     interactive" cue. */
  .annotation {
    position: absolute;
    /* Stored (x, y) is the text baseline. Translate the box up so the
       baseline lands exactly at the click point — matches how pdf-lib's
       drawText positions text in the export. */
    transform: translateY(calc(-1em + 2px));
    font-family: var(--pdf-lab-font);
    font-weight: 500;
    line-height: 1.1;
    padding: 1px 3px;
    border-radius: 2px;
    cursor: default;
    transition: background 0.1s ease, outline-color 0.1s ease;
    white-space: nowrap;
    outline: 1px dashed transparent;
    outline-offset: 1px;
  }

  .annotation:hover {
    background: rgba(21, 128, 61, 0.07);
    outline-color: rgba(21, 128, 61, 0.5);
  }

  .annotation-delete {
    position: absolute;
    top: -9px;
    right: -9px;
    width: 18px;
    height: 18px;
    border: none;
    background: var(--pdf-lab-danger, #c53030);
    color: white;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.7);
    transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.34, 1.5, 0.64, 1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.6);
    display: grid;
    place-items: center;
    padding: 0;
  }

  .annotation:hover .annotation-delete {
    opacity: 1;
    transform: scale(1);
  }

  .annotation-delete:hover {
    transform: scale(1.12);
  }

  .annotation-delete:active {
    transform: scale(0.92);
  }

  /* ACTIVE INPUT — feels like a typing cursor, not a form field.
     A thin primary baseline, soft tinted background, no border around
     the box. The user clicked the page; the page invited them to type. */
  .active-input-wrap {
    position: absolute;
    /* Match the committed-annotation baseline anchor so committing the
       input doesn't visually shift the text. font-size is explicit here
       because the wrapper itself doesn't carry the input's font. */
    font-size: 14px;
    transform: translateY(calc(-1em + 2px));
  }

  .active-input {
    border: none;
    background: rgba(21, 128, 61, 0.05);
    border-bottom: 1.5px solid var(--pdf-lab-primary, #15803d);
    padding: 1px 3px 2px;
    font-family: var(--pdf-lab-font);
    font-size: 14px;
    font-weight: 500;
    color: #000;
    outline: none;
    caret-color: var(--pdf-lab-primary, #15803d);
    field-sizing: content;
    min-width: 3ch;
    max-width: 50vw;
    line-height: 1.1;
    animation: inputEnter 0.16s ease-out;
  }

  @keyframes inputEnter {
    from {
      opacity: 0;
      transform: translateY(-1px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* FOOTER — quiet status line, last citizen of the visual hierarchy. */
  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem 1.25rem;
    color: rgba(255, 255, 255, 0.55);
    font-family: var(--pdf-lab-font);
    font-size: 0.75rem;
    letter-spacing: 0.015em;
    pointer-events: none;
  }

  .hint {
    transition: color 0.14s ease;
  }

  .bullet {
    color: rgba(255, 255, 255, 0.28);
  }

  .count {
    color: rgba(255, 255, 255, 0.78);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* Loading + error */
  .status {
    color: rgba(255, 255, 255, 0.7);
    font-family: var(--pdf-lab-font);
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    text-align: center;
  }

  .status-error small {
    display: block;
    margin-top: 0.25rem;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.6875rem;
    color: rgba(255, 220, 220, 0.65);
  }

  .loader {
    width: 14px;
    height: 14px;
    border: 1.5px solid rgba(255, 255, 255, 0.22);
    border-top-color: rgba(255, 255, 255, 0.78);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* FORM FIELDS — faint green slots on the page that brighten on focus, set
     apart from the chrome-less text annotations. The layer is click-through;
     only the controls catch events, so empty page areas still place text. */
  .form-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .field-slot {
    position: absolute;
    pointer-events: none;
  }

  .field-slot > * {
    pointer-events: auto;
  }

  .f-text,
  .f-select {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(21, 128, 61, 0.32);
    border-radius: 2px;
    background: rgba(74, 222, 128, 0.08);
    color: #0a0f0b;
    font-family: var(--pdf-lab-font);
    font-size: clamp(10px, 0.85em, 15px);
    line-height: 1.1;
    padding: 0 4px;
    outline: none;
    transition:
      border-color 0.12s ease,
      background 0.12s ease,
      box-shadow 0.12s ease;
  }

  textarea.f-text {
    padding: 3px 4px;
    resize: none;
    line-height: 1.25;
  }

  .f-text:hover,
  .f-select:hover {
    background: rgba(74, 222, 128, 0.13);
    border-color: rgba(21, 128, 61, 0.5);
  }

  .f-text:focus,
  .f-select:focus {
    border-color: var(--pdf-lab-primary, #15803d);
    background: rgba(74, 222, 128, 0.16);
    box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.28);
  }

  .f-select {
    cursor: pointer;
  }

  .f-check,
  .f-radio {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: 1.5px solid rgba(21, 128, 61, 0.55);
    background: rgba(255, 255, 255, 0.72);
    cursor: pointer;
    padding: 0;
    position: relative;
    transition:
      background 0.12s ease,
      border-color 0.12s ease,
      box-shadow 0.12s ease,
      transform 0.1s ease;
  }

  .f-check {
    border-radius: 3px;
    display: grid;
    place-items: center;
  }
  .f-radio {
    border-radius: 50%;
  }

  .f-check:hover,
  .f-radio:hover {
    border-color: var(--pdf-lab-primary, #15803d);
    background: rgba(74, 222, 128, 0.18);
  }
  .f-check:focus-visible,
  .f-radio:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.32);
  }
  .f-check:active,
  .f-radio:active {
    transform: scale(0.92);
  }

  .f-check.on {
    background: var(--pdf-lab-primary, #15803d);
    border-color: var(--pdf-lab-primary, #15803d);
  }
  .f-check svg {
    width: 78%;
    height: 78%;
    fill: none;
    stroke: #fff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .f-radio.on {
    border-color: var(--pdf-lab-primary, #15803d);
  }
  .f-radio.on::after {
    content: '';
    position: absolute;
    inset: 22%;
    border-radius: 50%;
    background: var(--pdf-lab-primary, #15803d);
  }

  /* required-but-empty: a quiet amber edge, never a loud error */
  .f-text.req,
  .f-select.req,
  .f-check.req {
    border-color: rgba(217, 119, 6, 0.6);
  }
  .f-text.req:focus,
  .f-select.req:focus {
    box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.25);
  }

  .f-readonly {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0 4px;
    font-family: var(--pdf-lab-font);
    font-size: clamp(10px, 0.85em, 15px);
    color: rgba(10, 15, 11, 0.55);
    background: rgba(0, 0, 0, 0.03);
    border: 1px dashed rgba(0, 0, 0, 0.15);
    border-radius: 2px;
    overflow: hidden;
    white-space: nowrap;
    pointer-events: none;
  }

  @keyframes fieldFlash {
    0% {
      box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
    }
    25% {
      box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.55);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
    }
  }
  .f-text.flash,
  .f-select.flash,
  .f-check.flash,
  .f-radio.flash {
    animation: fieldFlash 0.9s ease-out;
  }

  /* FIELD RAIL — translucent panel in the same dark language as the header;
     collapses to a vertical tab so the page can reclaim the width. */
  .field-panel {
    flex: 0 0 300px;
    display: flex;
    flex-direction: column;
    background: rgba(16, 26, 20, 0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
    transition: flex-basis 0.24s ease;
  }
  .field-panel.collapsed {
    flex-basis: 46px;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.75rem 1.25rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .panel-title {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .panel-eyebrow {
    font-family: var(--pdf-lab-font-display);
    font-weight: 700;
    font-size: 0.9375rem;
    letter-spacing: -0.01em;
    color: rgba(255, 255, 255, 0.94);
  }
  .panel-count {
    font-size: 0.6875rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(74, 222, 128, 0.85);
    font-variant-numeric: tabular-nums;
  }
  .panel-toggle {
    width: 26px;
    height: 26px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition:
      background 0.12s,
      border-color 0.12s;
  }
  .panel-toggle:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .field-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0.5rem 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .field-list li {
    margin: 0;
  }

  .field-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    border: none;
    border-radius: 7px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .field-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .row-glyph {
    flex: 0 0 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: rgba(74, 222, 128, 0.1);
    color: rgba(74, 222, 128, 0.9);
    font-size: 12px;
    font-family: var(--pdf-lab-font);
  }
  .row-main {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .row-label {
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-sub {
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .field-row.filled .row-sub {
    color: rgba(74, 222, 128, 0.8);
  }
  .field-row.req .row-sub {
    color: rgba(251, 191, 36, 0.85);
  }

  .row-state {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
  }
  .row-check {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: rgba(74, 222, 128, 0.95);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .row-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(251, 191, 36, 0.9);
  }

  .panel-note {
    margin: 0;
    padding: 0.5rem 1.25rem;
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
  }

  .panel-foot {
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .panel-reset {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 7px;
    background: transparent;
    color: rgba(255, 255, 255, 0.78);
    font-family: var(--pdf-lab-font);
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background 0.12s,
      border-color 0.12s,
      opacity 0.12s;
  }
  .panel-reset:hover:not(:disabled) {
    background: rgba(197, 48, 48, 0.16);
    border-color: rgba(197, 48, 48, 0.5);
    color: #fff;
  }
  .panel-reset:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .panel-tab {
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    color: rgba(255, 255, 255, 0.7);
    transition: background 0.12s;
  }
  .panel-tab:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .tab-label {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-family: var(--pdf-lab-font-display);
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    color: rgba(74, 222, 128, 0.85);
  }
  .tab-count {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 5px;
    padding: 1px 5px;
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .frame,
    .active-input,
    .annotation-delete,
    .field-panel,
    .f-text,
    .f-select,
    .f-check,
    .f-radio,
    .place-bar,
    .place-dot,
    .sig-resize {
      animation: none;
      transition-duration: 0s;
    }
    .loader {
      animation-duration: 1.4s;
    }
  }
</style>
