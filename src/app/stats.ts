/* Listening stats (★ Premium): pure arithmetic over Audiobookshelf's per-day listening totals and the
   listener's finished books, so it can be tested without a server. */

import type {ListeningStats, MediaProgress} from '../abs/types';

function pad (n: number): string {
	return n < 10 ? '0' + n : String(n);
}

/** Local calendar day key, as Audiobookshelf uses: YYYY-MM-DD. */
export function dayKey (d: Date): string {
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function addDays (d: Date, n: number): Date {
	const copy = new Date(d.getTime());
	copy.setDate(copy.getDate() + n);
	return copy;
}

export interface DayBar {
	key: string;
	/** Short weekday, e.g. "Mon". */
	label: string;
	seconds: number;
}

export interface StatsSummary {
	weekSeconds: number;
	yearSeconds: number;
	totalSeconds: number;
	/** Consecutive days with listening, ending today (or yesterday, if today has none yet). */
	currentStreak: number;
	longestStreak: number;
	lastSevenDays: DayBar[];
	finishedThisYear: number;
	finishedTotal: number;
	inProgress: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function summarise (stats: ListeningStats, progress: MediaProgress[], now: Date): StatsSummary {
	const days = stats.days || {};
	const lastSevenDays: DayBar[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = addDays(now, -i);
		const key = dayKey(d);
		lastSevenDays.push({key, label: WEEKDAYS[d.getDay()], seconds: days[key] || 0});
	}
	const weekSeconds = lastSevenDays.reduce((sum, b) => sum + b.seconds, 0);

	const yearPrefix = now.getFullYear() + '-';
	let yearSeconds = 0;
	Object.keys(days).forEach((k) => {
		if (k.indexOf(yearPrefix) === 0) yearSeconds += days[k];
	});

	// Streaks over the sorted list of days with any listening.
	const listened = Object.keys(days).filter((k) => days[k] > 0).sort();
	let longestStreak = 0;
	let run = 0;
	let prev: string | null = null;
	listened.forEach((k) => {
		const expected = prev ? dayKey(addDays(new Date(prev + 'T12:00:00'), 1)) : null;
		run = expected === k ? run + 1 : 1;
		longestStreak = Math.max(longestStreak, run);
		prev = k;
	});
	let currentStreak = 0;
	let cursor = days[dayKey(now)] ? now : addDays(now, -1);
	while (days[dayKey(cursor)] > 0) {
		currentStreak += 1;
		cursor = addDays(cursor, -1);
	}

	const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
	const finished = progress.filter((p) => p.isFinished);
	return {
		weekSeconds,
		yearSeconds,
		totalSeconds: stats.totalTime || 0,
		currentStreak,
		longestStreak,
		lastSevenDays,
		finishedThisYear: finished.filter((p) => (p.finishedAt || p.lastUpdate) >= startOfYear).length,
		finishedTotal: finished.length,
		inProgress: progress.filter((p) => !p.isFinished && p.progress > 0).length
	};
}
