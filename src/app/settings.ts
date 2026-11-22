/* Listener settings, kept on the TV. One small store so every screen sees changes immediately. */

import {useSyncExternalStore} from 'react';

import {loadAutoplay, saveAutoplay} from '../abs/store';

export type SleepDefault = 'off' | 'chapter' | 15 | 30 | 45 | 60;

export interface Settings {
	/** Seconds for ◀◀ and the back button. */
	skipBack: number;
	/** Seconds for ▶▶ and the forward button. */
	skipForward: number;
	smartRewind: boolean;
	/** What the sleep timer panel offers first (and Yellow's quick start). */
	sleepDefault: SleepDefault;
	seriesAutoplay: boolean;
	/** ★ Dim the screensaver and slow its drift late at night. */
	nightMode: boolean;
	/** Home rows the listener has switched off (the Continue listening card always shows). */
	hiddenHomeRows: HomeRowId[];
	/** Home rows in the listener's order (rows missing here keep their place from HOME_ROWS). */
	homeRowOrder: HomeRowId[];
	/** What the screensaver shows: the moving cover and clock, or nothing (a black screen). */
	screensaver: ScreensaverStyle;
	/** Larger small text (hints, details, labels) for reading from further away. */
	textSize: TextSize;
	/** No sliding, scrolling titles or fades; the screensaver hops instead of drifting. */
	reduceMotion: boolean;
	/** Seconds the sleep timer fades the sound out over. */
	sleepFade: number;
}

export type ScreensaverStyle = 'cover' | 'dark';
export type TextSize = 'standard' | 'large';
export const SLEEP_FADE_CHOICES = [10, 30, 60];

export type HomeRowId = 'in-progress' | 'continue-series' | 'recently-added' | 'listen-again' | 'discover' | 'recent-series' | 'new-episodes';

/** Home's rows in the order they appear, with what each shows. */
export const HOME_ROWS: {id: HomeRowId; label: string; hint: string; premium?: boolean}[] = [
	{id: 'in-progress', label: 'In progress', hint: 'Other books and episodes you\'re partway through'},
	{id: 'new-episodes', label: 'New episodes ★', hint: 'The latest from your podcasts', premium: true},
	{id: 'continue-series', label: 'Continue series', hint: 'The next book in series you\'ve started'},
	{id: 'recently-added', label: 'Recently added', hint: 'New to the library'},
	{id: 'discover', label: 'Discover', hint: 'Books you haven\'t started, picked at random'},
	{id: 'listen-again', label: 'Listen again', hint: 'Books you finished a while ago'},
	{id: 'recent-series', label: 'New series', hint: 'Series added to the library lately'}
];

/** Every Home row in the listener's order: their own order first, then any rows they haven't placed. */
export function orderedHomeRows (settings: Settings): HomeRowId[] {
	const all = HOME_ROWS.map((r) => r.id);
	const placed = settings.homeRowOrder.filter((id) => all.indexOf(id) !== -1);
	all.forEach((id, i) => {
		if (placed.indexOf(id) !== -1) return;
		// A row they've never moved goes after the row it follows by default.
		const before = all.slice(0, i).reverse().filter((b) => placed.indexOf(b) !== -1)[0];
		placed.splice(before ? placed.indexOf(before) + 1 : 0, 0, id);
	});
	return placed;
}

/** Move a Home row one place up (-1) or down (1); null when it's already at that end. */
export function moveHomeRow (settings: Settings, id: HomeRowId, dir: 1 | -1): HomeRowId[] | null {
	const order = orderedHomeRows(settings);
	const i = order.indexOf(id);
	const j = i + dir;
	if (i === -1 || j < 0 || j >= order.length) return null;
	const next = order.slice();
	next[i] = order[j];
	next[j] = id;
	return next;
}

export function homeRowsAreDefault (settings: Settings): boolean {
	return orderedHomeRows(settings).join() === HOME_ROWS.map((r) => r.id).join() && settings.hiddenHomeRows.slice().sort().join() === defaults.hiddenHomeRows.slice().sort().join();
}

/** The Home rows as they come out of the box. */
export function defaultHomeRows (): Pick<Settings, 'homeRowOrder' | 'hiddenHomeRows'> {
	return {homeRowOrder: [], hiddenHomeRows: defaults.hiddenHomeRows.slice()};
}

export function homeRowShown (settings: Settings, id: HomeRowId): boolean {
	return settings.hiddenHomeRows.indexOf(id) === -1;
}

