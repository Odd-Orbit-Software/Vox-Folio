import type {AudioTrack, Chapter} from '../abs/types';
import {
	bookDuration, chapterIndexAt, formatClock, formatDuration, formatRate, locate,
	nextChapterTarget, previousChapterTarget, seekStepForRepeat, stepRate
} from './timeline';

const track = (index: number, startOffset: number, duration: number): AudioTrack => ({
	index, startOffset, duration, title: 'f' + index, contentUrl: '/f' + index, mimeType: 'audio/mpeg'
});

// Shaped like "Bad Monkey" on the test server: one file per chapter.
const tracks = [track(1, 0, 608.18), track(2, 608.18, 621.032), track(3, 1229.212, 500)];
const chapters: Chapter[] = [
	{id: 0, start: 0, end: 608.18, title: '01'},
	{id: 1, start: 608.18, end: 1229.212, title: '02'},
	{id: 2, start: 1229.212, end: 1729.212, title: '03'}
];

describe('locate', () => {
	it('maps book time into the right file', () => {
		expect(locate(tracks, 0)).toEqual({index: 0, offset: 0});
		expect(locate(tracks, 700).index).toBe(1);
		expect(locate(tracks, 700).offset).toBeCloseTo(91.82);
	});

	it('treats a file boundary as the start of the next file', () => {
		expect(locate(tracks, 608.18)).toEqual({index: 1, offset: 0});
	});

	it('clamps past the end to the end of the last file', () => {
		expect(locate(tracks, 99999)).toEqual({index: 2, offset: 500});
	});

	it('handles a single-file book', () => {
		expect(locate([track(1, 0, 3600)], 1234.5)).toEqual({index: 0, offset: 1234.5});
	});

	it('totals the book length', () => {
		expect(bookDuration(tracks)).toBeCloseTo(1729.212);
	});
});

describe('chapters', () => {
	it('finds the chapter for a time', () => {
		expect(chapterIndexAt(chapters, 0)).toBe(0);
		expect(chapterIndexAt(chapters, 608.18)).toBe(1);
		expect(chapterIndexAt(chapters, 1500)).toBe(2);
		expect(chapterIndexAt([], 10)).toBe(-1);
	});

	it('previous restarts the chapter after the first few seconds', () => {
		expect(previousChapterTarget(chapters, 700)).toBe(608.18);
	});

	it('previous goes back a chapter near its start', () => {
		expect(previousChapterTarget(chapters, 609)).toBe(0);
	});

	it('previous in the first chapter restarts it', () => {
		expect(previousChapterTarget(chapters, 1)).toBe(0);
	});

	it('next goes to the following chapter and stops at the last', () => {
		expect(nextChapterTarget(chapters, 10)).toBe(608.18);
		expect(nextChapterTarget(chapters, 1300)).toBeNull();
	});

	it('books without chapters have no chapter targets', () => {
		expect(previousChapterTarget([], 50)).toBeNull();
		expect(nextChapterTarget([], 50)).toBeNull();
	});
});

describe('speed', () => {
	it('steps by 0.05 within 0.5–2', () => {
		expect(stepRate(1, 1)).toBe(1.05);
		expect(stepRate(1.25, -1)).toBe(1.2);
		expect(stepRate(1.95, 1)).toBe(2);
		expect(stepRate(2, 1)).toBe(2);
		expect(stepRate(0.5, -1)).toBe(0.5);
	});

	it('formats rates', () => {
		expect(formatRate(1)).toBe('1.0×');
		expect(formatRate(1.25)).toBe('1.25×');
		expect(formatRate(1.3)).toBe('1.3×');
		expect(formatRate(2)).toBe('2.0×');
	});
});

describe('formatting', () => {
	it('formats clocks', () => {
		expect(formatClock(15546)).toBe('4:19:06');
		expect(formatClock(760)).toBe('12:40');
		expect(formatClock(-5)).toBe('0:00');
	});

	it('formats durations', () => {
		expect(formatDuration(22320)).toBe('6h 12m');
		expect(formatDuration(2880)).toBe('48m');
		expect(formatDuration(14)).toBe('14s');
	});

	it('accelerates held seeks', () => {
		expect(seekStepForRepeat(0)).toBe(10);
		expect(seekStepForRepeat(8)).toBe(60);
		expect(seekStepForRepeat(30)).toBe(300);
	});
});
