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
