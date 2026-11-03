<script lang="ts">
  import { Undo2, Redo2, Download, Plus, Scissors, Stamp, ImageDown, Hash, FileLock, FileSearch, FileText, Combine } from 'lucide-svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  interface Props {
    canUndo: boolean;
    canRedo: boolean;
    exporting: boolean;
    selectedCount: number;
    pageCount: number;
    watermarkActive: boolean;
    stampActive: boolean;
    flattenActive: boolean;
    /** True when 2+ loaded documents still have pages — gates the Alternate op. */
    alternateEligible: boolean;
    onundo: () => void;
    onredo: () => void;
    onexport: () => void;
    onsplit: () => void;
    onaddfile: () => void;
    onalternate: () => void;
    onwatermark: () => void;
    onextractimages: () => void;
    onextracttext: () => void;
    oninspect: () => void;
    onstamp: () => void;
    onflatten: () => void;
  }

  let { canUndo, canRedo, exporting, selectedCount, pageCount, watermarkActive, stampActive, flattenActive, alternateEligible, onundo, onredo, onexport, onsplit, onaddfile, onalternate, onwatermark, onextractimages, onextracttext, oninspect, onstamp, onflatten }: Props = $props();
</script>

<header class="toolbar">
  <div class="toolbar-left">
    <div class="toolbar-logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <line x1="9" y1="17" x2="13" y2="17"/>
      </svg>
    </div>
    <h1 class="toolbar-title"><span class="title-kemek">KeMeK</span> <span class="title-pdflab">PDF Lab</span></h1>
  </div>

  <div class="toolbar-actions">
    <ThemeToggle />

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button
        class="toolbar-btn icon-only"
        disabled={!canUndo}
        onclick={onundo}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={18} />
      </button>
      <button
        class="toolbar-btn icon-only"
        disabled={!canRedo}
        onclick={onredo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={18} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn" onclick={onaddfile} title="Add PDF file">
      <Plus size={18} />
      <span>Add File</span>
    </button>

    <button
      class="toolbar-btn"
      disabled={pageCount === 0 || exporting}
      onclick={onsplit}
      title="Split into separate files, or extract selected pages"
    >
      <Scissors size={18} />
      <span>Split</span>
    </button>

    {#if alternateEligible}
      <button
        class="toolbar-btn"
        onclick={onalternate}
        title="Alternate & mix: interleave two documents page-by-page (e.g. scanner fronts + backs)"
      >
        <Combine size={18} />
        <span>Alternate</span>
      </button>
    {/if}

    <button
      class="toolbar-btn"
      disabled={pageCount === 0 || exporting}
      onclick={onextractimages}
      title="Extract the embedded images from the PDF"
    >
      <ImageDown size={18} />
      <span>Images</span>
    </button>

    <button
      class="toolbar-btn"
      disabled={pageCount === 0 || exporting}
      onclick={onextracttext}
      title="Extract the selectable text to a .txt file"
    >
      <FileText size={18} />
      <span>Text</span>
    </button>

    <button
      class="toolbar-btn"
      disabled={pageCount === 0}
      onclick={oninspect}
      title="See what metadata this PDF carries (author, dates, producer…)"
    >
      <FileSearch size={18} />
      <span>Inspect</span>
    </button>

    <button
      class="toolbar-btn"
      class:active={watermarkActive}
      onclick={onwatermark}
      title={watermarkActive ? 'Watermark active — click to edit' : 'Add a watermark to the export'}
    >
      <Stamp size={18} />
      <span>Watermark</span>
      {#if watermarkActive}<span class="active-dot" aria-hidden="true"></span>{/if}
    </button>

    <button
      class="toolbar-btn"
      class:active={stampActive}
      disabled={pageCount === 0}
      onclick={onstamp}
      title={stampActive ? 'Page numbers active — click to edit' : 'Add page numbers or a header/footer stamp'}
    >
      <Hash size={18} />
      <span>Number</span>
      {#if stampActive}<span class="active-dot" aria-hidden="true"></span>{/if}
    </button>

    <button
      class="toolbar-btn"
      class:active={flattenActive}
      disabled={pageCount === 0}
      onclick={onflatten}
      title={flattenActive
        ? 'Form fields will be flattened (locked, non-editable) on export — click to turn off'
        : 'Flatten form fields so the exported PDF can’t be edited'}
    >
      <FileLock size={18} />
      <span>Flatten</span>
      {#if flattenActive}<span class="active-dot" aria-hidden="true"></span>{/if}
    </button>

    <button
      class="toolbar-btn primary"
      disabled={exporting}
      onclick={onexport}
      title="Export all pages as merged PDF"
    >
      <Download size={18} />
      <span>Export</span>
    </button>
  </div>
</header>

<style>
  /* Wraps instead of overflowing: the full row needs ~1300px, and between the
     old 820px stack breakpoint and that width it ran off the right edge — Export,
     the primary action, sat past the viewport with no way to scroll to it (measured
     at 960px). Now the controls drop to a second row wherever they don't fit, and
     the single row keeps its 52px height wherever they do. */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.5rem 1rem;
    min-height: 3.25rem;
    background: var(--pdf-lab-surface);
    border-bottom: 1px solid var(--pdf-lab-border);
    flex-shrink: 0;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-logo {
    color: var(--pdf-lab-primary);
    display: flex;
    align-items: center;
  }

  .toolbar-title {
    font-family: var(--pdf-lab-font-display);
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
    margin: 0;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .title-kemek {
    color: var(--pdf-lab-primary);
  }

  .title-pdflab {
    color: var(--pdf-lab-text);
  }

  .toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4375rem 0.25rem;
  }

  .toolbar-group {
    display: flex;
    gap: 1px;
  }

  .toolbar-group .toolbar-btn {
    border-radius: 0;
  }

  .toolbar-group .toolbar-btn:first-child {
    border-radius: 6px 0 0 6px;
  }

  .toolbar-group .toolbar-btn:last-child {
    border-radius: 0 6px 6px 0;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    padding: 0.4375rem 0.8125rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
    height: 2.25rem;
    white-space: nowrap;
  }

  .toolbar-btn.icon-only {
    padding: 0.4375rem 0.5625rem;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: var(--pdf-lab-surface-hover);
    border-color: var(--pdf-lab-border-strong);
  }

  .toolbar-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .toolbar-btn:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 1px;
  }

  .toolbar-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .toolbar-btn.active {
    color: var(--pdf-lab-primary);
    border-color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
    position: relative;
  }

  .toolbar-btn.active:hover:not(:disabled) {
    background: var(--pdf-lab-primary-glow);
    border-color: var(--pdf-lab-primary);
  }

  .active-dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--pdf-lab-primary);
    border: 2px solid var(--pdf-lab-surface);
  }

  .toolbar-btn.primary {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border-color: var(--pdf-lab-primary);
    font-weight: 600;
    box-shadow: var(--pdf-lab-shadow-sm);
  }

  .toolbar-btn.primary:hover:not(:disabled) {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }

  .toolbar-divider {
    width: 1px;
    height: 1.25rem;
    background: var(--pdf-lab-border);
    margin: 0 0.375rem;
  }

  /* Common laptop widths (1280–1400px) missed one row by ~30px; trimming the
     button padding keeps them on a single 52px toolbar. */
  @media (max-width: 1400px) {
    .toolbar-btn {
      padding: 0.4375rem 0.625rem;
      gap: 0.375rem;
    }
  }

  /* Below ~820px the single row can't hold the brand + 6 controls, so it
     overflowed (Export clipped, horizontal scroll). Stack it: brand on line 1,
     the nav controls wrapping onto line 2+ — no horizontal overflow. */
  @media (max-width: 820px) {
    .toolbar {
      --tb-pad-y: 0.625rem;
      --tb-pad-x: 0.875rem;
      --tb-brand-h: 1.5rem;
      position: relative;
      flex-direction: column;
      align-items: stretch;
      height: auto;
      gap: 0.5rem;
      padding: var(--tb-pad-y) var(--tb-pad-x);
    }

    .toolbar-actions {
      flex-wrap: wrap;
      justify-content: flex-start;
      row-gap: 0.4375rem;
    }

    /* Export rides in the brand row instead of wrapping onto a row of its own
       (the stacked toolbar took 195px of an 800px phone screen). It is centred on
       a fixed-height brand row and overhangs it by a few px into the padding above
       and the row gap below (both 8px+), so the row never grows to the button's
       height. `translate`, not `transform`: the shared :active press-scale is a
       transform and would otherwise knock the button out of place. Visual move
       only — DOM and tab order are unchanged, so Export is still reached last. */
    .toolbar-left {
      height: var(--tb-brand-h);
      padding-right: 7rem;
    }
    .toolbar-btn.primary {
      position: absolute;
      top: calc(var(--tb-pad-y) + var(--tb-brand-h) / 2);
      right: var(--tb-pad-x);
      translate: 0 -50%;
    }
  }

  /* Phones: tighten the wrapped controls so the stacked toolbar stays shallow and
     leaves the page grid room. Labels are kept on purpose — these file-glyph icons
     read too alike on their own. */
  @media (max-width: 560px) {
    .toolbar {
      --tb-pad-y: 0.5rem;
      --tb-pad-x: 0.75rem;
    }
    .toolbar-title {
      font-size: 0.9375rem;
    }
    .toolbar-actions {
      gap: 0.3125rem;
    }
    .toolbar-btn {
      padding: 0.375rem 0.625rem;
      font-size: 0.8125rem;
      height: 2rem;
      gap: 0.3125rem;
    }
  }
</style>