export function toggleHomeRow (settings: Settings, id: HomeRowId): HomeRowId[] {
	return homeRowShown(settings, id) ? settings.hiddenHomeRows.concat(id) : settings.hiddenHomeRows.filter((r) => r !== id);
}

export const SKIP_CHOICES = [10, 15, 30, 45, 60];
export const SLEEP_CHOICES: SleepDefault[] = ['off', 'chapter', 15, 30, 45, 60];

const KEY = 'voxfolio.settings.v1';
/** Settings belong to the active profile; before profiles existed they were stored under KEY alone. */
let profileId: string | null = null;

function keyFor (id: string | null): string {
	return id ? KEY + ':' + id : KEY;
}

const defaults: Settings = {
	skipBack: 30,
	skipForward: 30,
	smartRewind: true,
	sleepDefault: 30,
	seriesAutoplay: true,
	nightMode: true,
	// Home stays short until the listener asks for more.
	hiddenHomeRows: ['listen-again', 'recent-series'],
	homeRowOrder: [],
	screensaver: 'cover',
	textSize: 'standard',
	reduceMotion: false,
	sleepFade: 10
};

function load (): Settings {
	let stored: Partial<Settings> = {};
	try {
		// A profile without its own settings yet starts from the ones saved on this TV before.
		const raw = window.localStorage.getItem(keyFor(profileId)) || window.localStorage.getItem(KEY);
		if (raw) stored = JSON.parse(raw) as Partial<Settings>;
	} catch {
		stored = {};
	}
	const merged = {...defaults, ...stored};
	// Series autoplay predates this store; keep the listener's earlier choice.
	if (stored.seriesAutoplay === undefined) merged.seriesAutoplay = loadAutoplay();
	if (SKIP_CHOICES.indexOf(merged.skipBack) === -1) merged.skipBack = defaults.skipBack;
	if (SKIP_CHOICES.indexOf(merged.skipForward) === -1) merged.skipForward = defaults.skipForward;
	if (SLEEP_CHOICES.indexOf(merged.sleepDefault) === -1) merged.sleepDefault = defaults.sleepDefault;
	if (!Array.isArray(merged.hiddenHomeRows)) merged.hiddenHomeRows = defaults.hiddenHomeRows.slice();
	if (!Array.isArray(merged.homeRowOrder)) merged.homeRowOrder = [];
	if (merged.screensaver !== 'dark') merged.screensaver = 'cover';
	if (merged.textSize !== 'large') merged.textSize = 'standard';
	merged.reduceMotion = merged.reduceMotion === true;
	if (SLEEP_FADE_CHOICES.indexOf(merged.sleepFade) === -1) merged.sleepFade = defaults.sleepFade;
	return merged;
}

let current: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings (): Settings {
	if (!current) current = typeof window !== 'undefined' ? load() : {...defaults};
	return current;
}

export function updateSettings (patch: Partial<Settings>): Settings {
	current = {...getSettings(), ...patch};
	try {
		window.localStorage.setItem(keyFor(profileId), JSON.stringify(current));
	} catch {
		// Storage unavailable: the change still applies for this run.
	}
	if (patch.seriesAutoplay !== undefined) saveAutoplay(patch.seriesAutoplay);
	listeners.forEach((fn) => fn());
	return current;
}

/** Switch to another profile's settings (on sign-in or a profile switch). */
export function selectProfileSettings (id: string | null): void {
	if (id === profileId && current) return;
	profileId = id;
	current = typeof window !== 'undefined' ? load() : {...defaults};
	listeners.forEach((fn) => fn());
}

export function subscribeSettings (fn: () => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

export function useSettings (): Settings {
	return useSyncExternalStore(subscribeSettings, getSettings);
}

/** The neighbouring value in a list of choices, or null at either end (Left/Right on a settings row). */
export function stepChoice<T> (choices: T[], value: T, dir: 1 | -1): T | null {
	const i = choices.indexOf(value);
	const j = i === -1 ? 0 : i + dir;
	return j >= 0 && j < choices.length ? choices[j] : null;
}

/** The next value in a list of choices, wrapping round (OK on a settings row). */
export function nextChoice<T> (choices: T[], value: T): T {
	const i = choices.indexOf(value);
	return choices[(i + 1) % choices.length];
}

export function sleepLabel (value: SleepDefault): string {
	if (value === 'off') return 'Off';
	if (value === 'chapter') return 'End of chapter';
	return value + ' minutes';
}
