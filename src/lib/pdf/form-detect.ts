// Pure AcroForm-widget grouping logic, split out from the pdfjs-driving shell in
// renderer.ts so the fiddly parts — field-type classification, rect
// normalization, and grouping many widgets (radio options, repeated fields)
// into one field — are unit-testable without a real PDF.

import type { FormField, FormFieldType, FormFieldOption, FormFieldWidget } from './types.js';

/** Minimal projection of a pdfjs Widget annotation. The renderer maps each raw
 *  pdfjs object into this shape (rect already normalized to 0..1 viewport
 *  space) so everything below stays pure. */
export interface RawWidget {
  name: string;
  /** pdfjs /FT: 'Tx' text, 'Btn' button, 'Ch' choice, 'Sig' signature. */
  fieldType: string;
  radioButton?: boolean;
  pushButton?: boolean;
  /** Choice subtype: true = dropdown (combo), false = listbox. */
  combo?: boolean;
  readOnly?: boolean;
  required?: boolean;
  multiline?: boolean;
  maxLen?: number;
  /** Friendly /TU name when present. */
  label?: string;
  /** Checkbox/radio: the value this widget turns the field on to. */
  onValue?: string;
  /** Choice options (dropdown/listbox). */
  options?: FormFieldOption[];
  /** Normalized to 0..1 viewport space, origin top-left. */
  rect: { x: number; y: number; width: number; height: number };
  pageIndex: number;
}

/** Map a raw widget to a fillable field type, or null for things v1 can't fill
 *  (push buttons carry actions, signatures need real crypto). */
export function classifyField(raw: RawWidget): FormFieldType | null {
  switch (raw.fieldType) {
    case 'Tx':
      return 'text';
    case 'Ch':
      return raw.combo ? 'dropdown' : 'listbox';
    case 'Btn':
      if (raw.pushButton) return null;
      return raw.radioButton ? 'radio' : 'checkbox';
    default:
      return null;
  }
}

/** Convert a viewport-space rect (device px, origin top-left) to 0..1 coords.
 *  Tolerates unordered corners — pdfjs convertToViewportRectangle can return
 *  x2<x1 / y2<y1 once page rotation is folded in. */
export function normalizeRect(
  vrect: [number, number, number, number],
  vpWidth: number,
  vpHeight: number
): { x: number; y: number; width: number; height: number } {
  const [a, b, c, d] = vrect;
  const x1 = Math.min(a, c);
  const x2 = Math.max(a, c);
  const y1 = Math.min(b, d);
  const y2 = Math.max(b, d);
  const w = vpWidth || 1;
  const h = vpHeight || 1;
  return { x: x1 / w, y: y1 / h, width: (x2 - x1) / w, height: (y2 - y1) / h };
}

/** Group raw widgets into fields keyed by AcroForm name. The first widget seen
 *  for a name fixes the field's type and flags; later widgets only add
 *  placements — multiple pages for a repeated field, or the separate buttons of
 *  a radio group (each contributing one selectable option). Input order is
 *  preserved so the sidebar lists fields in document order. */
export function buildFormFields(raws: RawWidget[]): FormField[] {
  const byName = new Map<string, FormField>();
  const order: string[] = [];

  for (const raw of raws) {
    if (!raw.name) continue;
    const type = classifyField(raw);
    if (!type) continue;

    let field = byName.get(raw.name);
    if (!field) {
      field = {
        name: raw.name,
        type,
        label: raw.label,
        readOnly: Boolean(raw.readOnly),
        required: Boolean(raw.required),
        multiline: type === 'text' ? Boolean(raw.multiline) : undefined,
        maxLen: type === 'text' && raw.maxLen && raw.maxLen > 0 ? raw.maxLen : undefined,
        options:
          type === 'dropdown' || type === 'listbox'
            ? (raw.options ?? [])
            : type === 'radio'
              ? []
              : undefined,
        widgets: []
      };
      byName.set(raw.name, field);
      order.push(raw.name);
    }

    const widget: FormFieldWidget = { pageIndex: raw.pageIndex, rect: raw.rect };
    if (raw.onValue !== undefined) widget.onValue = raw.onValue;
    field.widgets.push(widget);

    // Each radio button is its own widget; its on-value is one selectable option.
    if (field.type === 'radio' && raw.onValue && !field.options!.some((o) => o.value === raw.onValue)) {
      field.options!.push({ value: raw.onValue, label: raw.onValue });
    }
  }

  return order.map((name) => byName.get(name)!);
}
