/* Live progress from the server, for screens that show it (Home). The socket lives in App; this is
   only the fan-out. */

import type {MediaProgress} from '../abs/types';

type Listener = (p: MediaProgress | null) => void;
const listeners = new Set<Listener>();

/** A progress record changed on the server, or (null) something else about the account did. */
export function publishProgress (p: MediaProgress | null): void {
	listeners.forEach((fn) => fn(p));
}

export function subscribeProgress (fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** The live connection's state, for the Diagnostics page. */
export type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'off';
// One snapshot object per change, so React's external-store hook sees a stable value.
let snapshot: {status: LiveStatus; since: number} = {status: 'off', since: 0};
const statusListeners = new Set<() => void>();

export function setLiveStatus (next: LiveStatus): void {
	if (next === snapshot.status) return;
	snapshot = {status: next, since: Date.now()};
	statusListeners.forEach((fn) => fn());
}

export function getLiveStatus (): {status: LiveStatus; since: number} {
	return snapshot;
}

export function subscribeLiveStatus (fn: () => void): () => void {
	statusListeners.add(fn);
	return () => {
		statusListeners.delete(fn);
	};
}
