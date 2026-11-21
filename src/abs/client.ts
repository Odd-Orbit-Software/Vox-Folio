/* Audiobookshelf HTTP client.
   Auth uses the short-lived access token (1 h on 2.37) plus a rotating refresh token. Each refresh
   issues a new refresh token and invalidates the old one, so refreshes are serialised and every new
   pair is handed to `onTokens` to be saved. */

import type {LibraryItem, LoginResponse, MediaProgress, PlaybackSession, SyncPayload} from './types';

export type AbsErrorKind = 'network' | 'timeout' | 'auth' | 'notFound' | 'server' | 'badServer';

export class AbsError extends Error {
	kind: AbsErrorKind;
	status?: number;

	constructor (kind: AbsErrorKind, message: string, status?: number) {
		super(message);
		this.name = 'AbsError';
		this.kind = kind;
		this.status = status;
	}
}

export interface Credentials {
	serverUrl: string;
	userId: string;
	username: string;
	accessToken: string;
	refreshToken: string;
}

export interface DeviceInfo {
	deviceId: string;
	clientName: string;
	clientVersion: string;
	manufacturer: string;
	model: string;
}

const TIMEOUT_MS = 15000;

/** Accepts what people type: "abs.example.com", "http://10.0.0.5:13378/", a subpath install. */
export function normaliseServerUrl (input: string): string {
	let url = input.trim();
	if (!url) return '';
	if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
	return url.replace(/\/+$/, '');
}

async function http (url: string, init: RequestInit = {}): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		return await fetch(url, {...init, signal: controller.signal});
	} catch (e) {
		if ((e as Error).name === 'AbortError') throw new AbsError('timeout', 'The server took too long to answer.');
		throw new AbsError('network', 'Could not reach the server.');
	} finally {
		clearTimeout(timer);
	}
}

function errorFor (status: number, what: string): AbsError {
	if (status === 401 || status === 403) return new AbsError('auth', 'Your sign-in has expired.', status);
	if (status === 404) return new AbsError('notFound', what + ' was not found.', status);
	return new AbsError('server', 'The server returned an error (HTTP ' + status + ').', status);
}

/** True when the URL answers like an Audiobookshelf server. */
export async function ping (serverUrl: string): Promise<void> {
	const res = await http(serverUrl + '/ping');
	const body = await res.json().catch(() => null) as {success?: boolean} | null;
	if (!res.ok || !body || body.success !== true) {
		throw new AbsError('badServer', "That address doesn't look like an Audiobookshelf server.", res.status);
	}
}

export async function login (serverUrl: string, username: string, password: string): Promise<Credentials> {
	const res = await http(serverUrl + '/login', {
		method: 'POST',
		// Without x-return-tokens the refresh token is only set as a cookie, which a packaged app can't use.
		headers: {'Content-Type': 'application/json', 'x-return-tokens': 'true'},
		body: JSON.stringify({username, password})
	});
	if (res.status === 401) throw new AbsError('auth', 'That username and password were not accepted.', 401);
	if (!res.ok) throw errorFor(res.status, 'The login page');
	const data = await res.json() as LoginResponse;
	if (!data.user || !data.user.accessToken || !data.user.refreshToken) {
		throw new AbsError('badServer', 'This server is too old for Vox Folio (it did not return refresh tokens).');
	}
	return {
		serverUrl,
		userId: data.user.id,
		username: data.user.username,
		accessToken: data.user.accessToken,
		refreshToken: data.user.refreshToken
	};
}

export class AbsClient {
	private creds: Credentials;
	private readonly onTokens: (creds: Credentials) => void;
	private refreshing: Promise<void> | null = null;

	constructor (creds: Credentials, onTokens: (creds: Credentials) => void) {
		this.creds = creds;
		this.onTokens = onTokens;
	}

	get credentials (): Credentials {
		return this.creds;
	}

