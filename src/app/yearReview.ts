/* Year in Review: Audiobookshelf's per-year listening summary (/api/me/stats/year/{year}), shaped
   for a TV page. */

export interface YearStats {
	totalListeningSessions: number;
	/** Seconds. */
	totalListeningTime: number;
	totalBookListeningTime: number;
	totalPodcastListeningTime: number;
	topAuthors: {name: string; time: number}[];
	topGenres: {genre: string; time: number}[];
	mostListenedNarrator: {name: string; time: number} | null;
	/** month is 0–11. */
	mostListenedMonth: {month: number; time: number} | null;
	numBooksFinished: number;
	numBooksListened: number;
	longestAudiobookFinished: {id: string; title: string; duration: number; finishedAt: string} | null;
	/** Item IDs with covers: everything listened to, and what was finished. */
	booksWithCovers: string[];
	finishedBooksWithCovers: string[];
}

export interface YearSummary {
	year: number;
	hours: number;
	/** "94 hours", or "45 minutes" for a light year. */
	headline: string;
	/** Hours per week, averaged over the weeks of the year so far ('' when under a minute). */
	perWeek: string;
	booksFinished: number;
	booksListened: number;
	podcastShare: number;
	topAuthor: string | null;
	topNarrator: string | null;
	topGenres: string[];
	busiestMonth: string | null;
	longest: {id: string; title: string; hours: string} | null;
	/** Covers to show, finished books first, at most 12. */
	covers: string[];
	empty: boolean;
}

/** Audible-style genres arrive as paths ("Literature & Fiction:Genre Fiction:Thriller") or lists
    ("Adventure, Humorous"): keep the most specific name, once each. */
export function tidyGenres (genres: string[]): string[] {
	const out: string[] = [];
	genres.forEach((g) => {
		const leaf = (g.split(':').pop() || '').split(/\s*[,;]\s*/)[0].trim();
		if (leaf && !/^audio ?books?$/i.test(leaf) && out.indexOf(leaf) === -1) out.push(leaf);
	});
	return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function hoursText (seconds: number): string {
	if (seconds < 3600) return Math.max(0, Math.round(seconds / 60)) + ' minutes';
	const h = Math.round(seconds / 3600);
	return h + (h === 1 ? ' hour' : ' hours');
}

/** Normalise whatever the server sent (older servers omit fields). */
export function normaliseYearStats (raw: Partial<YearStats> | null): YearStats {
	const r = raw || {};
	return {
		totalListeningSessions: r.totalListeningSessions || 0,
		totalListeningTime: r.totalListeningTime || 0,
		totalBookListeningTime: r.totalBookListeningTime || 0,
		totalPodcastListeningTime: r.totalPodcastListeningTime || 0,
		topAuthors: r.topAuthors || [],
		topGenres: r.topGenres || [],
		mostListenedNarrator: r.mostListenedNarrator && r.mostListenedNarrator.name ? r.mostListenedNarrator : null,
		mostListenedMonth: r.mostListenedMonth && r.mostListenedMonth.time ? r.mostListenedMonth : null,
		numBooksFinished: r.numBooksFinished || 0,
		numBooksListened: r.numBooksListened || 0,
		longestAudiobookFinished: r.longestAudiobookFinished || null,
		booksWithCovers: r.booksWithCovers || [],
		finishedBooksWithCovers: r.finishedBooksWithCovers || []
	};
}

export function summariseYear (year: number, s: YearStats, now: Date): YearSummary {
	const start = new Date(year, 0, 1).getTime();
	const end = Math.min(now.getTime(), new Date(year + 1, 0, 1).getTime());
	const weeks = Math.max(1, (end - start) / (7 * 24 * 3600 * 1000));
	const perWeekSecs = s.totalListeningTime / weeks;
	const covers: string[] = [];
	s.finishedBooksWithCovers.concat(s.booksWithCovers).forEach((id) => {
		if (covers.indexOf(id) === -1 && covers.length < 12) covers.push(id);
	});
	const longest = s.longestAudiobookFinished;
	return {
		year,
		hours: s.totalListeningTime / 3600,
		headline: hoursText(s.totalListeningTime),
		perWeek: perWeekSecs >= 3600 ? (Math.round(perWeekSecs / 360) / 10) + ' hours a week' : perWeekSecs >= 60 ? Math.round(perWeekSecs / 60) + ' minutes a week' : '',
		booksFinished: s.numBooksFinished,
		booksListened: s.numBooksListened,
		podcastShare: s.totalListeningTime ? s.totalPodcastListeningTime / s.totalListeningTime : 0,
		topAuthor: s.topAuthors.length ? s.topAuthors[0].name : null,
		topNarrator: s.mostListenedNarrator ? s.mostListenedNarrator.name : null,
		topGenres: tidyGenres(s.topGenres.map((g) => g.genre)).slice(0, 3),
		busiestMonth: s.mostListenedMonth ? MONTHS[s.mostListenedMonth.month] || null : null,
		longest: longest ? {id: longest.id, title: longest.title, hours: hoursText(longest.duration)} : null,
		covers,
		empty: s.totalListeningTime < 60
	};
}
