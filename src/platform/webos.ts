/* webOS platform glue: launch parameters, relaunches, activation and remote key codes.
   Everything here degrades to something sensible in a desktop browser so the app can be
   developed with `npm run serve`. */

export type LaunchParams = Record<string, unknown>;

interface PalmSystemLike {
	launchParams?: string;
	activate?: () => void;
	platformBack?: () => void;
}

declare global {
	interface Window {
		PalmSystem?: PalmSystemLike;
		webOSSystem?: PalmSystemLike;
	}
}

function system (): PalmSystemLike | undefined {
	return window.webOSSystem || window.PalmSystem;
}

export function isWebOS (): boolean {
	return Boolean(system());
}

function parseQuery (search: string): LaunchParams {
	const out: LaunchParams = {};
	search.replace(/^\?/, '').split('&').forEach((pair) => {
		if (!pair) return;
		const [k, v = ''] = pair.split('=');
		out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
	});
	return out;
}

/** Parameters the app was cold-launched with. In a browser, the page's query string stands in. */
export function readLaunchParams (): LaunchParams {
	const sys = system();
	if (sys) {
		try {
			const parsed: unknown = sys.launchParams ? JSON.parse(sys.launchParams) : {};
			return parsed && typeof parsed === 'object' ? parsed as LaunchParams : {};
		} catch {
			return {};
		}
	}
	return parseQuery(window.location.search);
}

/** Relaunches of an already running app (appinfo `handlesRelaunch`). Returns an unsubscribe function. */
export function onRelaunch (handler: (params: LaunchParams) => void): () => void {
	const listener = (event: Event) => {
		const detail = (event as CustomEvent).detail;
		handler(detail && typeof detail === 'object' ? detail as LaunchParams : {});
	};
	document.addEventListener('webOSRelaunch', listener);
	return () => document.removeEventListener('webOSRelaunch', listener);
}

/** Bring the app to the foreground. Required after handling a relaunch ourselves. */
export function activate (): void {
	const sys = system();
	if (sys && sys.activate) sys.activate();
}

/** Leave the app the way the TV expects (back to the previous app or launcher). */
export function exitApp (): void {
	const sys = system();
	if (sys && sys.platformBack) sys.platformBack();
	else window.close();
}

/** The Audiobookshelf library item a launch asks for, or null. Polaris sends `{abs: "<item id>"}`. */
export function requestedItemId (params: LaunchParams): string | null {
	const value = params.abs;
	if (typeof value !== 'string') return null;
	const id = value.trim();
	return id ? id : null;
}

/** LG remote key codes (keyCode on keydown). */
export const Keys = {
	ENTER: 13,
	LEFT: 37,
	UP: 38,
	RIGHT: 39,
	DOWN: 40,
	CH_UP: 33,
	CH_DOWN: 34,
	PAUSE: 19,
	BACK: 461,
	BACKSPACE: 8,
	ESC: 27,
	PLAY: 415,
	STOP: 413,
	REWIND: 412,
	FAST_FORWARD: 417,
	RED: 403,
	GREEN: 404,
	YELLOW: 405,
	BLUE: 406
} as const;

/** Back on the remote, or Escape/Backspace when developing in a browser. */
export function isBackKey (keyCode: number): boolean {
	return keyCode === Keys.BACK || (!isWebOS() && (keyCode === Keys.ESC || keyCode === Keys.BACKSPACE));
}
