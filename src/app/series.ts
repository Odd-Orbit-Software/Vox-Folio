/* Series order and "next in series", following Audiobookshelf's sequence numbers (docs/plans/product.md):
   fractional entries such as 2.5 sit between 2 and 3, and "next" is the next title available in the
   library's series order. */

import type {LibraryItem, SeriesRef} from '../abs/types';

/** The sequence string for `seriesId` on a book: from structured series data when present (full or
    expanded items), else parsed from the minified "Series Name #2.5" seriesName. */
export function sequenceOf (item: LibraryItem, seriesId: string, seriesName?: string): string | null {
	const md = item.media.metadata as {series?: SeriesRef[] | SeriesRef; seriesName?: string};
	const refs = Array.isArray(md.series) ? md.series : md.series ? [md.series] : [];
	const ref = refs.filter((r) => r.id === seriesId)[0];
	if (ref) return ref.sequence != null && ref.sequence !== '' ? String(ref.sequence) : null;
	if (seriesName && md.seriesName) {
		const parts = md.seriesName.split(', ');
		for (const part of parts) {
			if (part.indexOf(seriesName + ' #') === 0) return part.slice(seriesName.length + 2).trim() || null;
		}
	}
	return null;
}

/** Sortable number for a sequence: "2.5" → 2.5, "1-3" → 1, missing or unparseable → Infinity (last). */
export function sequenceNumber (sequence: string | null): number {
	if (!sequence) return Infinity;
	const match = /-?\d+(\.\d+)?/.exec(sequence);
	return match ? parseFloat(match[0]) : Infinity;
}

export interface SeriesEntry {
	item: LibraryItem;
	sequence: string | null;
}

/** Books in series order. Ties (two books both numbered 11) keep the server's order. */
export function orderSeries (books: LibraryItem[], seriesId: string, seriesName?: string): SeriesEntry[] {
	return books
		.map((item, index) => ({item, index, sequence: sequenceOf(item, seriesId, seriesName)}))
		.sort((a, b) => {
			const d = sequenceNumber(a.sequence) - sequenceNumber(b.sequence);
			return d !== 0 && !isNaN(d) ? d : a.index - b.index;
		})
		.map(({item, sequence}) => ({item, sequence}));
}

/** Whether a book can be played: present on disk with at least one audio file. */
export function isPlayable (item: LibraryItem): boolean {
	if (item.isMissing || item.isInvalid) return false;
	const files = item.media.numAudioFiles;
	return files === undefined || files > 0;
}

/** The book after `currentId` in series order that can be played, or null at the end of the series. */
export function nextInSeries (books: LibraryItem[], currentId: string, seriesId: string, seriesName?: string): SeriesEntry | null {
	const ordered = orderSeries(books, seriesId, seriesName);
	const at = ordered.map((e) => e.item.id).indexOf(currentId);
	if (at < 0) return null;
	for (let i = at + 1; i < ordered.length; i++) {
		if (isPlayable(ordered[i].item)) return ordered[i];
	}
	return null;
}

/** "Book 2.5", or "" without a sequence. */
export function bookLabel (sequence: string | null): string {
	return sequence ? 'Book ' + sequence : '';
}
