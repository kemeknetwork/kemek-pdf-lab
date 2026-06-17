<script lang="ts">
  import { dndzone } from 'svelte-dnd-action';
  import type { PageInfo } from '$lib/pdf/types.js';
  import PageThumbnail from './PageThumbnail.svelte';
  import { getGridMinWidth } from '$lib/stores/preferences.svelte.js';

  interface Props {
    pages: PageInfo[];
    selection: Set<string>;
    onreorder: (newPages: PageInfo[]) => void;
    onselect: (pageId: string, event: MouseEvent) => void;
    onlabel: (pageId: string, label: string | undefined) => void;
    onpreview: (pageId: string) => void;
  }

  let { pages, selection, onreorder, onselect, onlabel, onpreview }: Props = $props();

  // DnD consider events mutate dndItems for in-flight visual feedback only;
  // the store is updated on finalize.
  let dndItems = $state<PageInfo[]>([]);
  let gridEl = $state<HTMLDivElement | null>(null);
  let focusedId = $state<string | null>(null);

  $effect(() => {
    dndItems = pages.map((p) => ({ ...p }));
  });

  let gridMinWidth = $derived(getGridMinWidth());

  // First thumbnail anchors Tab entry; once the user navigates, focusedId
  // pins the roving tabindex to wherever they left off.
  let effectiveFocusId = $derived.by(() => {
    if (focusedId && dndItems.some((p) => p.id === focusedId)) return focusedId;
    return dndItems[0]?.id ?? null;
  });

  function handleDndConsider(e: CustomEvent<{ items: PageInfo[] }>) {
    dndItems = e.detail.items;
  }

  // svelte-dnd-action attaches extra DnD-internal props to each item; strip
  // them to the known PageInfo shape before committing to the store.
  function handleDndFinalize(e: CustomEvent<{ items: PageInfo[] }>) {
    const cleaned: PageInfo[] = e.detail.items.map((item) => ({
      id: item.id,
      sourceDocumentId: item.sourceDocumentId,
      originalIndex: item.originalIndex,
      rotation: item.rotation,
      ...(item.label !== undefined ? { label: item.label } : {})
    }));
    dndItems = cleaned;
    onreorder(cleaned);
  }

  // Read column count from the live layout — `auto-fill` reflows on resize
  // and grid-density changes, so the static minmax() can't be inverted.
  function getColumnCount(): number {
    if (!gridEl) return 1;
    const children = Array.from(gridEl.children) as HTMLElement[];
    if (children.length === 0) return 1;
    const firstTop = children[0].offsetTop;
    let cols = 0;
    for (const c of children) {
      if (Math.abs(c.offsetTop - firstTop) < 2) cols++;
      else break;
    }
    return cols || 1;
  }

  function focusIndex(index: number) {
    if (!gridEl) return;
    const clamped = Math.max(0, Math.min(dndItems.length - 1, index));
    const target = gridEl.children[clamped] as HTMLElement | undefined;
    if (!target) return;
    focusedId = dndItems[clamped]?.id ?? null;
    target.focus();
    target.scrollIntoView({ block: 'nearest' });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (dndItems.length === 0) return;

    // Label-edit input and any other text fields own their own keys.
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;

    const currentIdx = focusedId ? dndItems.findIndex((p) => p.id === focusedId) : -1;
    const idx = currentIdx === -1 ? 0 : currentIdx;

    let next = -1;
    switch (e.key) {
      case 'ArrowRight': next = idx + 1; break;
      case 'ArrowLeft':  next = idx - 1; break;
      case 'ArrowDown':  next = idx + getColumnCount(); break;
      case 'ArrowUp':    next = idx - getColumnCount(); break;
      case 'Home':       next = 0; break;
      case 'End':        next = dndItems.length - 1; break;
      case 'Enter':
      case ' ': {
        const id = dndItems[idx]?.id;
        if (!id) return;
        e.preventDefault();
        // Reuse the click handler's shift-vs-toggle dispatch so keyboard and
        // mouse selection share one code path.
        onselect(id, new MouseEvent('click', { shiftKey: e.shiftKey }));
        return;
      }
      default: return;
    }

    next = Math.max(0, Math.min(dndItems.length - 1, next));
    if (next === currentIdx) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    focusIndex(next);
    if (e.shiftKey) {
      const newId = dndItems[next]?.id;
      if (newId) onselect(newId, new MouseEvent('click', { shiftKey: true }));
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="page-grid"
  bind:this={gridEl}
  style:grid-template-columns="repeat(auto-fill, minmax({gridMinWidth}, 1fr))"
  use:dndzone={{
    items: dndItems,
    flipDurationMs: 200,
    dropTargetStyle: {},
    type: 'pages'
  }}
  onconsider={handleDndConsider}
  onfinalize={handleDndFinalize}
  onkeydown={handleKeydown}
>
  {#each dndItems as page, index (page.id)}
    <PageThumbnail
      {page}
      {index}
      selected={selection.has(page.id)}
      tabindex={page.id === effectiveFocusId ? 0 : -1}
      onclick={(e) => onselect(page.id, e)}
      onfocus={() => (focusedId = page.id)}
      {onlabel}
      {onpreview}
    />
  {/each}
</div>

<style>
  .page-grid {
    display: grid;
    gap: 0.5rem;
    padding: 1.25rem;
    overflow-y: auto;
    flex: 1;
    align-content: start;
    background:
      radial-gradient(circle at 1px 1px, var(--pdf-lab-grid-dot) 1px, transparent 0) 0 0 / 20px 20px;
  }

  @media (max-width: 560px) {
    .page-grid {
      padding: 0.75rem;
      gap: 0.4375rem;
    }
  }
</style>
