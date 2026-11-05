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
export function enterDialog(card: () => HTMLElement | null): void {
  // A getter, read a frame later: the card is bound by then, and reading it here
  // would make the caller's $effect re-run (and restore focus) when it binds.
  requestAnimationFrame(() => {
    const cardEl = card();
    if (!cardEl || cardEl.contains(document.activeElement)) return;
    if (cardEl.hasAttribute('tabindex')) cardEl.focus();
    else tabbables(cardEl)[0]?.focus();
  });
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
