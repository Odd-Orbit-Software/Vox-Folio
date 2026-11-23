/* Library filters. Audiobookshelf takes one filter at a time as "<group>.<base64 value>", so a
   combination (a progress state and one genre, narrator, tag or language) sends the metadata filter to
   the server and applies the progress filter here, against the listener's own progress. */

import type {FilterData, LibraryItem, MediaProgress} from '../abs/types';

export type FilterGroup = 'progress' | 'genres' | 'tags' | 'narrators' | 'languages';

export interface LibraryFilter {
	group: FilterGroup;
	/** What the listener picked (also its label). */
	value: string;
	/** The server's own values this stands for: genres saved as "Adventure, Humour" and languages
	    spelled "eng" or "english" are tidied into one choice that covers them all. */
	sources?: string[];
}

export interface FilterValue {
	value: string;
	label: string;
	sources: string[];
}

export const PROGRESS_CHOICES: {value: string; label: string}[] = [
	{value: 'not-started', label: 'Not started'},
	{value: 'in-progress', label: 'In progress'},
	{value: 'finished', label: 'Finished'}
];

export const GROUPS: {id: FilterGroup; label: string}[] = [
	{id: 'progress', label: 'Progress'},
	{id: 'genres', label: 'Genre'},
	{id: 'narrators', label: 'Narrator'},
	{id: 'tags', label: 'Tag'},
	{id: 'languages', label: 'Language'}
];

/** Base64 of UTF-8 text, the way Audiobookshelf encodes filter values. */
export function encodeValue (value: string): string {
	return window.btoa(unescape(encodeURIComponent(value)));
}

/** The server filter for one of a filter's sources (the value itself when it has none). */
export function filterParam (f: LibraryFilter | null, source?: string): string | undefined {
	if (!f) return undefined;
	return f.group + '.' + encodeValue(source !== undefined ? source : sourcesOf(f)[0]);
}

export function sourcesOf (f: LibraryFilter): string[] {
	return f.sources && f.sources.length ? f.sources : [f.value];
}

export function filterLabel (f: LibraryFilter): string {
	if (f.group === 'progress') {
		const c = PROGRESS_CHOICES.filter((p) => p.value === f.value)[0];
		return c ? c.label : f.value;
	}
	return f.value;
}

const LANGUAGES: Record<string, string> = {
	eng: 'English', en: 'English', fre: 'French', fra: 'French', fr: 'French', ger: 'German', deu: 'German', de: 'German',
	spa: 'Spanish', es: 'Spanish', ita: 'Italian', it: 'Italian', dut: 'Dutch', nld: 'Dutch', nl: 'Dutch',
	por: 'Portuguese', pt: 'Portuguese', gle: 'Irish', ga: 'Irish', jpn: 'Japanese', ja: 'Japanese'
};

