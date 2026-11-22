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
import type {AudioTrack, Chapter, PlaybackSession, PodcastEpisode, SeriesRef} from '../abs/types';
import {loadPlaybackRate, savePlaybackRate} from '../abs/store';
import {PlayRateController} from '../platform/playRate';
import {
	bookDuration, chapterIndexAt, clamp, formatClock, locate, MAX_RATE, MIN_RATE,
	nextChapterTarget, previousChapterTarget, rewindWithinChapter, smartRewindSeconds
} from './timeline';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export type SyncState = 'synced' | 'pending' | 'offline';

/** A running sleep timer. `remainingMs` counts only while playing. */
export type SleepState = (
	| {mode: 'timer'; durationMs: number; remainingMs: number; prompt: boolean}
	| {mode: 'chapter'; chapterIndex: number; remainingMs: number; prompt: boolean}
) & {
	/** Wall-clock time (ms) it will pause while playing, null while paused. Countdowns tick to this
	    on their own clock, so they move evenly whatever the rhythm of the audio's progress events. */
	endsAt?: number | null;
};

/** "Still listening?" shows this long before the timer stops; the audio fades over the last part. */
export const SLEEP_PROMPT_MS = 30 * 1000;
const SLEEP_FADE_MS = 10 * 1000;

export interface PlayerState {
	status: PlayerStatus;
	itemId: string | null;
	/** Set when playing a podcast episode (itemId is then the show). */
	episodeId: string | null;
	title: string;
	author: string;
	narrator: string;
	seriesLine: string;
	/** The book's first series, for Next in Series. */
	series: SeriesRef | null;
	libraryId: string | null;
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
	sleep: SleepState | null;
}

const SYNC_INTERVAL_MS = 15000;
/** A book paused this long gets its session closed, so the listening is recorded as history. */
const PAUSE_CLOSE_MS = 10 * 60 * 1000;
const MAX_TICK_S = 5;
/** Server ahead of us by more than this after a reconnect means another device listened meanwhile. */
const ADVANCED_THRESHOLD_S = 5;

const MIME_CANDIDATES = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/ogg', 'audio/webm', 'audio/wav'];

const EPISODE_DATE = {day: 'numeric', month: 'short', year: 'numeric'} as const;

/** "Behind the Bastards · 19 Nov 2026" over an episode's title in the player. */
export function episodeLine (show: string, episode: PodcastEpisode | null): string {
	const at = episode && episode.publishedAt;
	if (!at) return show;
	try {
		return show + ' · ' + new Date(at).toLocaleDateString('en-GB', EPISODE_DATE);
	} catch {
		return show;
	}
}

export function supportedMimeTypes (audio: HTMLAudioElement): string[] {
	return MIME_CANDIDATES.filter((t) => audio.canPlayType(t) !== '');
}

