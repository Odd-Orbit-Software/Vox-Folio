/* Persistent settings. On the TV, localStorage lives in the app's own data directory and survives
   reinstalling a newer IPK over an older one, which the delivery plan checks. */

import type {Credentials} from './client';
import {vaultGet, vaultSet} from '../platform/vault';

const CREDS_KEY = 'voxfolio.credentials.v1';
const DEVICE_KEY = 'voxfolio.deviceId';
const SPEED_KEY = 'voxfolio.playbackRate';

function read (key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write (key: string, value: string | null): void {
	try {
		if (value === null) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, value);
	} catch {
		// Storage unavailable: the app still works for this run.
	}
}

export function loadCredentials (): Credentials | null {
	const raw = vaultGet(CREDS_KEY);
	if (!raw) return null;
	try {
		const c = JSON.parse(raw) as Credentials;
		return c && c.serverUrl && c.accessToken && c.refreshToken ? c : null;
	} catch {
		return null;
	}
}

export function saveCredentials (creds: Credentials | null): void {
	vaultSet(CREDS_KEY, creds ? JSON.stringify(creds) : null);
}

/** A stable per-install ID, so Audiobookshelf lists this TV as one device across sessions. */
export function deviceId (): string {
	let id = read(DEVICE_KEY);
	if (!id) {
		id = 'voxfolio-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
		write(DEVICE_KEY, id);
	}
	return id;
}

/** Books and podcasts keep their own speed (books often faster). Books keep the original key. */
export type SpeedKind = 'book' | 'podcast';

function speedKey (kind: SpeedKind): string {
	return kind === 'podcast' ? SPEED_KEY + '.podcast' : SPEED_KEY;
}

export function loadPlaybackRate (kind: SpeedKind = 'book'): number {
	const n = Number(read(speedKey(kind)));
	return n >= 0.5 && n <= 2 ? n : 1;
}

export function savePlaybackRate (rate: number, kind: SpeedKind = 'book'): void {
	write(speedKey(kind), String(rate));
}

const LIBRARY_KEY = 'voxfolio.libraryId';
const AUTOPLAY_KEY = 'voxfolio.seriesAutoplay';

export function loadLibraryId (): string | null {
	return read(LIBRARY_KEY);
}

export function saveLibraryId (id: string): void {
	write(LIBRARY_KEY, id);
}

/** Series autoplay: on unless the listener turned it off. */
export function loadAutoplay (): boolean {
	return read(AUTOPLAY_KEY) !== 'off';
}

export function saveAutoplay (on: boolean): void {
	write(AUTOPLAY_KEY, on ? 'on' : 'off');
}
