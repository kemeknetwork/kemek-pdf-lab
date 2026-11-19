// Keyboard focus trap for modal dialogs: on Tab / Shift+Tab from the last / first
// focusable element, wrap to the other end so focus never escapes the dialog to
// the page behind it. The focusable-element selector is the shared contract — one
// definition keeps every dialog's trap behaviour identical. No-op for non-Tab keys
// or before the card has mounted. Wire it from the card's onkeydown:
//   onkeydown={(e) => trapTab(e, cardEl)}

const FOCUSABLE = 'a[href], input, button, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** What Tab can actually land on inside `root`, in DOM order. A disabled button or
 *  a hidden file input matched the selector but can't take focus, so counting it
 *  as the last element let Tab walk straight out of the dialog. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !(el as HTMLButtonElement).disabled &&
      !el.hidden &&
      el.tabIndex >= 0 &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0
  );
}

/** Move focus into a dialog that just opened, unless something inside already
 *  has it. A trap wired to the card's keydown only runs once focus is in the
 *  card, so a dialog that never takes focus never traps: Tab walked the page
 *  behind it. The card (tabindex=-1) takes it, so the first Tab lands on its
 *  first control and a screen reader announces the dialog. */
function enterDialog(cardEl: HTMLElement | null): void {
  if (!cardEl || cardEl.contains(document.activeElement)) return;
  if (cardEl.hasAttribute('tabindex')) cardEl.focus();
  else tabbables(cardEl)[0]?.focus();
}

/** The focus contract every modal shares: remember what had focus, run `enter`
 *  a frame later (the dialog's elements are bound by then, and reads inside it
 *  aren't tracked by the calling effect), and return the cleanup that gives focus
 *  back to the opener. A dialog that takes focus and forgets to return it leaves
 *  focus on <body>, so Tab restarts from the top of the page.
 *  A dialog that mounts when it opens returns this from its mount effect; one
 *  that stays mounted behind a `visible` prop returns it while visible:
 *    $effect(() => { if (visible) return holdFocus(() => inputEl?.focus()); });
 *  so the restore runs when `visible` drops (and on unmount while open). */
export function holdFocus(enter: () => void): () => void {
  const active = document.activeElement;
  const opener = active instanceof HTMLElement ? active : null;
  requestAnimationFrame(enter);
  return () => requestAnimationFrame(() => opener?.focus());
}

/** holdFocus for a dialog whose card takes focus on open (see enterDialog):
 *  `$effect(() => holdDialogFocus(() => cardEl))`. The card is a getter, read in
 *  the deferred `enter`: reading it in the effect would re-run the effect (and
 *  restore focus) when the card binds. */
export function holdDialogFocus(card: () => HTMLElement | null): () => void {
  return holdFocus(() => enterDialog(card()));
}

export function trapTab(e: KeyboardEvent, cardEl: HTMLElement | null): void {
  if (e.key !== 'Tab' || !cardEl) return;
  const focusables = tabbables(cardEl);
  if (focusables.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  // Focus outside the card (it can start there, or a click moved it) would
  // otherwise Tab on through the page behind the modal: pull it back in. Focus on
  // the card itself (tabindex=-1, where dialogs park it) counts as outside the list.
  if (!(active instanceof HTMLElement) || !cardEl.contains(active) || !focusables.includes(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
