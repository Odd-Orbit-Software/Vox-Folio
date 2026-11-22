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
	nightMode: true
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
