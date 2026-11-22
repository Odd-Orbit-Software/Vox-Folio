/* Live updates from Audiobookshelf over its socket.io endpoint, without the socket.io library: the
   wire format (Engine.IO v4 over a WebSocket) is small enough to speak directly.

   Packets are text frames: "0{...}" open, "2" ping (answer "3"), "40" connect to the default
   namespace, "42[event, data]" an event, "41" disconnect. After connecting we send
   42["auth", token]; the server then sends this account's events, such as
   user_item_progress_updated when another device saves a position. */

import type {MediaProgress} from './types';

export interface ProgressEvent {
	/** The progress record's ID. */
	id: string;
	/** The listening session that saved it (ours, or another device's). */
	sessionId?: string;
	deviceDescription?: string;
	data: MediaProgress;
}

export type SocketEvent =
	| {type: 'progress'; progress: ProgressEvent}
	| {type: 'userUpdated'}
	| {type: 'connected'}
	/** The server refused our token (expired after standby): refresh it, then call reauth(). */
	| {type: 'authFailed'}
	| {type: 'disconnected'};

/** Decode one Engine.IO/socket.io text packet. Exported for tests. */
export function parsePacket (raw: string): {kind: 'open' | 'ping' | 'connect' | 'event' | 'disconnect' | 'other'; event?: string; data?: unknown} {
	if (raw.charAt(0) === '0') return {kind: 'open'};
	if (raw === '2') return {kind: 'ping'};
	if (raw.indexOf('40') === 0) return {kind: 'connect'};
	if (raw.indexOf('41') === 0) return {kind: 'disconnect'};
	if (raw.indexOf('42') === 0) {
		try {
			const body = JSON.parse(raw.slice(2)) as unknown[];
			if (Array.isArray(body) && typeof body[0] === 'string') return {kind: 'event', event: body[0], data: body[1]};
		} catch {
			// Not JSON: ignore.
		}
	}
	return {kind: 'other'};
}

/** The WebSocket address for a server URL (keeps any subpath). */
export function socketUrl (serverUrl: string): string {
	return serverUrl.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/socket.io/?EIO=4&transport=websocket';
}

const RETRY_MS = [2000, 5000, 15000, 30000, 60000];
/** The server pings every 25 s; this long with no message at all means the link is dead. */
const SILENCE_MS = 70000;

export class LiveSocket {
	private ws: WebSocket | null = null;
	private retries = 0;
	private retryTimer: number | null = null;
	private stopped = false;
	private authed = false;
	private lastMessage = 0;
	private watchdog: number | null = null;

	constructor (
		private readonly serverUrl: string,
		private token: () => string,
		private readonly onEvent: (e: SocketEvent) => void
	) {}

	start (): void {
		this.stopped = false;
		this.connect();
	}

	stop (): void {
		this.stopped = true;
		if (this.watchdog !== null) window.clearInterval(this.watchdog);
		this.watchdog = null;
		if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
		this.retryTimer = null;
		if (this.ws) {
			this.ws.onclose = null;
			try {
				this.ws.close();
			} catch {
				// Already closed.
			}
		}
		this.ws = null;
	}

	/** Send the current token again (after a refresh), so the server keeps us signed in. */
	reauth (): void {
		if (this.ws && this.authed) this.send('42' + JSON.stringify(['auth', this.token()]));
	}

	/** Reconnect now if the connection was lost (e.g. the TV woke from standby). A socket that still
	    says it's open but has gone quiet is half-open: drop it and start again. */
	wake (): void {
		if (this.stopped) return;
		if (this.ws && this.ws.readyState <= 1) {
			if (Date.now() - this.lastMessage < SILENCE_MS) return;
			this.drop();
		}
		this.retries = 0;
		if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
		this.retryTimer = null;
		this.connect();
	}

	/** Close the current socket so the close handler reconnects. */
	private drop (): void {
		const ws = this.ws;
		if (!ws) return;
		try {
			ws.close();
		} catch {
			// Already closing.
		}
	}

	private send (text: string): void {
		try {
			if (this.ws && this.ws.readyState === 1) this.ws.send(text);
		} catch {
			// The close handler reconnects.
		}
	}

	private connect (): void {
		if (this.stopped) return;
		let ws: WebSocket;
		try {
			ws = new WebSocket(socketUrl(this.serverUrl));
		} catch {
			this.scheduleRetry();
			return;
		}
		this.ws = ws;
		this.authed = false;
		this.lastMessage = Date.now();
		if (this.watchdog === null) {
			this.watchdog = window.setInterval(() => {
				if (this.ws && this.ws.readyState === 1 && Date.now() - this.lastMessage > SILENCE_MS) this.drop();
			}, 30000);
		}
		ws.onmessage = (msg: MessageEvent) => {
			this.lastMessage = Date.now();
			if (typeof msg.data !== 'string') return;
			const p = parsePacket(msg.data);
			if (p.kind === 'open') this.send('40');
			else if (p.kind === 'ping') this.send('3');
			else if (p.kind === 'connect' && !this.authed) {
				this.authed = true;
				this.retries = 0;
				this.send('42' + JSON.stringify(['auth', this.token()]));
				this.onEvent({type: 'connected'});
			} else if (p.kind === 'event') this.dispatch(p.event as string, p.data);
			else if (p.kind === 'disconnect') ws.close();
		};
		ws.onclose = () => {
			if (this.ws === ws) this.ws = null;
			if (this.authed) this.onEvent({type: 'disconnected'});
			this.authed = false;
			this.scheduleRetry();
		};
		ws.onerror = () => {
			// onclose follows.
		};
	}

	private dispatch (event: string, data: unknown): void {
		if (event === 'user_item_progress_updated' && data && typeof data === 'object' && (data as ProgressEvent).data) {
			this.onEvent({type: 'progress', progress: data as ProgressEvent});
		} else if (event === 'user_updated') {
			this.onEvent({type: 'userUpdated'});
		} else if (event === 'auth_failed') {
			this.onEvent({type: 'authFailed'});
		}
	}

	private scheduleRetry (): void {
		if (this.stopped || this.retryTimer !== null) return;
		const wait = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
		this.retries += 1;
		this.retryTimer = window.setTimeout(() => {
			this.retryTimer = null;
			this.connect();
		}, wait);
	}
}
