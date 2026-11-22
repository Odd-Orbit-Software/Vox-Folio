import type {MediaProgress} from '../abs/types';
import {dayKey, summarise} from './stats';

const now = new Date(2026, 10, 22, 20, 0, 0); // Sun 22 Nov 2026, evening

function prog (isFinished: boolean, finishedAt: number | null, progress = isFinished ? 1 : 0.4): MediaProgress {
	return {libraryItemId: 'x', currentTime: 0, duration: 100, progress, isFinished, lastUpdate: finishedAt || 0, finishedAt};
}

test('day keys are local YYYY-MM-DD', () => {
	expect(dayKey(now)).toBe('2026-11-22');
});

test('week, year, total and the seven-day chart', () => {
	const s = summarise({totalTime: 50000, today: 600, days: {
		'2026-11-22': 600, '2026-11-20': 1200, '2026-11-14': 9000, '2025-12-31': 7000, '2026-01-02': 300
	}}, [], now);
	expect(s.weekSeconds).toBe(1800);
	expect(s.yearSeconds).toBe(600 + 1200 + 9000 + 300);
	expect(s.totalSeconds).toBe(50000);
	expect(s.lastSevenDays.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
	expect(s.lastSevenDays[6].seconds).toBe(600);
});

test('streaks', () => {
	const s = summarise({totalTime: 0, today: 0, days: {
		'2026-11-21': 60, '2026-11-20': 60, '2026-11-19': 60,
		'2026-10-01': 60, '2026-10-02': 60, '2026-10-03': 60, '2026-10-04': 60
	}}, [], now);
	// Nothing yet today, so the current streak counts back from yesterday.
	expect(s.currentStreak).toBe(3);
	expect(s.longestStreak).toBe(4);
});

test('streaks across a month boundary', () => {
	const s = summarise({totalTime: 0, today: 0, days: {'2026-10-31': 60, '2026-11-01': 60}}, [], now);
	expect(s.longestStreak).toBe(2);
});

test('books finished and in progress', () => {
	const s = summarise({totalTime: 0, today: 0, days: {}}, [
		prog(true, new Date(2026, 2, 1).getTime()),
		prog(true, new Date(2025, 5, 1).getTime()),
		prog(false, null),
		prog(false, null, 0)
	], now);
	expect(s.finishedThisYear).toBe(1);
	expect(s.finishedTotal).toBe(2);
	expect(s.inProgress).toBe(1);
});
