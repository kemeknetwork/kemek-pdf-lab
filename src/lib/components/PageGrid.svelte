<script lang="ts">
  import { tick } from 'svelte';
  import { dndzone } from 'svelte-dnd-action';
  import type { PageInfo } from '#lib/pdf/types.js';
  import PageThumbnail from './PageThumbnail.svelte';
  import { getGridMinWidth } from '#lib/stores/preferences.svelte.js';

  interface Props {
    pages: PageInfo[];
    selection: Set<string>;
    onreorder: (order: readonly { id: string }[]) => void;
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
  let announcement = $state('');
  const instructionsId = $props.id();

  // One tab stop for the whole grid (roving tabindex). svelte-dnd-action writes
  // its own zoneItemTabIndex onto every item each time it reconfigures, from the
  // action's effect, which runs AFTER this component's effects in the same flush
  // (measured: every page ended at -1, so the grid had no tab stop at all). So
  // the roving value is applied in a microtask, once that flush is done.
  $effect(() => {
    const focusId = effectiveFocusId;
    const items = dndItems;
    const grid = gridEl;
    if (!grid) return;
    queueMicrotask(() => {
      const children = Array.from(grid.children) as HTMLElement[];
      children.forEach((el, i) => {
        el.tabIndex = items[i]?.id === focusId ? 0 : -1;
      });
      // A reorder from anywhere (undo, redo, reverse) moves the keyed nodes, and
      // moving a focused node drops focus to <body>, where the grid's keys stop
      // working. Put it back on the same page if the grid had it.
      if (gridHasFocus && document.activeElement === document.body) {
        children[items.findIndex((p) => p.id === focusId)]?.focus({ preventScroll: true });
      }
    });
  });

  let gridHasFocus = false;
  function onFocusOut(e: FocusEvent) {
    // relatedTarget is null both when a node is moved out from under focus and
    // when focus leaves to nothing; only a real move elsewhere releases it.
    const to = e.relatedTarget;
    gridHasFocus = to === null || (to instanceof Node && !!gridEl?.contains(to));
  }

  // First thumbnail anchors Tab entry; once the user navigates, focusedId
  // pins the roving tabindex to wherever they left off.
  let effectiveFocusId = $derived.by(() => {
    if (focusedId && dndItems.some((p) => p.id === focusedId)) return focusedId;
    return dndItems[0]?.id ?? null;
  });

  function handleDndConsider(e: CustomEvent<{ items: PageInfo[] }>) {
    dndItems = e.detail.items;
  }

  // Only the ORDER leaves the grid: the store rebuilds pages from its own
  // objects by id, so svelte-dnd-action's internal props never reach it and no
  // PageInfo field (annotations included) can be dropped here.
  function handleDndFinalize(e: CustomEvent<{ items: PageInfo[] }>) {
    dndItems = e.detail.items;
    onreorder(e.detail.items);
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

  function ownsKeys(target: EventTarget | null): boolean {
    // Label-edit input and any other text fields own their own keys.
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false;
    return !(target instanceof HTMLElement && target.isContentEditable);
  }

  function currentIndex(): number {
    const i = focusedId ? dndItems.findIndex((p) => p.id === focusedId) : -1;
    return i === -1 ? 0 : i;
  }

  // svelte-dnd-action answers a touch tap with a click of its own (untrusted) on
  // touchend. With delayTouchStart it no longer cancels the touch, so the
  // browser's real click follows: two clicks toggled a tapped page's selection on
  // and straight back off. Keep the library's click, which arrives even where a
  // browser withholds its own, and drop the one echo after it.
  let tapClickAt = -Infinity;
  function dropTapEcho(e: MouseEvent) {
    if (!e.isTrusted) {
      tapClickAt = performance.now();
    } else if (performance.now() - tapClickAt < 700) {
      tapClickAt = -Infinity;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  // The two touch handlers below listen on the WINDOW: once a drag starts, the
  // library moves the touched card out of the grid to <body> (measured), so
  // nothing that happens to it from then on bubbles through the grid.
  function onPageCard(target: EventTarget | null): boolean {
    return target instanceof Element && (!!gridEl?.contains(target) || !!target.closest('.thumbnail-card'));
  }

  // A still hold that outlasts the phone's long-press timeout opens the browser's
  // image menu, and the browser then cancels the touch. Touch long-presses on a
  // page get no menu (a mouse right-click still does).
  function suppressTouchMenu(e: MouseEvent) {
    if ((e as PointerEvent).pointerType === 'touch' && onPageCard(e.target)) e.preventDefault();
  }

  // svelte-dnd-action ends a drag on touchend only, never touchcancel, so a touch
  // the browser or the OS cancelled left the lifted page floating until the next
  // touch dropped it somewhere. Hand it the touchend it waits for: a drag drops
  // where it is, and a hold still waiting to become one is called off.
  function endCancelledTouch(e: TouchEvent) {
    if (!onPageCard(e.target)) return;
    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
  }

  // Space and Enter are taken in the CAPTURE phase: svelte-dnd-action listens on
  // each item and stops propagation, so by bubbling time they had already become
  // "start a keyboard drag" and the selection handler below never saw them.
  // Keyboard reordering is Ctrl/⌘+arrows instead (moveFocused).
  function handleKeydownCapture(e: KeyboardEvent) {
    if (dndItems.length === 0 || !ownsKeys(e.target)) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const id = dndItems[currentIndex()]?.id;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Enter') {
      onpreview(id);
      return;
    }
    // Reuse the click handler's shift-vs-toggle dispatch so keyboard and
    // mouse selection share one code path.
    onselect(id, new MouseEvent('click', { shiftKey: e.shiftKey }));
  }

  async function moveFocused(from: number, to: number) {
    to = Math.max(0, Math.min(dndItems.length - 1, to));
    if (to === from) return;
    const order = dndItems.map((p) => ({ id: p.id }));
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    onreorder(order);
    await tick();
    focusIndex(to);
    announcement = `Moved to position ${to + 1} of ${order.length}`;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (dndItems.length === 0) return;
    if (!ownsKeys(e.target)) return;

    const currentIdx = focusedId ? dndItems.findIndex((p) => p.id === focusedId) : -1;
    const idx = currentIdx === -1 ? 0 : currentIdx;

    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -getColumnCount() : getColumnCount();
      void moveFocused(idx, idx + step);
      return;
    }

    let next = -1;
    switch (e.key) {
      case 'ArrowRight': next = idx + 1; break;
      case 'ArrowLeft':  next = idx - 1; break;
      case 'ArrowDown':  next = idx + getColumnCount(); break;
      case 'ArrowUp':    next = idx - getColumnCount(); break;
      case 'Home':       next = 0; break;
      case 'End':        next = dndItems.length - 1; break;
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

<svelte:window ontouchcancel={endCancelledTouch} oncontextmenu={suppressTouchMenu} />

<!-- The library's own ARIA describes its Space/Enter keyboard drag, which this
     grid replaces, so it is off and the listbox semantics are set here. -->
<div
  class="page-grid"
  bind:this={gridEl}
  role="listbox"
  aria-label="Pages"
  aria-multiselectable="true"
  aria-describedby="grid-help-{instructionsId}"
  tabindex="-1"
  style:grid-template-columns="repeat(auto-fill, minmax({gridMinWidth}, 1fr))"
  use:dndzone={{
    items: dndItems,
    flipDurationMs: 200,
    dropTargetStyle: {},
    type: 'pages',
    zoneTabIndex: -1,
    zoneItemTabIndex: -1,
    autoAriaDisabled: true,
    // On touch, a drag starts only after a 300 ms hold; a finger that moves
    // first is scrolling. Without it every touch on a thumbnail was taken for
    // a drag, and on a phone thumbnails cover nearly all of the grid, so the
    // pages could hardly be scrolled. 300 ms is longer than a swipe takes to
    // move and short enough to feel like a press; the browser's own long-press
    // menu is suppressed separately (suppressTouchMenu).
    delayTouchStart: 300
  }}
  onconsider={handleDndConsider}
  onfinalize={handleDndFinalize}
  onclickcapture={dropTapEcho}
  onkeydowncapture={handleKeydownCapture}
  onkeydown={handleKeydown}
  onfocusin={() => (gridHasFocus = true)}
  onfocusout={onFocusOut}
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
<p class="sr-only" id="grid-help-{instructionsId}">
  Arrow keys move between pages. Space selects, Enter opens the page editor, F2 renames,
  Control or Command with an arrow key moves the page.
</p>
<p class="sr-only" aria-live="polite">{announcement}</p>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

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
