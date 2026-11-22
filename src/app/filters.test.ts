import {filterLabel, filterParam, sameFilter, valuesFor} from './filters';

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
