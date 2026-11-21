/* Calls into the TV's system services (Luna) from the web app, through PalmServiceBridge.
   Chromium 79: no optional chaining in dependencies, but our TS is transpiled, so it's fine here. */

interface Bridge {
	onservicecallback: (msg: string) => void;
	call: (uri: string, params: string) => void;
	cancel?: () => void;
}

declare global {
	interface Window {
		PalmServiceBridge?: new () => Bridge;
	}
}

interface LunaReply {
	returnValue?: boolean;
	errorText?: string;
}

// Keep bridges referenced while in use, or they can be garbage-collected mid-call.
const live: Bridge[] = [];

function release (bridge: Bridge): void {
	const i = live.indexOf(bridge);
	if (i !== -1) live.splice(i, 1);
}

export function canCallLuna (): boolean {
	return typeof window !== 'undefined' && Boolean(window.PalmServiceBridge);
}

/** One-shot call. Rejects when the service answers returnValue: false. */
export function luna<T> (uri: string, params: Record<string, unknown>): Promise<T> {
	return new Promise((resolve, reject) => {
		const Ctor = window.PalmServiceBridge;
		if (!Ctor) {
			reject(new Error('Luna is only available on the TV'));
			return;
		}
		const bridge = new Ctor();
		live.push(bridge);
		bridge.onservicecallback = (msg: string) => {
			release(bridge);
			try {
				const res = JSON.parse(msg) as T & LunaReply;
				if (res.returnValue === false) reject(new Error(res.errorText || 'Luna call failed: ' + uri));
				else resolve(res);
			} catch (e) {
				reject(e as Error);
			}
		};
		bridge.call(uri, JSON.stringify(params));
	});
}

/** Subscription: onMessage for every reply. Returns a cancel function. */
export function lunaSubscribe<T> (
	uri: string,
	params: Record<string, unknown>,
	onMessage: (res: T) => void,
	onError?: (err: Error) => void
): () => void {
	const Ctor = window.PalmServiceBridge;
	if (!Ctor) {
		if (onError) onError(new Error('Luna is only available on the TV'));
		return () => undefined;
	}
	const bridge = new Ctor();
	live.push(bridge);
	bridge.onservicecallback = (msg: string) => {
		let res: T & LunaReply;
		try {
			res = JSON.parse(msg) as T & LunaReply;
		} catch {
			return;
		}
		if (res.returnValue === false) {
			if (onError) onError(new Error(res.errorText || 'Luna call failed: ' + uri));
			return;
		}
		onMessage(res);
	};
	bridge.call(uri, JSON.stringify({...params, subscribe: true}));
	return () => {
		try {
			if (bridge.cancel) bridge.cancel();
		} catch {
			// Already gone.
		}
		release(bridge);
	};
}
