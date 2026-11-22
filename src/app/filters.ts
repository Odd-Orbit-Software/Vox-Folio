/* Library filters. Audiobookshelf takes one filter at a time as "<group>.<base64 value>". */

import type {FilterData} from '../abs/types';

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

/** The empty state for a filter with no matches, worded for what was asked. */
export function noMatchText (f: LibraryFilter): string {
	if (f.group === 'progress') {
		if (f.value === 'in-progress') return 'Nothing in progress in this library.';
		if (f.value === 'finished') return "You haven't finished a book in this library yet.";
		return "You've started every book in this library.";
	}
	if (f.group === 'narrators') return 'No books read by ' + f.value + ' here.';
	return 'No ' + f.value + ' books in this library.';
}
