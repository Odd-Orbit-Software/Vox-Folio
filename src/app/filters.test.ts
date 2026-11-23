import {countValues, filterLabel, filterParam, filtersLabel, itemHas, letterJump, letterOf, NO_FILTERS, progressMatches, sameFilter, valuesFor} from './filters';

describe('library filters', () => {
	test('encodes the value as base64 UTF-8', () => {
		expect(filterParam({group: 'progress', value: 'finished'})).toBe('progress.ZmluaXNoZWQ=');
		expect(filterParam({group: 'narrators', value: 'Zoë'})).toBe('narrators.Wm/Dqw==');
		expect(filterParam(null)).toBeUndefined();
	});

	test('labels progress values in words', () => {
		expect(filterLabel({group: 'progress', value: 'not-started'})).toBe('Not started');
		expect(filterLabel({group: 'genres', value: 'Fantasy'})).toBe('Fantasy');
	});

	test('sorts a group\'s values', () => {
		const data = {genres: ['b', 'A', 'c'], tags: [], narrators: [], languages: []};
		expect(valuesFor('genres', data).map((v) => v.value)).toEqual(['A', 'b', 'c']);
	});

	test('splits genres saved as one string, keeping the strings to query', () => {
		const data = {genres: ['Adventure, Humorous', 'Adventure, Science Fiction', 'Humorous'], tags: [], narrators: [], languages: []};
		const v = valuesFor('genres', data);
		expect(v.map((x) => x.label)).toEqual(['Adventure', 'Humorous', 'Science Fiction']);
		expect(v[0].sources).toEqual(['Adventure, Humorous', 'Adventure, Science Fiction']);
		expect(v[1].sources).toEqual(['Adventure, Humorous', 'Humorous']);
	});

	test('merges spellings of a language', () => {
		const data = {genres: [], tags: [], narrators: [], languages: ['eng', 'English', 'english', 'fre']};
		const v = valuesFor('languages', data);
		expect(v.map((x) => x.label)).toEqual(['English', 'French']);
		expect(v[0].sources).toEqual(['eng', 'English', 'english']);
		expect(filterParam({group: 'languages', value: 'English', sources: ['eng', 'English']}, 'eng')).toBe('languages.ZW5n');
		expect(valuesFor('tags', null)).toEqual([]);
		expect(valuesFor('progress', null)).toHaveLength(3);
	});

	test('compares filters by value', () => {
		expect(sameFilter({group: 'tags', value: 'x'}, {group: 'tags', value: 'x'})).toBe(true);
		expect(sameFilter({group: 'tags', value: 'x'}, null)).toBe(false);
		expect(sameFilter(null, null)).toBe(true);
	});
});

describe('combined filters', () => {
	const book = (id: string, genres: string[], narrator: string, language = 'English') => ({id, media: {metadata: {genres, narratorName: narrator, language}, tags: []}}) as unknown as import('../abs/types').LibraryItem;
	const items = [
		book('a', ['Adventure, Humorous'], 'Ray Porter'),
		book('b', ['Adventure'], 'Kate Reading, Michael Kramer'),
		book('c', ['History'], 'Ray Porter', 'eng')
	];
	const prog = {
		a: {libraryItemId: 'a', currentTime: 100, duration: 1000, progress: 0.1, isFinished: false, lastUpdate: 0},
		c: {libraryItemId: 'c', currentTime: 1000, duration: 1000, progress: 1, isFinished: true, lastUpdate: 0}
	};

	test('progress states come from the listener\'s progress', () => {
		expect(progressMatches(items[0], 'in-progress', prog)).toBe(true);
		expect(progressMatches(items[1], 'not-started', prog)).toBe(true);
		expect(progressMatches(items[2], 'finished', prog)).toBe(true);
	});

	test('a book matches any of a value\'s server spellings', () => {
		expect(itemHas(items[0], 'genres', ['Adventure, Humorous', 'Adventure'])).toBe(true);
		expect(itemHas(items[1], 'narrators', ['Michael Kramer'])).toBe(true);
		expect(itemHas(items[2], 'languages', ['eng'])).toBe(true);
	});

	test('counts follow the other active filter', () => {
		const genres = [{value: 'Adventure', label: 'Adventure', sources: ['Adventure, Humorous', 'Adventure']}];
		expect(countValues(items, 'genres', genres, NO_FILTERS, prog).Adventure).toBe(2);
		expect(countValues(items, 'genres', genres, {progress: 'in-progress', meta: null}, prog).Adventure).toBe(1);
		const progress = valuesFor('progress', null);
		const byProgress = countValues(items, 'progress', progress, {progress: null, meta: {group: 'genres', value: 'Adventure', sources: genres[0].sources}}, prog);
		expect(byProgress['in-progress']).toBe(1);
		expect(byProgress['not-started']).toBe(1);
		expect(byProgress.finished).toBe(0);
	});

	test('labels and letter jumps', () => {
		expect(filtersLabel({progress: 'in-progress', meta: {group: 'genres', value: 'Adventure'}})).toBe('In progress · Adventure');
		const labels = ['Alan', 'Alex', 'Beau', 'Bebe', 'Ben', 'Carl'];
		expect(letterJump(labels, 0, 1)).toBe(2);
		expect(letterJump(labels, 3, 1)).toBe(5);
		expect(letterJump(labels, 5, 1)).toBeNull();
		expect(letterJump(labels, 4, -1)).toBe(0);
		expect(letterJump(labels, 1, -1)).toBeNull();
		expect(letterOf('9 to 5')).toBe('#');
		expect(letterOf('Émile Zola')).toBe('E');
		expect(letterOf('Øystein')).toBe('O');
		expect(letterOf('Борис')).toBe('Б');
	});
});
