/* Audiobookshelf HTTP client.
   Auth uses the short-lived access token (1 h on 2.37) plus a rotating refresh token. Each refresh
   issues a new refresh token and invalidates the old one, so refreshes are serialised and every new
   pair is handed to `onTokens` to be saved. */

import type {Author, AuthorDetail, Bookmark, ListeningStats, Collection, Library, LibraryItem, LoginResponse, MediaProgress, Page, PlaybackSession, Playlist, PodcastEpisode, PodcastSearchResults, SearchResults, Series, Shelf, SyncPayload} from './types';

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

/** The progress map key: the item for a book, item/episode for a podcast episode. */
export function progressKey (itemId: string, episodeId?: string | null): string {
	return episodeId ? itemId + '/' + episodeId : itemId;
}

function episodePath (episodeId?: string | null): string {
	return episodeId ? '/' + encodeURIComponent(episodeId) : '';
}

/** Expiry (ms since epoch) from a JWT's payload, or null if it can't be read. */
export function tokenExpiry (token: string): number | null {
	try {
		const part = token.split('.')[1];
		if (!part) return null;
		const json = window.atob(part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4));
		const exp = (JSON.parse(json) as {exp?: number}).exp;
		return typeof exp === 'number' ? exp * 1000 : null;
	} catch {
		return null;
	}
}

/** Refresh this long before the access token expires. */
const REFRESH_AHEAD_MS = 5 * 60 * 1000;
const REFRESH_RETRY_MS = 60 * 1000;

export class AbsClient {
	private creds: Credentials;
	private readonly onTokens: (creds: Credentials) => void;
	private refreshing: Promise<void> | null = null;
	private freshTimer: number | null = null;
	private keepingFresh = false;

	constructor (creds: Credentials, onTokens: (creds: Credentials) => void) {
		this.creds = creds;
		this.onTokens = onTokens;
	}

	get credentials (): Credentials {
		return this.creds;
	}

	/** Keep the access token valid ahead of time. Cover and audio URLs carry it, and an expired one
	    shows as missing covers until some other request happens to refresh it. Active session only. */
	keepFresh (): void {
		this.keepingFresh = true;
		this.scheduleRefresh();
	}

	stopKeepingFresh (): void {
		this.keepingFresh = false;
		if (this.freshTimer !== null) {
			window.clearTimeout(this.freshTimer);
			this.freshTimer = null;
		}
	}

	/** Refresh now if the token is close to expiry (after the TV wakes from standby, timers lag). */
	ensureFresh (): Promise<void> {
		const exp = tokenExpiry(this.creds.accessToken);
		if (exp !== null && exp - Date.now() > REFRESH_AHEAD_MS) return Promise.resolve();
		return this.refresh().catch(() => undefined);
	}