/** One display name for a language however the server spells it ("eng", "english", "English"). */
export function languageName (raw: string): string {
	const t = raw.trim();
	const known = LANGUAGES[t.toLowerCase()];
	if (known) return known;
	return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** The parts of a genre the server saved as one comma-separated string. */
export function genreParts (raw: string): string[] {
	return raw.split(/\s*[,;]\s*/).map((p) => p.trim()).filter(Boolean);
}

/** The values offered for a group, tidied and sorted for browsing; empty groups are hidden by the caller. */
export function valuesFor (group: FilterGroup, data: FilterData | null): FilterValue[] {
	if (group === 'progress') return PROGRESS_CHOICES.map((p) => ({...p, sources: [p.value]}));
	if (!data) return [];
	const byLabel: Record<string, FilterValue> = {};
	const add = (label: string, source: string) => {
		const k = label.toLowerCase();
		if (!byLabel[k]) byLabel[k] = {value: label, label, sources: []};
		if (byLabel[k].sources.indexOf(source) === -1) byLabel[k].sources.push(source);
	};
	data[group].forEach((raw) => {
		// "Audiobook" isn't a genre: some sources tag every title with it.
		if (group === 'genres') genreParts(raw).filter((part) => !/^audio ?books?$/i.test(part)).forEach((part) => add(part, raw));
		else if (group === 'languages') add(languageName(raw), raw);
		else add(raw, raw);
	});
	return Object.keys(byLabel).map((k) => byLabel[k]).sort((a, b) => a.label.localeCompare(b.label));
}

export function sameFilter (a: LibraryFilter | null, b: LibraryFilter | null): boolean {
	return a === b || Boolean(a && b && a.group === b.group && a.value === b.value);
}

/** What's applied: at most one progress state and one metadata value. */
export interface Filters {
	progress: string | null;
	meta: LibraryFilter | null;
}

export const NO_FILTERS: Filters = {progress: null, meta: null};

export function hasFilters (f: Filters): boolean {
	return Boolean(f.progress || f.meta);
}

export function sameFilters (a: Filters, b: Filters): boolean {
	return a.progress === b.progress && sameFilter(a.meta, b.meta);
}

export function progressLabel (value: string): string {
	const c = PROGRESS_CHOICES.filter((p) => p.value === value)[0];
	return c ? c.label : value;
}

/** "In progress · Adventure" for the chip and the panel. */
export function filtersLabel (f: Filters): string {
	return [f.progress ? progressLabel(f.progress) : '', f.meta ? f.meta.value : ''].filter(Boolean).join(' · ');
}

/** Whether a book is in the given progress state, from the listener's progress map. */
export function progressMatches (item: LibraryItem, progress: string, map: Record<string, MediaProgress>): boolean {
	const p = map[item.id];
	const finished = Boolean(p && p.isFinished);
	const started = Boolean(p && !p.isFinished && (p.progress > 0 || p.currentTime > 0));
	if (progress === 'finished') return finished;
	if (progress === 'in-progress') return started;
	if (progress === 'not-started') return !finished && !started;
	return !finished;
}

/** Whether a book carries any of a filter value's server spellings. */
export function itemHas (item: LibraryItem, group: FilterGroup, sources: string[]): boolean {
	const md = item.media.metadata as {genres?: string[]; narratorName?: string; language?: string | null};
	if (group === 'genres') return (md.genres || []).some((g) => sources.indexOf(g) !== -1);
	if (group === 'narrators') return (md.narratorName || '').split(/\s*,\s*/).some((n) => sources.indexOf(n) !== -1);
	if (group === 'tags') return ((item.media as {tags?: string[]}).tags || []).some((t) => sources.indexOf(t) !== -1);
	if (group === 'languages') return Boolean(md.language) && sources.indexOf(md.language as string) !== -1;
	return false;
}

/** How many books each value would show, counted within the other active filter (so with "In
    progress" chosen, the genre counts are of books in progress). */
export function countValues (items: LibraryItem[], group: FilterGroup, values: FilterValue[], f: Filters, map: Record<string, MediaProgress>): Record<string, number> {
	const base = group === 'progress'
		? items.filter((it) => !f.meta || itemHas(it, f.meta.group, sourcesOf(f.meta)))
		: items.filter((it) => !f.progress || progressMatches(it, f.progress, map));
	const out: Record<string, number> = {};
	values.forEach((v) => {
		out[v.value] = base.filter((it) => (group === 'progress' ? progressMatches(it, v.value, map) : itemHas(it, group, v.sources))).length;
	});
	return out;
}

/** The letter a value is filed under, for jumping through long lists: A–Z, or # for anything else. */
export function letterOf (label: string): string {
	// É files under E, Ø under O; other scripts keep their own first letter; digits and symbols are #.
	const c = label.trim().charAt(0).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
	const fold: Record<string, string> = {Ø: 'O', Ł: 'L', Æ: 'A', Œ: 'O', ß: 'S'};
	const k = fold[c] || c;
	if (!k || /[0-9\s\p{P}\p{S}]/u.test(k)) return '#';
	return k;
}

/** The first row of the next (dir 1) or previous (dir -1) letter, or null at either end. */
export function letterJump (labels: string[], at: number, dir: 1 | -1): number | null {
	const here = letterOf(labels[at] || '');
	if (dir === 1) {
		for (let i = at + 1; i < labels.length; i++) if (letterOf(labels[i]) !== here) return i;
		return null;
	}
	let i = at;
	while (i > 0 && letterOf(labels[i - 1]) === here) i--;
	if (i === 0) return null;
	const prev = letterOf(labels[i - 1]);
	while (i > 0 && letterOf(labels[i - 1]) === prev) i--;
	return i;
}

/** The empty state for filters with no matches, worded for what was asked. */
export function noMatchText (f: Filters): string {
	if (f.progress && f.meta) return 'Nothing matches ' + filtersLabel(f) + ' in this library.';
	if (f.progress) {
		if (f.progress === 'in-progress') return 'Nothing in progress in this library.';
		if (f.progress === 'finished') return "You haven't finished a book in this library yet.";
		return "You've started every book in this library.";
	}
	if (f.meta && f.meta.group === 'narrators') return 'No books read by ' + f.meta.value + ' here.';
	return 'No ' + (f.meta ? f.meta.value : '') + ' books in this library.';
}