export const idlePlayerState: PlayerState = {
	status: 'idle',
	itemId: null,
	episodeId: null,
	title: '',
	author: '',
	narrator: '',
	seriesLine: '',
	series: null,
	libraryId: null,
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
	notice: null,
	sleep: null
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
	/** A sync was asked for while one was in flight; run another as soon as it finishes. */
	private resync = false;
	/** Wall-clock ms of the last successful sync, for the reconnect check. */
	private lastSyncOk = 0;
	private wasOffline = false;
	private mediaRetries = 0;
	private seekSyncTimer: number | null = null;
	private readonly rateCtl: PlayRateController;
	private noticeId = 0;
	/** Session closed but the book still loaded (paused a while, app hidden): Play opens a new one. */
	private suspendedAt: number | null = null;
	private pauseCloseTimer: number | null = null;
	/** When playback was last paused, for smart rewind. */
	private pausedAt: number | null = null;
	private sleepTick: number | null = null;
	/** Timer mode's running remainder; published state is only refreshed when something visible changes. */
	private sleepLeftMs = 0;
	/** Step back a little on resume, more after longer pauses (settings). */
	smartRewind = true;

	setSmartRewind (on: boolean): void {
		this.smartRewind = on;
	}
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

	/** Start a session for a book (or a podcast episode, with `episodeId`) at the server's saved position,
	    or at `startAt` (e.g. 0 to start over). Closes any current session first. */
	async open (itemId: string, autoplay = true, startAt?: number, episodeId: string | null = null): Promise<void> {
		const token = ++this.openToken;
		await this.close();
		if (token !== this.openToken) return;

		this.set({...idlePlayerState, rate: this.state.rate, sleep: this.state.sleep, status: 'loading', itemId, episodeId});
		this.pausedAt = null;
		try {
			const [item, session, progress] = await Promise.all([
				this.client.getItem(itemId),
				this.client.startPlayback(itemId, this.device, supportedMimeTypes(this.audio), episodeId),
				startAt === undefined ? this.client.getProgress(itemId, episodeId).catch(() => null) : Promise.resolve(null)
			]);
			if (token !== this.openToken) {
				this.client.closeSession(session.id).catch(() => undefined);
				return;
			}
			const tracks = (session.audioTracks || []).slice().sort((a, b) => a.startOffset - b.startOffset);
			if (!tracks.length) {
				this.client.closeSession(session.id).catch(() => undefined);
				throw new AbsError('notFound', episodeId ? 'This episode has no audio Vox Folio can play.' : 'This book has no audio files Vox Folio can play.');
			}
			this.session = session;
			this.tracks = tracks;
			const md = item.media.metadata;
			const episode = episodeId ? (item.media.episodes || []).find((e) => e.id === episodeId) || null : null;
			const series = !episodeId && md.series ? md.series[0] : undefined;
			const duration = session.duration || bookDuration(tracks);
			let position = clamp(startAt !== undefined ? startAt : session.currentTime || 0, 0, duration);
			// Coming back to a book after a while: step back a little so the sentence makes sense.
			if (startAt === undefined && this.smartRewind && progress && position > 0) {
				position = rewindWithinChapter(session.chapters || [], position, smartRewindSeconds(Date.now() - progress.lastUpdate));
			}
			this.lastSyncOk = Date.now();
			this.set({
				// An episode shows its own title, with the show (and its date) where a book shows its series.
				title: episodeId ? (episode ? episode.title.trim() : session.displayTitle) : md.title || session.displayTitle,
				author: episodeId ? md.author || md.title || session.displayAuthor || '' : md.authorName || session.displayAuthor || '',
				narrator: episodeId ? '' : md.narratorName || '',
				seriesLine: episodeId ? episodeLine(md.title, episode) : series ? series.name + (series.sequence ? ' · Book ' + series.sequence : '') : '',
				series: series || null,
				libraryId: item.libraryId,
				coverUrl: item.media.coverPath ? this.client.coverUrl(itemId) : '',
				duration,
				position,
				chapters: session.chapters || [],
				chapterIndex: chapterIndexAt(session.chapters || [], position),
				lastSyncedAt: Date.now()
			});
			// An end-of-chapter timer carried over from the previous book follows this book's chapter.
			const sleep = this.state.sleep;
			if (sleep && sleep.mode === 'chapter') {
				this.set({sleep: {...sleep, chapterIndex: chapterIndexAt(session.chapters || [], position)}});
			}
			this.loadAt(position, autoplay);
		} catch (e) {
			if (token !== this.openToken) return;
			this.set({status: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		}
	}

	/** Close the listening session (recording it as history) but keep the book loaded, so Play picks up
	    where it left off with a fresh session. Used when the app is hidden or exits, after a long pause,
	    and at the end of a book. `keepalive` lets the request finish while the app is shutting down. */
	async suspend (keepalive = false): Promise<void> {
		const session = this.session;
		this.clearPauseClose();
		if (!session) return;
		this.stopSyncTimer();
		this.accumulate();
		const payload = this.payload();
		this.session = null;
		this.listened = 0;
		this.lastTick = null;
		this.suspendedAt = Date.now();
		if (!this.audio.paused) {
			this.pausedAt = Date.now();
			this.audio.pause();
		}
		if (this.state.status === 'playing' || this.state.status === 'loading') this.set({status: 'paused'});
		try {
			await this.client.closeSession(session.id, payload, keepalive);
		} catch {
			// Offline: the server's last sync stands, and it closes stale sessions itself.
		}
	}

	/** Play after a suspend: open a new session at our place (or a newer one from another device). */
	private async resume (): Promise<void> {
		const itemId = this.state.itemId;
		const since = this.suspendedAt;
		if (!itemId || since === null) return;
		const token = ++this.openToken;
		this.set({status: 'loading'});
		try {
			const [session, progress] = await Promise.all([
				this.client.startPlayback(itemId, this.device, supportedMimeTypes(this.audio), this.state.episodeId),
				this.client.getProgress(itemId, this.state.episodeId).catch(() => null)
			]);
			if (token !== this.openToken) {
				this.client.closeSession(session.id).catch(() => undefined);
				return;
			}
			let position = this.state.position;
			const newer = progress && progress.lastUpdate > since + 1000 && Math.abs(progress.currentTime - position) > ADVANCED_THRESHOLD_S;
			if (newer && progress) {
				position = progress.currentTime;
				this.notify('Picked up from another device at ' + formatClock(position));
			}
			if (this.smartRewind && this.pausedAt !== null) {
				position = rewindWithinChapter(this.state.chapters, position, smartRewindSeconds(Date.now() - this.pausedAt));
			}
			this.session = session;
			this.tracks = (session.audioTracks || []).slice().sort((a, b) => a.startOffset - b.startOffset);
			this.suspendedAt = null;
			this.pausedAt = null;
			this.lastSyncOk = Date.now();
			this.set({position, chapterIndex: chapterIndexAt(this.state.chapters, position)});
			this.loadAt(position, true);
		} catch (e) {
			if (token !== this.openToken) return;
			this.set({status: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		}
	}

	private clearPauseClose (): void {
		if (this.pauseCloseTimer !== null) {
			window.clearTimeout(this.pauseCloseTimer);
			this.pauseCloseTimer = null;
		}
	}

	/** Flush the latest position and close the session. Safe to call at any time. */
	async close (): Promise<void> {
		const session = this.session;
		this.clearPauseClose();
		this.suspendedAt = null;
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
		if (!this.session) {
			if (this.suspendedAt !== null && this.tracks.length) this.resume();
			return;
		}
		if (this.state.status === 'ended') {
			this.seek(0);
		} else if (this.smartRewind && this.pausedAt !== null) {
			const back = smartRewindSeconds(Date.now() - this.pausedAt);
			if (back > 0) this.seek(rewindWithinChapter(this.state.chapters, this.state.position, back));
		}
		this.pausedAt = null;
		this.audio.play().catch(() => undefined);
	}

	// ---- sleep timer --------------------------------------------------------------------------------

	/** Start, change or cancel the sleep timer: minutes, 'chapter' (end of the current chapter) or 'off'. */
	setSleep (choice: number | 'chapter' | 'off'): void {
		this.audio.volume = 1;
		this.sleepTick = null;
		if (choice === 'off') {
			this.set({sleep: null});
		} else if (choice === 'chapter') {
			this.set({sleep: {mode: 'chapter', chapterIndex: Math.max(0, this.state.chapterIndex), remainingMs: this.chapterRemainingMs(Math.max(0, this.state.chapterIndex)), prompt: false}});
		} else {
			const ms = choice * 60 * 1000;
			this.sleepLeftMs = ms;
			this.set({sleep: {mode: 'timer', durationMs: ms, remainingMs: ms, prompt: false}});
		}
	}

	/** "Still listening?" answered: add the same time again (or run to the end of the next chapter). */
	extendSleep (): void {
		const sleep = this.state.sleep;
		if (!sleep) return;
		this.audio.volume = 1;
		if (sleep.mode === 'timer') {
			this.sleepLeftMs += sleep.durationMs;
			this.set({sleep: {...sleep, remainingMs: this.sleepLeftMs, prompt: false, endsAt: sleep.endsAt ? Date.now() + this.sleepLeftMs : null}});
		} else {
			const next = Math.min(sleep.chapterIndex + 1, Math.max(0, this.state.chapters.length - 1));
			this.set({sleep: {mode: 'chapter', chapterIndex: next, remainingMs: this.chapterRemainingMs(next), prompt: false}});
		}
	}

	/** Book position straight from the audio element (state.position only moves in whole seconds). */
	private livePosition (): number {
		const track = this.tracks[this.trackIndex];
		return track && this.pendingOffset === null ? track.startOffset + this.audio.currentTime : this.state.position;
	}

	private chapterRemainingMs (index: number): number {
		const chapter = this.state.chapters[index];
		const end = chapter ? chapter.end : this.state.duration;
		return Math.max(0, (end - this.livePosition()) / (this.state.rate || 1)) * 1000;
	}

	/** Runs on every timeupdate while playing: count down, fade, ask, and finally pause. */
	private tickSleep (): void {
		const sleep = this.state.sleep;
		if (!sleep) return;
		const now = Date.now();
		let remaining: number;
		if (sleep.mode === 'timer') {
			const dt = this.sleepTick === null ? 0 : Math.min(MAX_TICK_S * 1000, Math.max(0, now - this.sleepTick));
			remaining = this.sleepLeftMs - dt;
			this.sleepLeftMs = remaining;
		} else {
			remaining = this.state.chapterIndex > sleep.chapterIndex ? 0 : this.chapterRemainingMs(sleep.chapterIndex);
		}
		this.sleepTick = now;
		this.audio.volume = remaining < SLEEP_FADE_MS ? Math.max(0, remaining / SLEEP_FADE_MS) : 1;
		if (remaining <= 0) {
			this.sleepTick = null;
			this.set({sleep: null});
			this.pause();
			this.audio.volume = 1;
			this.notify('Sleep timer: paused at ' + formatClock(this.state.position));
			return;
		}
		const prompt = remaining <= SLEEP_PROMPT_MS;
		const endsAt = now + remaining;
		// Re-emit when something visible changes, or the deadline drifts noticeably (seek, speed change).
		const drift = sleep.endsAt ? Math.abs(endsAt - sleep.endsAt) : Infinity;
		if (prompt !== sleep.prompt || drift > 400 || Math.floor(remaining / 60000) !== Math.floor(sleep.remainingMs / 60000)) {
			this.set({sleep: {...sleep, remainingMs: remaining, prompt, endsAt}});
		}
	}

	pause (): void {
		this.audio.pause();
	}

	toggle (): void {
		if (this.audio.paused) this.play();
		else this.pause();
	}

	seek (bookTime: number): void {
		// Seeking works while suspended too; the new spot is used when playback resumes.
		if (!this.tracks.length) return;
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
		if (!session && this.suspendedAt !== null && this.state.itemId) {
			// Suspended: show a newer position from another device straight away.
			try {
				const progress = await this.client.getProgress(this.state.itemId, this.state.episodeId);
				if (progress && progress.lastUpdate > this.suspendedAt + 1000 && Math.abs(progress.currentTime - this.state.position) > ADVANCED_THRESHOLD_S) {
					this.seek(progress.currentTime);
					this.suspendedAt = Date.now();
					this.notify('Picked up from another device at ' + formatClock(progress.currentTime));
				}
			} catch {
				// Offline: keep our position.
			}
			return;
		}
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
		// The book is done: close the session so it's recorded.
		this.suspend();
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
		if (!this.audio.paused) this.tickSleep();
	};

	private onPlaying = (): void => {
		this.mediaRetries = 0;
		this.rateCtl.apply(this.state.rate);
		this.lastTick = Date.now();
		this.sleepTick = Date.now();
		this.pausedAt = null;
		this.clearPauseClose();
		this.set({status: 'playing'});
		this.startSyncTimer();
	};

	private onPause = (): void => {
		if (this.state.status === 'ended' || this.pendingOffset !== null) return;
		this.accumulate();
		this.lastTick = null;
		this.sleepTick = null;
		this.pausedAt = Date.now();
		if (this.session) this.set({status: 'paused', sleep: this.state.sleep ? {...this.state.sleep, endsAt: null} : null});
		this.stopSyncTimer();
		this.sync();
		// A long pause closes the session so it's recorded; Play opens a new one.
		this.clearPauseClose();
		if (this.session) this.pauseCloseTimer = window.setTimeout(() => this.suspend(), PAUSE_CLOSE_MS);
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
			timeListened: Math.round(this.listened),
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
		if (!session) return;
		if (this.syncing) {
			this.resync = true;
			return;
		}
		this.syncing = true;
		try {
			if (this.wasOffline && await this.adoptNewerServerPosition(session.libraryItemId, true)) return;
			const payload = this.payload();
			await this.client.syncSession(session.id, payload);
			this.listened = Math.max(0, this.listened - payload.timeListened);
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
			if (this.resync && this.session === session) {
				this.resync = false;
				this.sync();
			}
		}
	}

	/** If another device saved a newer position since our last successful sync, jump to it rather than
	    overwrite it with ours. After an outage only a position further on counts (`requireAhead`);
	    when resuming a paused book, any newer position does. Returns true when it moved. */
	private async adoptNewerServerPosition (itemId: string, requireAhead: boolean): Promise<boolean> {
		const progress = await this.client.getProgress(itemId, this.state.episodeId);
		if (!progress) return false;
		const newer = progress.lastUpdate > this.lastSyncOk;
		const delta = progress.currentTime - this.state.position;
		const moved = requireAhead ? delta > ADVANCED_THRESHOLD_S : Math.abs(delta) > ADVANCED_THRESHOLD_S;
		if (!newer || !moved) return false;
		this.listened = 0;
		this.lastSyncOk = Date.now();
		this.wasOffline = false;
		const back = this.smartRewind ? smartRewindSeconds(Date.now() - progress.lastUpdate) : 0;
		this.seek(rewindWithinChapter(this.state.chapters, progress.currentTime, back));
		// The rewind for the other device's pause is applied here; don't add ours on play.
		this.pausedAt = null;
		this.set({sync: 'synced', lastSyncedAt: this.lastSyncOk, unsyncedSeconds: 0});
		this.notify('Picked up from another device at ' + formatClock(progress.currentTime));
		return true;
	}
}