	/** Exchange the refresh token for a new pair. Concurrent callers share one request. */
	refresh (): Promise<void> {
		if (!this.refreshing) {
			this.refreshing = (async () => {
				const res = await http(this.creds.serverUrl + '/auth/refresh', {
					method: 'POST',
					headers: {'x-refresh-token': this.creds.refreshToken}
				});
				if (res.status === 401 || res.status === 403) throw new AbsError('auth', 'Please sign in again.', res.status);
				if (!res.ok) throw errorFor(res.status, 'Token refresh');
				const data = await res.json() as LoginResponse;
				this.creds = {
					...this.creds,
					accessToken: data.user.accessToken,
					refreshToken: data.user.refreshToken || this.creds.refreshToken
				};
				this.onTokens(this.creds);
			})();
			const clear = () => {
				this.refreshing = null;
			};
			this.refreshing.then(clear, clear);
		}
		return this.refreshing;
	}

	private async request<T> (method: string, path: string, body?: unknown, what = 'That item'): Promise<T> {
		const send = () => http(this.creds.serverUrl + path, {
			method,
			headers: {
				Authorization: 'Bearer ' + this.creds.accessToken,
				...(body === undefined ? {} : {'Content-Type': 'application/json'})
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		let res = await send();
		if (res.status === 401) {
			await this.refresh();
			res = await send();
		}
		if (!res.ok) throw errorFor(res.status, what);
		// Some endpoints (session sync/close) answer with plain "OK" rather than JSON.
		const type = res.headers.get('content-type') || '';
		if (type.indexOf('json') === -1) return null as T;
		const text = await res.text();
		return (text ? JSON.parse(text) : null) as T;
	}

	/** A URL the <audio> element or <img> can load: those can't send headers, so the token rides along. */
	authorisedUrl (path: string): string {
		const sep = path.indexOf('?') === -1 ? '?' : '&';
		return this.creds.serverUrl + path + sep + 'token=' + encodeURIComponent(this.creds.accessToken);
	}

	coverUrl (itemId: string, width = 600): string {
		return this.authorisedUrl('/api/items/' + encodeURIComponent(itemId) + '/cover?width=' + width + '&format=jpeg');
	}

	getItem (itemId: string): Promise<LibraryItem> {
		return this.request<LibraryItem>('GET', '/api/items/' + encodeURIComponent(itemId) + '?expanded=1', undefined, 'That book');
	}

	/** The listener's saved position for a book, or null if they haven't started it. */
	async getProgress (itemId: string): Promise<MediaProgress | null> {
		try {
			return await this.request<MediaProgress>('GET', '/api/me/progress/' + encodeURIComponent(itemId));
		} catch (e) {
			if (e instanceof AbsError && e.kind === 'notFound') return null;
			throw e;
		}
	}

	/** The listener's saved progress for every book they've started, keyed by item ID. */
	async progressByItem (): Promise<Record<string, MediaProgress>> {
		const me = await this.request<{mediaProgress?: MediaProgress[]}>('GET', '/api/me');
		const out: Record<string, MediaProgress> = {};
		(me && me.mediaProgress || []).forEach((p) => {
			out[p.libraryItemId] = p;
		});
		return out;
	}

	async itemsInProgress (limit = 12): Promise<LibraryItem[]> {
		const data = await this.request<{libraryItems: LibraryItem[]}>('GET', '/api/me/items-in-progress?limit=' + limit);
		return (data && data.libraryItems || []).filter((i) => i.mediaType === 'book');
	}

	startPlayback (itemId: string, device: DeviceInfo, supportedMimeTypes: string[]): Promise<PlaybackSession> {
		return this.request<PlaybackSession>('POST', '/api/items/' + encodeURIComponent(itemId) + '/play', {
			deviceInfo: device,
			forceDirectPlay: false,
			forceTranscode: false,
			supportedMimeTypes,
			mediaPlayer: 'html5'
		}, 'That book');
	}

	syncSession (sessionId: string, payload: SyncPayload): Promise<void> {
		return this.request<void>('POST', '/api/session/' + encodeURIComponent(sessionId) + '/sync', payload, 'The listening session');
	}

	closeSession (sessionId: string, payload?: SyncPayload): Promise<void> {
		return this.request<void>('POST', '/api/session/' + encodeURIComponent(sessionId) + '/close', payload, 'The listening session');
	}
}
