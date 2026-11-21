/* Playback engine: one <audio> element, an Audiobookshelf playback session, and periodic syncing.
   Framework-free so it can be driven from React and tested on its own.

   - Position is always book time (seconds from the start of the book at 1×).
   - Listening time is wall-clock time spent playing; a paused minute contributes nothing.
   - Syncs every SYNC_INTERVAL while playing and immediately on pause, so an abrupt power-off loses
     at most one interval.
   - If syncing fails we keep going, show the unsynced state, and on reconnect check whether another
     device moved the book on before writing our older position over it. */

import {AbsError} from '../abs/client';
import type {AbsClient, DeviceInfo} from '../abs/client';
import type {AudioTrack, Chapter, PlaybackSession} from '../abs/types';
import {loadPlaybackRate, savePlaybackRate} from '../abs/store';
import {PlayRateController} from '../platform/playRate';
import {
	bookDuration, chapterIndexAt, clamp, formatClock, locate, MAX_RATE, MIN_RATE,
	nextChapterTarget, previousChapterTarget
} from './timeline';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export type SyncState = 'synced' | 'pending' | 'offline';

export interface PlayerState {
	status: PlayerStatus;
	itemId: string | null;
	title: string;
	author: string;
	narrator: string;
	seriesLine: string;
	coverUrl: string;
	position: number;
	duration: number;
	rate: number;
	chapters: Chapter[];
	chapterIndex: number;
	sync: SyncState;
	lastSyncedAt: number | null;
	unsyncedSeconds: number;
	/** Why the last sync failed, for diagnostics. */
	syncError: string | null;
	error: AbsError | null;
	/** A short message to show once, such as catching up with another device. */
	notice: {id: number; text: string} | null;
}

const SYNC_INTERVAL_MS = 15000;
const MAX_TICK_S = 5;
/** Server ahead of us by more than this after a reconnect means another device listened meanwhile. */
const ADVANCED_THRESHOLD_S = 5;

const MIME_CANDIDATES = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/ogg', 'audio/webm', 'audio/wav'];

export function supportedMimeTypes (audio: HTMLAudioElement): string[] {
	return MIME_CANDIDATES.filter((t) => audio.canPlayType(t) !== '');
}

export const idlePlayerState: PlayerState = {
	status: 'idle',
	itemId: null,
	title: '',
	author: '',
	narrator: '',
	seriesLine: '',
	coverUrl: '',
	position: 0,
	duration: 0,
	rate: 1,
	chapters: [],
	chapterIndex: -1,
	sync: 'synced',
	lastSyncedAt: null,
	unsyncedSeconds: 0,
	syncError: null,
	error: null,
	notice: null
};

export class PlayerEngine {
	private state: PlayerState = {...idlePlayerState, rate: loadPlaybackRate()};
	private listeners = new Set<(s: PlayerState) => void>();
	private session: PlaybackSession | null = null;
	private tracks: AudioTrack[] = [];
	private trackIndex = 0;
	private pendingOffset: number | null = null;
	private resumeAfterLoad = false;
	private listened = 0;
	private lastTick: number | null = null;
	private syncTimer: number | null = null;
	private syncing = false;
	/** Wall-clock ms of the last successful sync, for the reconnect check. */
	private lastSyncOk = 0;
	private wasOffline = false;
	private mediaRetries = 0;
	private seekSyncTimer: number | null = null;
	private readonly rateCtl: PlayRateController;
	private noticeId = 0;
	private openToken = 0;

	constructor (
		private readonly client: AbsClient,
		private readonly audio: HTMLAudioElement,
		private readonly device: DeviceInfo
	) {
		this.rateCtl = new PlayRateController(audio);
		audio.preload = 'auto';
		audio.addEventListener('timeupdate', this.onTimeUpdate);
		audio.addEventListener('playing', this.onPlaying);
		audio.addEventListener('pause', this.onPause);
		audio.addEventListener('ended', this.onEnded);
		audio.addEventListener('loadedmetadata', this.onLoadedMetadata);
		audio.addEventListener('error', this.onMediaError);
	}

