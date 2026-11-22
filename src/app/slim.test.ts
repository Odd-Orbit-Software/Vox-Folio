import type {LibraryItem} from '../abs/types';
import {slimItem} from './slim';

const big = {
	id: 'b', libraryId: 'l', mediaType: 'book',
	media: {
		coverPath: '/c', duration: 3600, numChapters: 40, chapters: new Array(40).fill({title: 'x'.repeat(50)}),
		metadata: {title: 'T', authorName: 'A', narratorName: 'N', seriesName: 'S #1', description: 'd'.repeat(5000), genres: ['g']}
	}
} as unknown as LibraryItem;

test('keeps what Home draws and drops the rest', () => {
	const s = slimItem(big);
	expect(s.media.metadata).toEqual(expect.objectContaining({title: 'T', authorName: 'A', narratorName: 'N', seriesName: 'S #1'}));
	expect(s.media.coverPath).toBe('/c');
	expect(s.media.duration).toBe(3600);
	expect(JSON.stringify(s).length).toBeLessThan(JSON.stringify(big).length / 20);
});

test('series entries keep their name and books', () => {
	const series = {id: 's', name: 'Series', books: [big, big]} as unknown as LibraryItem;
	const s = slimItem(series) as unknown as {name: string; books: LibraryItem[]};
	expect(s.name).toBe('Series');
	expect(s.books).toHaveLength(2);
	expect(s.books[0].media.coverPath).toBe('/c');
});
