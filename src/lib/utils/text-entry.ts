/** Whether a key event's target is a field the user types into, so app shortcuts
 *  (R, Delete, Ctrl+Z, ?) must leave the key to it. Every <input> counts — the
 *  only one outside a dialog is a thumbnail's label field. The page editor keeps
 *  its own, narrower `editsText` (it lets a focused checkbox or button pass). */
export function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}
