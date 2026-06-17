// Keyboard focus trap for modal dialogs: on Tab / Shift+Tab from the last / first
// focusable element, wrap to the other end so focus never escapes the dialog to
// the page behind it. The focusable-element selector is the shared contract — one
// definition keeps every dialog's trap behaviour identical. No-op for non-Tab keys
// or before the card has mounted. Wire it from the card's onkeydown:
//   onkeydown={(e) => trapTab(e, cardEl)}

export function trapTab(e: KeyboardEvent, cardEl: HTMLElement | null): void {
  if (e.key !== 'Tab' || !cardEl) return;
  const focusables = cardEl.querySelectorAll<HTMLElement>(
    'input, button, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