	private scheduleRefresh (delay?: number): void {
		if (!this.keepingFresh) return;
		if (this.freshTimer !== null) window.clearTimeout(this.freshTimer);
		const exp = tokenExpiry(this.creds.accessToken);
		const wait = delay !== undefined ? delay : exp === null ? 50 * 60 * 1000 : Math.max(30 * 1000, exp - Date.now() - REFRESH_AHEAD_MS);
		this.freshTimer = window.setTimeout(() => {
			this.freshTimer = null;
			this.refresh().catch(() => this.scheduleRefresh(REFRESH_RETRY_MS));
		}, wait);
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
				this.scheduleRefresh();
			})();
			const clear = () => {
				this.refreshing = null;
			};
			this.refreshing.then(clear, clear);
		}
		return this.refreshing;
	}

	private async request<T> (method: string, path: string, body?: unknown, what = 'That item', keepalive = false): Promise<T> {
		const send = () => http(this.creds.serverUrl + path, {
			method,
			// keepalive lets a request finish even if the app is closing (session close on exit).
			keepalive,
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

	/** The listener's saved position for a book (or a podcast episode), or null if they haven't started it. */
	async getProgress (itemId: string, episodeId?: string | null): Promise<MediaProgress | null> {
		try {
			return await this.request<MediaProgress>('GET', '/api/me/progress/' + encodeURIComponent(itemId) + episodePath(episodeId));
		} catch (e) {
			if (e instanceof AbsError && e.kind === 'notFound') return null;
			throw e;
		}
	}

	/** The listener's saved progress for everything they've started: books keyed by item ID, podcast
	    episodes by progressKey(itemId, episodeId), so an episode never shows as a book's progress. */
	async progressByItem (): Promise<Record<string, MediaProgress>> {
		const me = await this.request<{mediaProgress?: MediaProgress[]}>('GET', '/api/me');
		const out: Record<string, MediaProgress> = {};
		(me && me.mediaProgress || []).forEach((p) => {
			out[progressKey(p.libraryItemId, p.episodeId)] = p;
		});
		return out;
	}

	/** Books and (with `podcasts`) podcast episodes in progress, most recent first. A podcast item carries
	    the episode as recentEpisode. */
	async itemsInProgress (limit = 12, podcasts = false): Promise<LibraryItem[]> {
		const data = await this.request<{libraryItems: LibraryItem[]}>('GET', '/api/me/items-in-progress?limit=' + limit);
		return (data && data.libraryItems || []).filter((i) => i.mediaType === 'book' || (podcasts && i.mediaType === 'podcast' && Boolean(i.recentEpisode)));
	}

	async libraries (mediaType: Library['mediaType'] = 'book'): Promise<Library[]> {
		const data = await this.request<{libraries: Library[]}>('GET', '/api/libraries');
		return (data && data.libraries || [])
			.filter((l) => l.mediaType === mediaType)
			.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
	}

	/** A podcast library's newest episodes across all shows, newest first. */
	async recentEpisodes (libraryId: string, limit = 24): Promise<PodcastEpisode[]> {
		const data = await this.request<{episodes: PodcastEpisode[]}>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/recent-episodes?limit=' + limit);
		return data && data.episodes || [];
	}

	/** One page of a library's books. `sort` is an Audiobookshelf sort key such as media.metadata.title. */
	libraryItems (libraryId: string, opts: {sort: string; desc?: boolean; page: number; limit: number; filter?: string}): Promise<Page<LibraryItem>> {
		const q = [
			'limit=' + opts.limit,
			'page=' + opts.page,
			'sort=' + encodeURIComponent(opts.sort),
			'desc=' + (opts.desc ? 1 : 0),
			'minified=1'
		];
		if (opts.filter) q.push('filter=' + encodeURIComponent(opts.filter));
		return this.request<Page<LibraryItem>>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/items?' + q.join('&'));
	}

	/** A library's series, by name. Each includes its books in series order. */
	librarySeries (libraryId: string, page: number, limit: number): Promise<Page<Series>> {
		return this.request<Page<Series>>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/series?sort=name&page=' + page + '&limit=' + limit);
	}

	getSeries (seriesId: string): Promise<Series> {
		return this.request<Series>('GET', '/api/series/' + encodeURIComponent(seriesId), undefined, 'That series');
	}

	/** A series' books with full metadata, so each carries its structured {id, name, sequence}. */
	async seriesBooks (libraryId: string, seriesId: string): Promise<LibraryItem[]> {
		// Audiobookshelf filters take base64-encoded values.
		const filter = 'series.' + window.btoa(seriesId);
		const q = 'filter=' + encodeURIComponent(filter) + '&sort=' + encodeURIComponent('media.metadata.series.sequence') + '&limit=500&minified=0';
		const page = await this.request<Page<LibraryItem>>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/items?' + q);
		return page && page.results || [];
	}

	search (libraryId: string, query: string): Promise<SearchResults> {
		return this.request<SearchResults>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/search?limit=12&q=' + encodeURIComponent(query));
	}

	async searchPodcasts (libraryId: string, query: string): Promise<PodcastSearchResults> {
		const data = await this.request<Partial<PodcastSearchResults>>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/search?limit=12&q=' + encodeURIComponent(query));
		return {podcast: data && data.podcast || [], episodes: data && data.episodes || []};
	}

	/** Audiobookshelf's personalised Home shelves (continue series, recently added, discover…). */
	async shelves (libraryId: string): Promise<Shelf[]> {
		const data = await this.request<Shelf[]>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/personalized?limit=12');
		return data || [];
	}

	async authors (libraryId: string): Promise<Author[]> {
		const data = await this.request<{authors: Author[]}>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/authors');
		return (data && data.authors || []).filter((a) => (a.numBooks || 0) > 0);
	}

	author (authorId: string): Promise<AuthorDetail> {
		return this.request<AuthorDetail>('GET', '/api/authors/' + encodeURIComponent(authorId) + '?include=items,series', undefined, 'That author');
	}

	authorImageUrl (authorId: string, width = 400): string {
		return this.authorisedUrl('/api/authors/' + encodeURIComponent(authorId) + '/image?width=' + width + '&format=jpeg');
	}

	async collections (libraryId: string): Promise<Collection[]> {
		const data = await this.request<Page<Collection>>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/collections?limit=100');
		return data && data.results || [];
	}

	async playlists (libraryId: string): Promise<Playlist[]> {
		const data = await this.request<Page<Playlist>>('GET', '/api/libraries/' + encodeURIComponent(libraryId) + '/playlists?limit=100');
		return data && data.results || [];
	}

	collection (id: string): Promise<Collection> {
		return this.request<Collection>('GET', '/api/collections/' + encodeURIComponent(id), undefined, 'That collection');
	}

	playlist (id: string): Promise<Playlist> {
		return this.request<Playlist>('GET', '/api/playlists/' + encodeURIComponent(id), undefined, 'That playlist');
	}

	/** Books read by a narrator (Audiobookshelf filters take base64-encoded values). */
	async narratorBooks (libraryId: string, narrator: string): Promise<LibraryItem[]> {
		const filter = 'narrators.' + window.btoa(unescape(encodeURIComponent(narrator)));
		const page = await this.libraryItems(libraryId, {sort: 'media.metadata.title', page: 0, limit: 200, filter});
		return page && page.results || [];
	}

	/** This listener's bookmarks in one book, in book order. */
	async bookmarks (itemId: string): Promise<Bookmark[]> {
		const me = await this.request<{bookmarks?: Bookmark[]}>('GET', '/api/me');
		return (me && me.bookmarks || []).filter((b) => b.libraryItemId === itemId).sort((a, b) => a.time - b.time);
	}

	addBookmark (itemId: string, time: number, title: string): Promise<Bookmark> {
		return this.request<Bookmark>('POST', '/api/me/item/' + encodeURIComponent(itemId) + '/bookmark', {time, title});
	}

	removeBookmark (itemId: string, time: number): Promise<void> {
		return this.request<void>('DELETE', '/api/me/item/' + encodeURIComponent(itemId) + '/bookmark/' + time);
	}

	async listeningStats (): Promise<ListeningStats> {
		const data = await this.request<ListeningStats>('GET', '/api/me/listening-stats');
		return {totalTime: data && data.totalTime || 0, days: data && data.days || {}, today: data && data.today || 0};
	}

	/** Mark a book (or a podcast episode) finished, or not, for this listener. */
	setFinished (itemId: string, isFinished: boolean, episodeId?: string | null): Promise<void> {
		return this.request<void>('PATCH', '/api/me/progress/' + encodeURIComponent(itemId) + episodePath(episodeId), {isFinished});
	}

	startPlayback (itemId: string, device: DeviceInfo, supportedMimeTypes: string[], episodeId?: string | null): Promise<PlaybackSession> {
		return this.request<PlaybackSession>('POST', '/api/items/' + encodeURIComponent(itemId) + '/play' + episodePath(episodeId), {
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

	/** Close a session so Audiobookshelf records it as listening history (open ones aren't counted). */
	closeSession (sessionId: string, payload?: SyncPayload, keepalive = false): Promise<void> {
		return this.request<void>('POST', '/api/session/' + encodeURIComponent(sessionId) + '/close', payload, 'The listening session', keepalive);
	}
}
