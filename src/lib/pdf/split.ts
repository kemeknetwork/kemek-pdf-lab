// Pure page-grouping for "split into N files". The grouping is the testable
// core; the caller renders each group to a PDF (mergePdf) and zips them.
//
// Operates on the current working page list (the assembled/reordered pages the
// user sees), not the original source documents — so a split reflects what's on
// screen, consistent with how export already works.

import type { PageInfo } from './types.js';

export type SplitMode = { kind: 'each' } | { kind: 'chunk'; size: number };

export interface SplitGroup {
	pages: PageInfo[];
	/** Filename suffix for this group, e.g. "page-03" or "pages-01-05". */
	suffix: string;
}

// Zero-pad to the page-count width so the resulting files sort naturally in the
// archive / file manager (page-01 … page-10, not page-1, page-10, page-2).
function pad(n: number, width: number): string {
	return String(n).padStart(width, '0');
}

export function splitGroups(pages: PageInfo[], mode: SplitMode): SplitGroup[] {
	if (pages.length === 0) return [];
	const width = String(pages.length).length;

	if (mode.kind === 'each') {
		return pages.map((p, i) => ({ pages: [p], suffix: `page-${pad(i + 1, width)}` }));
	}

	const size = Math.max(1, Math.floor(mode.size));
	const groups: SplitGroup[] = [];
	for (let i = 0; i < pages.length; i += size) {
		const slice = pages.slice(i, i + size);
		const start = i + 1;
		const end = i + slice.length;
		const suffix =
			start === end
				? `page-${pad(start, width)}`
				: `pages-${pad(start, width)}-${pad(end, width)}`;
		groups.push({ pages: slice, suffix });
	}
	return groups;
}
