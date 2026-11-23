import type {LibraryItem} from '../abs/types';
import {genreShelves, narrators} from './LibraryViews';

const book = (id: string, genres: string[], narrator: string) => ({id, media: {metadata: {genres, narratorName: narrator}, tags: []}}) as unknown as LibraryItem;
const items = [book('a', ['Adventure, Humorous'], 'Ray Porter'), book('b', ['Adventure'], 'Kate Reading, Michael Kramer'), book('c', ['History'], 'Ray Porter')];

test('genre shelves are busiest first and hold each book once', () => {
	const shelves = genreShelves(items, {genres: ['Adventure, Humorous', 'Adventure', 'History'], tags: [], narrators: [], languages: []});
	expect(shelves.map((s) => s.genre.label)).toEqual(['Adventure', 'History', 'Humorous']);
	expect(shelves[0].books.map((b) => b.id)).toEqual(['a', 'b']);
});

test('narrators are split from shared credits and counted', () => {
	expect(narrators(items)).toEqual([
		{name: 'Kate Reading', count: 1},
		{name: 'Michael Kramer', count: 1},
		{name: 'Ray Porter', count: 2}
	]);
});
