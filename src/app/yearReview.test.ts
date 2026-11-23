import {monthsOfYear, dismissYearPrompt, normaliseYearStats, snoozeYearPrompt, summariseYear, tidyGenres, yearToPrompt} from './yearReview';

const raw = {
	totalListeningSessions: 40, totalListeningTime: 94 * 3600, totalBookListeningTime: 80 * 3600, totalPodcastListeningTime: 14 * 3600,
	topAuthors: [{name: 'Dennis E. Taylor', time: 50000}], topGenres: [{genre: 'Science Fiction', time: 1}, {genre: 'History', time: 1}],
	mostListenedNarrator: {name: 'Ray Porter', time: 1}, mostListenedMonth: {month: 10, time: 5},
	numBooksFinished: 9, numBooksListened: 12,
	longestAudiobookFinished: {id: 'b', title: 'Long', duration: 77244, finishedAt: '2026-11-21'},
	booksWithCovers: ['a', 'b', 'c'], finishedBooksWithCovers: ['b', 'd']
};

describe('year in review', () => {
	test('summarises a year for the page', () => {
		const s = summariseYear(2026, normaliseYearStats(raw), new Date(2026, 11, 31));
		expect(s.headline).toBe('94 hours');
		expect(s.perWeek).toBe('1.8 hours a week');
		expect(s.busiestMonth).toBe('November');
		expect(s.topGenres).toEqual(['Science Fiction', 'History']);
		expect(s.longest).toEqual({id: 'b', title: 'Long', hours: '21 hours'});
		// Finished books first, no repeats.
		expect(s.covers).toEqual(['b', 'd', 'a', 'c']);
		expect(Math.round(s.podcastShare * 100)).toBe(15);
		expect(s.empty).toBe(false);
	});

	test('tidies genre paths and lists', () => {
		expect(tidyGenres(['Literature & Fiction:Genre Fiction:Thriller', 'Adventure, Humorous', 'Audiobook', 'Thriller'])).toEqual(['Thriller', 'Adventure']);
	});

	test('copes with an empty or old-server answer', () => {
		const s = summariseYear(2025, normaliseYearStats({}), new Date(2026, 0, 5));
		expect(s.empty).toBe(true);
		expect(s.headline).toBe('0 minutes');
		expect(s.topAuthor).toBeNull();
		expect(s.longest).toBeNull();
	});
});

describe('the Home prompt', () => {
	test('runs from December to mid-January, for the year just gone', () => {
		expect(yearToPrompt(new Date(2026, 11, 3), 'u')).toBe(2026);
		expect(yearToPrompt(new Date(2027, 0, 10), 'u')).toBe(2026);
		expect(yearToPrompt(new Date(2027, 0, 20), 'u')).toBeNull();
		expect(yearToPrompt(new Date(2026, 10, 22), 'u')).toBeNull();
		expect(yearToPrompt(new Date(2026, 10, 22), 'u', true)).toBe(2026);
	});

	test('stays away once seen, for that listener only', () => {
		dismissYearPrompt('a', 2026);
		expect(yearToPrompt(new Date(2026, 11, 3), 'a')).toBeNull();
		expect(yearToPrompt(new Date(2026, 11, 3), 'b')).toBe(2026);
		expect(yearToPrompt(new Date(2027, 11, 3), 'a')).toBe(2027);
	});

	test('Later asks again in a week', () => {
		snoozeYearPrompt('c', new Date(2026, 11, 3));
		expect(yearToPrompt(new Date(2026, 11, 6), 'c')).toBeNull();
		expect(yearToPrompt(new Date(2026, 11, 11), 'c')).toBe(2026);
	});
});

test('totals each month of the year from the daily stats', () => {
	const m = monthsOfYear(2026, {'2026-01-03': 600, '2026-01-20': 300, '2026-11-01': 3600, '2025-11-01': 999, 'bad': 5});
	expect(m[0]).toBe(900);
	expect(m[10]).toBe(3600);
	expect(m.reduce((a, b) => a + b, 0)).toBe(4500);
});
