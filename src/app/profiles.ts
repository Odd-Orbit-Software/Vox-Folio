/* Household profiles: each Audiobookshelf account added on this TV, one of them active.
   Profile 1 is created from the sign-in saved before profiles existed, so nobody has to sign in again. */

import type {Credentials} from '../abs/client';
import {vaultGet, vaultSet} from '../platform/vault';

export interface Profile {
	id: string;
	creds: Credentials;
	addedAt: number;
}

export interface ProfileState {
	profiles: Profile[];
	activeId: string | null;
}

const KEY = 'voxfolio.profiles.v1';
const LEGACY_CREDS_KEY = 'voxfolio.credentials.v1';

/* Profiles carry sign-in tokens, so they're kept in the encrypted vault (platform/vault.ts), which
   falls back to plain localStorage only where the TV lacks Web Crypto. */
const secretStore = {
	getItem: vaultGet,
	setItem: (name: string, value: string) => vaultSet(name, value),
	removeItem: (name: string) => vaultSet(name, null)
};

function storage (): typeof secretStore | null {
	return typeof window === 'undefined' ? null : secretStore;
}

function newId (): string {
	return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function loadProfiles (): ProfileState {
	const store = storage();
	if (!store) return {profiles: [], activeId: null};
	try {
		const raw = store.getItem(KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as ProfileState;
			if (parsed && Array.isArray(parsed.profiles)) return parsed;
		}
		// Migrate the single sign-in saved before profiles existed.
		const legacy = store.getItem(LEGACY_CREDS_KEY);
		if (legacy) {
			const creds = JSON.parse(legacy) as Credentials;
			if (creds && creds.accessToken && creds.refreshToken) {
				const state = {profiles: [{id: newId(), creds, addedAt: Date.now()}], activeId: null as string | null};
				state.activeId = state.profiles[0].id;
				saveProfiles(state);
				store.removeItem(LEGACY_CREDS_KEY);
				return state;
			}
		}
	} catch {
		// Unreadable storage: start empty.
	}
	return {profiles: [], activeId: null};
}

export function saveProfiles (state: ProfileState): void {
	const store = storage();
	if (!store) return;
	try {
		store.setItem(KEY, JSON.stringify(state));
	} catch {
		// Storage full or unavailable: the change still applies for this run.
	}
}

/** Add an account, or refresh its tokens if it's already here (same server and user). Makes it active. */
export function addProfile (state: ProfileState, creds: Credentials): {state: ProfileState; profile: Profile} {
	const existing = state.profiles.filter((p) => p.creds.serverUrl === creds.serverUrl && p.creds.userId === creds.userId)[0];
	const profile = existing ? {...existing, creds} : {id: newId(), creds, addedAt: Date.now()};
	const profiles = existing ? state.profiles.map((p) => (p.id === existing.id ? profile : p)) : state.profiles.concat(profile);
	return {state: {profiles, activeId: profile.id}, profile};
}

export function removeProfile (state: ProfileState, id: string): ProfileState {
	const profiles = state.profiles.filter((p) => p.id !== id);
	const activeId = state.activeId === id ? null : state.activeId;
	return {profiles, activeId};
}

export function setActive (state: ProfileState, id: string): ProfileState {
	return state.profiles.some((p) => p.id === id) ? {...state, activeId: id} : state;
}

/** Store rotated tokens for one profile (called by its client after every refresh). */
export function updateCreds (state: ProfileState, id: string, creds: Credentials): ProfileState {
	return {...state, profiles: state.profiles.map((p) => (p.id === id ? {...p, creds} : p))};
}

export function activeProfile (state: ProfileState): Profile | null {
	return state.profiles.filter((p) => p.id === state.activeId)[0] || null;
}

export function displayName (p: Profile): string {
	return p.creds.username;
}

export function initials (name: string): string {
	const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
	if (!parts.length) return '?';
	return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