	/** Detach from the shared <audio> element (when the signed-in account changes). */
	dispose (): void {
		this.stopSyncTimer();
		this.audio.removeEventListener('timeupdate', this.onTimeUpdate);
		this.audio.removeEventListener('playing', this.onPlaying);
		this.audio.removeEventListener('pause', this.onPause);
		this.audio.removeEventListener('ended', this.onEnded);
		this.audio.removeEventListener('loadedmetadata', this.onLoadedMetadata);
		this.audio.removeEventListener('error', this.onMediaError);
		this.listeners.clear();
	}

	// ---- subscription ---------------------------------------------------------------------------

	getState (): PlayerState {
		return this.state;
	}

	subscribe (fn: (s: PlayerState) => void): () => void {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	private set (patch: Partial<PlayerState>): void {
		this.state = {...this.state, ...patch};
		this.listeners.forEach((fn) => fn(this.state));
	}

	private notify (text: string): void {
		this.noticeId += 1;
		this.set({notice: {id: this.noticeId, text}});
	}

	// ---- opening and closing ----------------------------------------------------------------------

	/** Start a session for a book at the server's saved position. Closes any current session first. */
	async open (itemId: string, autoplay = true): Promise<void> {
		const token = ++this.openToken;
		await this.close();
		if (token !== this.openToken) return;

		this.set({...idlePlayerState, rate: this.state.rate, status: 'loading', itemId});
		try {
			const [item, session] = await Promise.all([
				this.client.getItem(itemId),
				this.client.startPlayback(itemId, this.device, supportedMimeTypes(this.audio))
			]);
			if (token !== this.openToken) {
				this.client.closeSession(session.id).catch(() => undefined);
				return;
			}
			const tracks = (session.audioTracks || []).slice().sort((a, b) => a.startOffset - b.startOffset);
			if (!tracks.length) {
				this.client.closeSession(session.id).catch(() => undefined);
				throw new AbsError('notFound', 'This book has no audio files Vox Folio can play.');
			}
			this.session = session;
			this.tracks = tracks;
			const md = item.media.metadata;
			const series = md.series && md.series[0];
			const duration = session.duration || bookDuration(tracks);
			const position = clamp(session.currentTime || 0, 0, duration);
			this.lastSyncOk = Date.now();
			this.set({
				title: md.title || session.displayTitle,
				author: md.authorName || session.displayAuthor || '',
				narrator: md.narratorName || '',
				seriesLine: series ? series.name + (series.sequence ? ' · Book ' + series.sequence : '') : '',
				coverUrl: item.media.coverPath ? this.client.coverUrl(itemId) : '',
				duration,
				position,
				chapters: session.chapters || [],
				chapterIndex: chapterIndexAt(session.chapters || [], position),
				lastSyncedAt: Date.now()
			});
			this.loadAt(position, autoplay);
		} catch (e) {
			if (token !== this.openToken) return;
			this.set({status: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		}
	}

	/** Flush the latest position and close the session. Safe to call at any time. */
	async close (): Promise<void> {
		const session = this.session;
		this.stopSyncTimer();
		this.accumulate();
		const payload = this.payload();
		// Detach first so the pause event below doesn't trigger a separate sync.
		this.session = null;
		this.tracks = [];
		this.pendingOffset = null;
		this.lastTick = null;
		this.audio.pause();
		this.audio.removeAttribute('src');
		this.audio.load();
		if (!session) return;
		this.listened = 0;
		try {
			await this.client.closeSession(session.id, payload);
		} catch {
			// Best effort: the next session on any device picks up the last successful sync.
		}
	}

	// ---- transport --------------------------------------------------------------------------------

	play (): void {
		if (!this.session) return;
		if (this.state.status === 'ended') {
			this.seek(0);
		}
		this.audio.play().catch(() => undefined);
	}

	pause (): void {
		this.audio.pause();
	}

	toggle (): void {
		if (this.audio.paused) this.play();
		else this.pause();
	}

	seek (bookTime: number): void {
		if (!this.session) return;
		const t = clamp(bookTime, 0, Math.max(0, this.state.duration - 0.5));
		const target = locate(this.tracks, t);
		this.set({position: t, chapterIndex: chapterIndexAt(this.state.chapters, t), status: this.state.status === 'ended' ? 'paused' : this.state.status});
		if (target.index === this.trackIndex && this.audio.readyState > 0) {
			this.audio.currentTime = target.offset;
		} else {
			this.loadAt(t, !this.audio.paused);
		}
		// While paused nothing else would save the new spot, so save it once the presses settle.
		if (this.audio.paused) {
			if (this.seekSyncTimer !== null) window.clearTimeout(this.seekSyncTimer);
			this.seekSyncTimer = window.setTimeout(() => {
				this.seekSyncTimer = null;
				this.sync();
			}, 1500);
		}
	}

	skip (seconds: number): void {
		this.seek(this.state.position + seconds);
	}

	nextChapter (): void {
		const t = nextChapterTarget(this.state.chapters, this.state.position);
		if (t !== null) this.seek(t);
	}

	previousChapter (): void {
		const t = previousChapterTarget(this.state.chapters, this.state.position);
		if (t !== null) this.seek(t);
	}

	setRate (rate: number): void {
		const r = clamp(Math.round(rate * 100) / 100, MIN_RATE, MAX_RATE);
		this.rateCtl.apply(r);
		savePlaybackRate(r);
		this.set({rate: r});
	}

	/** When paused, take a newer position saved by another device (the phone) since our last sync.
	    Called when the book is requested again or the app comes back to the foreground. */
	async catchUp (): Promise<void> {
		const session = this.session;
		if (!session || !this.audio.paused || this.syncing) return;
		try {
			await this.adoptNewerServerPosition(session.libraryItemId, false);
		} catch {
			// Offline: keep our position; the next sync will check again.
		}
	}

	/** Sync now, e.g. when the app is hidden. */
	flush (): Promise<void> {
		this.accumulate();
		return this.sync();
	}

	// ---- loading files ----------------------------------------------------------------------------

	private loadAt (bookTime: number, autoplay: boolean): void {
		const {index, offset} = locate(this.tracks, bookTime);
		this.trackIndex = index;
		this.pendingOffset = offset;
		this.resumeAfterLoad = autoplay;
		if (this.state.status !== 'loading') this.set({status: autoplay ? 'loading' : 'paused'});
		this.audio.src = this.client.authorisedUrl(this.tracks[index].contentUrl);
		this.audio.load();
	}

	private onLoadedMetadata = (): void => {
		// Each file gets a new pipeline, which starts at 1×.
		this.rateCtl.apply(this.state.rate);
		if (this.pendingOffset !== null) {
			this.audio.currentTime = this.pendingOffset;
			this.pendingOffset = null;
		}
		if (this.resumeAfterLoad) {
			this.audio.play().catch(() => this.set({status: 'paused'}));
		} else {
			this.set({status: 'paused'});
		}
		this.resumeAfterLoad = false;
	};

	private onMediaError = (): void => {
		if (!this.session || !this.audio.getAttribute('src')) return;
		// The usual cause mid-book is the access token in the URL expiring (1 h). Refresh and reload
		// at the same spot, a couple of times at most before giving up.
		if (this.mediaRetries < 2) {
			this.mediaRetries += 1;
			const resume = this.state.status === 'playing' || this.state.status === 'loading';
			this.client.refresh()
				.catch(() => undefined)
				.then(() => this.loadAt(this.state.position, resume));
			return;
		}
		this.set({status: 'error', error: new AbsError('network', "The audio stopped loading. Check the connection and try again.")});
	};

	private onEnded = (): void => {
		this.accumulate();
		if (this.trackIndex + 1 < this.tracks.length) {
			const next = this.tracks[this.trackIndex + 1];
			this.loadAt(next.startOffset, true);
			return;
		}
		this.set({status: 'ended', position: this.state.duration});
		this.stopSyncTimer();
		this.sync();
	};

	// ---- progress and listening time ----------------------------------------------------------------

	private onTimeUpdate = (): void => {
		if (!this.session || this.pendingOffset !== null) return;
		const track = this.tracks[this.trackIndex];
		if (!track) return;
		const position = track.startOffset + this.audio.currentTime;
		this.accumulate();
		const chapterIndex = chapterIndexAt(this.state.chapters, position);
		// Re-render a few times a second at most; whole seconds are all the UI shows.
		if (Math.floor(position) !== Math.floor(this.state.position) || chapterIndex !== this.state.chapterIndex) {
			this.set({position, chapterIndex, unsyncedSeconds: Math.round(this.listened)});
		}
	};

	private onPlaying = (): void => {
		this.mediaRetries = 0;
		this.rateCtl.apply(this.state.rate);
		this.lastTick = Date.now();
		this.set({status: 'playing'});
		this.startSyncTimer();
	};

	private onPause = (): void => {
		if (this.state.status === 'ended' || this.pendingOffset !== null) return;
		this.accumulate();
		this.lastTick = null;
		if (this.session) this.set({status: 'paused'});
		this.stopSyncTimer();
		this.sync();
	};

	private accumulate (): void {
		if (this.lastTick === null || this.audio.paused) {
			this.lastTick = this.audio.paused ? null : Date.now();
			return;
		}
		const now = Date.now();
		// Wall-clock time, so 10 minutes at 1.5× counts as 10 minutes of listening. Capped so a
		// suspended TV doesn't credit hours it spent asleep.
		this.listened += Math.min(MAX_TICK_S, Math.max(0, (now - this.lastTick) / 1000));
		this.lastTick = now;
	}

	private payload () {
		return {
			currentTime: this.state.position,
			timeListening: Math.round(this.listened),
			duration: this.state.duration
		};
	}

	private startSyncTimer (): void {
		if (this.syncTimer !== null) return;
		this.syncTimer = window.setInterval(() => {
			this.accumulate();
			this.sync();
		}, SYNC_INTERVAL_MS);
	}

	private stopSyncTimer (): void {
		if (this.seekSyncTimer !== null) {
			window.clearTimeout(this.seekSyncTimer);
			this.seekSyncTimer = null;
		}
		if (this.syncTimer !== null) {
			window.clearInterval(this.syncTimer);
			this.syncTimer = null;
		}
	}

	private async sync (): Promise<void> {
		const session = this.session;
		if (!session || this.syncing) return;
		this.syncing = true;
		try {
			if (this.wasOffline && await this.adoptNewerServerPosition(session.libraryItemId, true)) return;
			const payload = this.payload();
			await this.client.syncSession(session.id, payload);
			this.listened = Math.max(0, this.listened - payload.timeListening);
			this.lastSyncOk = Date.now();
			this.wasOffline = false;
			this.set({sync: 'synced', lastSyncedAt: this.lastSyncOk, unsyncedSeconds: Math.round(this.listened), syncError: null});
		} catch (e) {
			const offline = e instanceof AbsError && (e.kind === 'network' || e.kind === 'timeout');
			if (offline) this.wasOffline = true;
			const detail = e instanceof AbsError ? e.kind + (e.status ? ' ' + e.status : '') + ': ' + e.message : String(e);
			this.set({sync: offline ? 'offline' : 'pending', unsyncedSeconds: Math.round(this.listened), syncError: detail});
		} finally {
			this.syncing = false;
		}
	}

	/** If another device saved a newer position since our last successful sync, jump to it rather than
	    overwrite it with ours. After an outage only a position further on counts (`requireAhead`);
	    when resuming a paused book, any newer position does. Returns true when it moved. */
	private async adoptNewerServerPosition (itemId: string, requireAhead: boolean): Promise<boolean> {
		const progress = await this.client.getProgress(itemId);
		if (!progress) return false;
		const newer = progress.lastUpdate > this.lastSyncOk;
		const delta = progress.currentTime - this.state.position;
		const moved = requireAhead ? delta > ADVANCED_THRESHOLD_S : Math.abs(delta) > ADVANCED_THRESHOLD_S;
		if (!newer || !moved) return false;
		this.listened = 0;
		this.lastSyncOk = Date.now();
		this.wasOffline = false;
		this.seek(progress.currentTime);
		this.set({sync: 'synced', lastSyncedAt: this.lastSyncOk, unsyncedSeconds: 0});
		this.notify('Picked up from another device at ' + formatClock(progress.currentTime));
		return true;
	}
}
