import type {LibraryItem} from '../abs/types';
import {nextInSeries, orderSeries, sequenceNumber, sequenceOf} from './series';

const SERIES = 'rol';

function book (id: string, sequence: string | null, extra: Partial<LibraryItem> = {}, files = 1): LibraryItem {
	return {
		id,
		libraryId: 'lib',
		mediaType: 'book',
		...extra,
		media: {
			numAudioFiles: files,
			metadata: {title: id, series: sequence === null ? [] : [{id: SERIES, name: 'Rivers of London', sequence}]}
		}
	} as LibraryItem;
}

describe('sequenceOf', () => {
	it('reads structured series data (array or single object)', () => {
		expect(sequenceOf(book('a', '2.5'), SERIES)).toBe('2.5');
		const single = book('b', null);
		(single.media.metadata as unknown as {series: unknown}).series = {id: SERIES, name: 'Rivers of London', sequence: '7'};
		expect(sequenceOf(single, SERIES)).toBe('7');
	});

	it('falls back to the minified seriesName', () => {
		const minified = book('c', null);
		minified.media.metadata.seriesName = 'Other #1, Rivers of London #6.5';
		expect(sequenceOf(minified, SERIES, 'Rivers of London')).toBe('6.5');
	});

	it('returns null without a sequence', () => {
		expect(sequenceOf(book('d', ''), SERIES)).toBeNull();
	});
});

describe('sequenceNumber', () => {
	it('sorts fractional and ranged sequences, missing last', () => {
		expect(sequenceNumber('2.5')).toBe(2.5);
		expect(sequenceNumber('1-3')).toBe(1);
		expect(sequenceNumber(null)).toBe(Infinity);
		expect(sequenceNumber('prequel')).toBe(Infinity);
	});
});

describe('orderSeries', () => {
	it('orders 2, 2.5, 3 and keeps ties in server order', () => {
		const books = [book('three', '3'), book('two-five', '2.5'), book('eleven-a', '11'), book('two', '2'), book('eleven-b', '11'), book('none', null)];
		expect(orderSeries(books, SERIES).map((e) => e.item.id)).toEqual(['two', 'two-five', 'three', 'eleven-a', 'eleven-b', 'none']);
	});
});

describe('nextInSeries', () => {
	const books = [book('b2', '2'), book('b3', '3'), book('b25', '2.5')];

	it('follows the sequence through fractional entries', () => {
		expect(nextInSeries(books, 'b2', SERIES)!.item.id).toBe('b25');
		expect(nextInSeries(books, 'b25', SERIES)!.item.id).toBe('b3');
	});

	it('stops at the end of the series', () => {
		expect(nextInSeries(books, 'b3', SERIES)).toBeNull();
	});

	it('skips books that cannot be played', () => {
		const withGap = [book('b1', '1'), book('b2', '2', {isMissing: true}), book('b3', '3', {}, 0), book('b4', '4')];
		expect(nextInSeries(withGap, 'b1', SERIES)!.item.id).toBe('b4');
	});

	it('returns null for a book not in the list', () => {
		expect(nextInSeries(books, 'elsewhere', SERIES)).toBeNull();
	});
});
