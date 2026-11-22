import {AbsError} from '../abs/client';
import type {AbsClient} from '../abs/client';
import type {MediaProgress, PlaybackSession, SyncPayload} from '../abs/types';
import {PlayerEngine} from './engine';

/** Just enough of HTMLAudioElement for the engine. */
class FakeAudio extends EventTarget {
	paused = true;
	currentTime = 0;
	readyState = 0;
	volume = 1;
	playbackRate = 1;
	defaultPlaybackRate = 1;
	preload = '';
	private source: string | null = null;

	get src () {
		return this.source || '';
	}

	set src (v: string) {
		this.source = v;
	}

	getAttribute (name: string) {
		return name === 'src' ? this.source : null;
	}

	removeAttribute (name: string) {
		if (name === 'src') this.source = null;
	}

	canPlayType (t: string) {
		return t === 'audio/mpeg' || t === 'audio/mp4' ? 'maybe' : '';
	}

	load () {
		if (!this.paused) {
			this.paused = true;
			this.dispatchEvent(new Event('pause'));
		}
		this.currentTime = 0;
		if (this.source) {
			this.readyState = 1;
			this.dispatchEvent(new Event('loadedmetadata'));
		}
	}

	play () {
		this.paused = false;
		this.dispatchEvent(new Event('playing'));
		return Promise.resolve();
	}

	pause () {
		if (this.paused) return;
		this.paused = true;
		this.dispatchEvent(new Event('pause'));
	}

	/** Advance playback by `s` seconds of media time and fire timeupdate. */
	advance (s: number) {
		this.currentTime += s;
		this.dispatchEvent(new Event('timeupdate'));
	}

	end () {
		this.paused = true;
		this.dispatchEvent(new Event('ended'));
	}
}

const session = (currentTime = 100): PlaybackSession => ({
	id: 'sess-1',
	libraryItemId: 'item-1',
	displayTitle: 'Bad Monkey',
	displayAuthor: 'Carl Hiaasen',
	duration: 1200,
	currentTime,
	playMethod: 0,
	chapters: [
		{id: 0, start: 0, end: 600, title: 'One'},
		{id: 1, start: 600, end: 1200, title: 'Two'}
	],
	audioTracks: [
		{index: 1, startOffset: 0, duration: 600, title: 'a', contentUrl: '/f/1', mimeType: 'audio/mpeg'},
		{index: 2, startOffset: 600, duration: 600, title: 'b', contentUrl: '/f/2', mimeType: 'audio/mpeg'}
	]
});

function makeClient (overrides: Partial<Record<keyof AbsClient, unknown>> = {}) {
	const syncs: SyncPayload[] = [];
	const closes: (SyncPayload | undefined)[] = [];
	const client = {
		getItem: jest.fn(async () => ({id: 'item-1', libraryId: 'l', mediaType: 'book', media: {coverPath: '/c', metadata: {title: 'Bad Monkey', authorName: 'Carl Hiaasen', series: []}}})),
		startPlayback: jest.fn(async () => session()),
		syncSession: jest.fn(async (_id: string, p: SyncPayload) => {
			syncs.push(p);
		}),
		closeSession: jest.fn(async (_id: string, p?: SyncPayload) => {
			closes.push(p);
		}),
		getProgress: jest.fn(async (): Promise<MediaProgress | null> => null),
		refresh: jest.fn(async () => undefined),
		authorisedUrl: (p: string) => 'https://abs.test' + p + '?token=t',
		coverUrl: () => 'https://abs.test/cover',
		...overrides
	};
	return {client: client as unknown as AbsClient, raw: client, syncs, closes};
}

const device = {deviceId: 'd', clientName: 'Vox Folio', clientVersion: '0', manufacturer: 'LG', model: 'TV'};
const flush = () => new Promise((r) => jest.requireActual<typeof globalThis>('timers').setImmediate(r));

beforeEach(() => {
	jest.useFakeTimers({now: 1_000_000});
});

afterEach(() => {
	jest.useRealTimers();
});

async function openEngine (c = makeClient(), smartRewind = false) {
	const audio = new FakeAudio();
	const engine = new PlayerEngine(c.client, audio as unknown as HTMLAudioElement, device);
	// Most tests are about sync; smart rewind has its own tests below.
	engine.smartRewind = smartRewind;
	await engine.open('item-1');
	return {audio, engine, ...c};
}

test('opens at the server position, in the right file, and starts playing', async () => {
	const {audio, engine, raw} = await openEngine();
	expect(raw.startPlayback).toHaveBeenCalledWith('item-1', device, ['audio/mpeg', 'audio/mp4'], null);
	expect(audio.src).toBe('https://abs.test/f/1?token=t');
	expect(audio.currentTime).toBe(100);
	expect(engine.getState().status).toBe('playing');
	expect(engine.getState().chapterIndex).toBe(0);
});

test('pause syncs book position and only the time actually spent playing', async () => {
	const {audio, engine, syncs} = await openEngine();
	jest.setSystemTime(1_000_000 + 4000);
	audio.advance(4);
	engine.pause();
	await flush();
	expect(syncs).toHaveLength(1);
	expect(syncs[0].currentTime).toBe(104);
	expect(syncs[0].timeListened).toBe(4);

	// A paused minute adds no listening time.
	jest.setSystemTime(1_000_000 + 64000);
	engine.play();
	jest.setSystemTime(1_000_000 + 66000);
	audio.advance(2);
	engine.pause();
	await flush();
	expect(syncs[1].timeListened).toBe(2);
});

test('playback speed changes position, not listening time', async () => {
	const {audio, engine, syncs} = await openEngine();
	engine.setRate(2);
	expect(audio.playbackRate).toBe(2);
	jest.setSystemTime(1_000_000 + 5000);
	audio.advance(10);
	engine.pause();
	await flush();
	expect(syncs[0].currentTime).toBe(110);
	expect(syncs[0].timeListened).toBe(5);
});

test('syncs periodically while playing', async () => {
	const {audio, syncs} = await openEngine();
	for (let i = 0; i < 15; i++) {
		jest.setSystemTime(1_000_000 + (i + 1) * 1000);
		audio.advance(1);
	}
	jest.advanceTimersByTime(15000);
	await flush();
	expect(syncs.length).toBeGreaterThanOrEqual(1);
	expect(syncs[0].currentTime).toBe(115);
});

test('continues into the next file at a file boundary', async () => {
	const {audio, engine} = await openEngine();
	audio.end();
	expect(audio.src).toBe('https://abs.test/f/2?token=t');
	expect(audio.paused).toBe(false);
	audio.advance(30);
	expect(engine.getState().position).toBe(630);
	expect(engine.getState().chapterIndex).toBe(1);
});

test('seeking across files loads the other file at the right offset', async () => {
	const {audio, engine} = await openEngine();
	engine.seek(900);
	expect(audio.src).toBe('https://abs.test/f/2?token=t');
	expect(audio.currentTime).toBe(300);
	expect(audio.paused).toBe(false);
});

test('chapter controls move between chapters', async () => {
	const {audio, engine} = await openEngine();
	engine.nextChapter();
	expect(engine.getState().position).toBe(600);
	expect(audio.src).toBe('https://abs.test/f/2?token=t');
	engine.previousChapter();
	expect(engine.getState().position).toBe(0);
});

test('seeking while paused saves the new position after a short pause', async () => {
	const {engine, syncs} = await openEngine();
	engine.pause();
	await flush();
	engine.nextChapter();
	engine.skip(30);
	expect(syncs).toHaveLength(1);
	jest.advanceTimersByTime(1500);
	await flush();
	expect(syncs).toHaveLength(2);
	expect(syncs[1].currentTime).toBe(630);
	expect(syncs[1].timeListened).toBe(0);
});

test('closing flushes the position and closes the session once', async () => {
	const {audio, engine, closes, syncs} = await openEngine();
	jest.setSystemTime(1_000_000 + 3000);
	audio.advance(3);
	await engine.close();
	expect(closes).toEqual([{currentTime: 103, timeListened: 3, duration: 1200}]);
	expect(syncs).toHaveLength(0);
});

test('after an outage, a newer position from another device wins', async () => {
	let offline = true;
	const c = makeClient({
		syncSession: jest.fn(async () => {
			if (offline) throw new AbsError('network', 'down');
		}),
		getProgress: jest.fn(async () => ({libraryItemId: 'item-1', currentTime: 500, duration: 1200, progress: 0.4, isFinished: false, lastUpdate: 1_000_000 + 20000}))
	});
	const {audio, engine} = await openEngine(c);
	jest.setSystemTime(1_000_000 + 5000);
	audio.advance(5);
	engine.pause();
	await flush();
	expect(engine.getState().sync).toBe('offline');

	offline = false;
	jest.setSystemTime(1_000_000 + 30000);
	engine.play();
	engine.pause();
	await flush();
	expect(engine.getState().position).toBe(500);
	expect(engine.getState().sync).toBe('synced');
	expect(engine.getState().notice && engine.getState().notice!.text).toMatch(/another device/);
	expect(c.raw.syncSession).toHaveBeenCalledTimes(1);
});

test('after an outage, our position is written when nobody else moved the book', async () => {
	let offline = true;
	const c = makeClient({
		syncSession: jest.fn(async (_id: string, p: SyncPayload) => {
			if (offline) throw new AbsError('network', 'down');
			c.syncs.push(p);
		}),
		getProgress: jest.fn(async () => ({libraryItemId: 'item-1', currentTime: 100, duration: 1200, progress: 0.08, isFinished: false, lastUpdate: 900_000}))
	});
	const {audio, engine} = await openEngine(c);
	jest.setSystemTime(1_000_000 + 5000);
	audio.advance(5);
	engine.pause();
	await flush();
	offline = false;
	engine.play();
	engine.pause();
	await flush();
	expect(c.syncs[0].currentTime).toBe(105);
	expect(c.syncs[0].timeListened).toBe(5);
});

test('a book with no audio files reports an error and closes its session', async () => {
	const c = makeClient({startPlayback: jest.fn(async () => ({...session(), audioTracks: []}))});
	const {engine} = await openEngine(c);
	expect(engine.getState().status).toBe('error');
	expect(c.raw.closeSession).toHaveBeenCalled();
});

test('resuming a paused book takes a newer position saved by another device', async () => {
	const c = makeClient({
		getProgress: jest.fn(async () => ({libraryItemId: 'item-1', currentTime: 40, duration: 1200, progress: 0.03, isFinished: false, lastUpdate: 1_000_000 + 60000}))
	});
	const {engine} = await openEngine(c);
	engine.pause();
	await flush();
	jest.setSystemTime(1_000_000 + 120000);
	await engine.catchUp();
	expect(engine.getState().position).toBe(40);
	expect(engine.getState().notice && engine.getState().notice!.text).toMatch(/another device/);
});

test('catching up leaves our position alone when the server has nothing newer', async () => {
	const c = makeClient({
		getProgress: jest.fn(async () => ({libraryItemId: 'item-1', currentTime: 900, duration: 1200, progress: 0.75, isFinished: false, lastUpdate: 900_000}))
	});
	const {engine} = await openEngine(c);
	engine.pause();
	await flush();
	await engine.catchUp();
	expect(engine.getState().position).toBe(100);
});

test('can start over from the beginning instead of the saved position', async () => {
	const c = makeClient();
	const audio = new FakeAudio();
	const engine = new PlayerEngine(c.client, audio as unknown as HTMLAudioElement, device);
	await engine.open('item-1', true, 0);
	expect(engine.getState().position).toBe(0);
	expect(audio.currentTime).toBe(0);
});

describe('smart rewind', () => {
	test('resuming after a ten-minute pause steps back 15 s', async () => {
		const {audio, engine} = await openEngine(makeClient(), true);
		jest.setSystemTime(1_000_000 + 2000);
		audio.advance(2);
		engine.pause();
		jest.setSystemTime(1_000_000 + 2000 + 11 * 60 * 1000);
		engine.play();
		expect(engine.getState().position).toBe(87);
	});

	test('a short pause resumes exactly where it stopped', async () => {
		const {audio, engine} = await openEngine(makeClient(), true);
		audio.advance(2);
		engine.pause();
		jest.setSystemTime(1_000_000 + 20000);
		engine.play();
		expect(engine.getState().position).toBe(102);
	});

	test('opening a book last played an hour ago starts 30 s earlier, within the chapter', async () => {
		const c = makeClient({
			getProgress: jest.fn(async () => ({libraryItemId: 'item-1', currentTime: 100, duration: 1200, progress: 0.08, isFinished: false, lastUpdate: 1_000_000 - 2 * 60 * 60 * 1000}))
		});
		const {engine} = await openEngine(c, true);
		expect(engine.getState().position).toBe(70);
	});

	test('it never rewinds past the start of the chapter', async () => {
		const c = makeClient({
			startPlayback: jest.fn(async () => session(610)),
			getProgress: jest.fn(async () => ({libraryItemId: 'item-1', currentTime: 610, duration: 1200, progress: 0.5, isFinished: false, lastUpdate: 0}))
		});
		const {engine} = await openEngine(c, true);
		expect(engine.getState().position).toBe(600);
	});

	test('starting over does not rewind', async () => {
		const c = makeClient();
		const audio = new FakeAudio();
		const engine = new PlayerEngine(c.client, audio as unknown as HTMLAudioElement, device);
		await engine.open('item-1', true, 0);
		expect(engine.getState().position).toBe(0);
	});
});

describe('sleep timer', () => {
	function playFor (audio: FakeAudio, seconds: number, startMs: number) {
		for (let i = 1; i <= seconds; i++) {
			jest.setSystemTime(startMs + i * 1000);
			audio.advance(1);
		}
		return startMs + seconds * 1000;
	}

	test('asks "still listening?", fades, then pauses when the time is up', async () => {
		const {audio, engine} = await openEngine();
		engine.setSleep(1);
		let t = playFor(audio, 25, 1_000_000);
		expect(engine.getState().sleep!.prompt).toBe(false);
		t = playFor(audio, 10, t);
		expect(engine.getState().sleep!.prompt).toBe(true);
		t = playFor(audio, 20, t);
		expect(audio.volume).toBeLessThan(1);
		playFor(audio, 6, t);
		expect(audio.paused).toBe(true);
		expect(engine.getState().sleep).toBeNull();
		expect(audio.volume).toBe(1);
		expect(engine.getState().notice!.text).toMatch(/Sleep timer/);
	});

	test('time paused does not count', async () => {
		const {audio, engine} = await openEngine();
		engine.setSleep(1);
		playFor(audio, 10, 1_000_000);
		engine.pause();
		jest.setSystemTime(1_000_000 + 10 * 60 * 1000);
		engine.play();
		playFor(audio, 5, 1_000_000 + 10 * 60 * 1000);
		expect(engine.getState().sleep!.remainingMs).toBeGreaterThan(40 * 1000);
	});

	test('extending adds the same time again and restores the volume', async () => {
		const {audio, engine} = await openEngine();
		engine.setSleep(1);
		playFor(audio, 55, 1_000_000);
		expect(audio.volume).toBeLessThan(1);
		engine.extendSleep();
		expect(audio.volume).toBe(1);
		expect(engine.getState().sleep!.prompt).toBe(false);
		expect(engine.getState().sleep!.remainingMs).toBeGreaterThan(60 * 1000);
	});

	test('end of chapter pauses when the chapter ends', async () => {
		const c = makeClient({startPlayback: jest.fn(async () => session(590))});
		const {audio, engine} = await openEngine(c);
		engine.setSleep('chapter');
		expect(engine.getState().sleep!.mode).toBe('chapter');
		playFor(audio, 11, 1_000_000);
		expect(audio.paused).toBe(true);
		expect(engine.getState().sleep).toBeNull();
	});

	test('off cancels it', async () => {
		const {engine} = await openEngine();
		engine.setSleep(30);
		engine.setSleep('off');
		expect(engine.getState().sleep).toBeNull();
	});
});

test('a sync asked for while another is in flight still happens, with the latest position', async () => {
	let release: () => void = () => undefined;
	const syncs: SyncPayload[] = [];
	const c = makeClient({
		syncSession: jest.fn((_id: string, p: SyncPayload) => {
			syncs.push(p);
			return syncs.length === 1 ? new Promise<void>((r) => {
				release = r;
			}) : Promise.resolve();
		})
	});
	const {audio, engine} = await openEngine(c);
	engine.pause(); // first sync starts and hangs
	engine.play();
	jest.setSystemTime(1_000_000 + 3000);
	audio.advance(3);
	engine.pause(); // asks again while the first is in flight
	release();
	await flush();
	await flush();
	expect(syncs).toHaveLength(2);
	expect(syncs[1].currentTime).toBe(103);
});

describe('closing sessions so listening is recorded', () => {
	test('suspend closes the session with the listening time but keeps the book loaded', async () => {
		const {audio, engine, closes, raw} = await openEngine();
		for (let i = 1; i <= 8; i++) {
			jest.setSystemTime(1_000_000 + i * 1000);
			audio.advance(1);
		}
		await engine.suspend();
		expect(closes).toEqual([{currentTime: 108, timeListened: 8, duration: 1200}]);
		expect(audio.paused).toBe(true);
		expect(engine.getState().status).toBe('paused');
		expect(engine.getState().itemId).toBe('item-1');
		expect(raw.startPlayback).toHaveBeenCalledTimes(1);
	});

	test('Play after a suspend opens a fresh session at our place', async () => {
		const {audio, engine, raw} = await openEngine();
		audio.advance(8);
		await engine.suspend();
		engine.play();
		await flush();
		expect(raw.startPlayback).toHaveBeenCalledTimes(2);
		expect(engine.getState().position).toBe(108);
		expect(audio.paused).toBe(false);
	});

	test('seeking while suspended is kept when playback resumes', async () => {
		const {engine} = await openEngine();
		await engine.suspend();
		engine.seek(700);
		engine.play();
		await flush();
		expect(engine.getState().position).toBe(700);
	});

	test('a newer position from another device wins on resume', async () => {
		const c = makeClient();
		const {engine} = await openEngine(c);
		await engine.suspend();
		(c.raw.getProgress as jest.Mock).mockImplementation(async () => ({libraryItemId: 'item-1', currentTime: 900, duration: 1200, progress: 0.75, isFinished: false, lastUpdate: 1_000_000 + 60000}));
		jest.setSystemTime(1_000_000 + 120000);
		engine.play();
		await flush();
		expect(engine.getState().position).toBe(900);
	});

	test('a long pause closes the session on its own', async () => {
		const {engine, closes} = await openEngine();
		engine.pause();
		await flush();
		expect(closes).toHaveLength(0);
		jest.advanceTimersByTime(10 * 60 * 1000);
		await flush();
		expect(closes).toHaveLength(1);
	});

	test('playing again before then keeps the same session', async () => {
		const {engine, closes} = await openEngine();
		engine.pause();
		jest.advanceTimersByTime(60 * 1000);
		engine.play();
		jest.advanceTimersByTime(20 * 60 * 1000);
		await flush();
		expect(closes).toHaveLength(0);
	});

	test('finishing the book closes the session', async () => {
		const c = makeClient({startPlayback: jest.fn(async () => session(1150))});
		const {audio, closes} = await openEngine(c);
		audio.end(); // first file ends → second loads
		audio.end(); // last file ends
		await flush();
		expect(closes).toHaveLength(1);
	});
});

describe('podcast episodes', () => {
	test('opens an episode session and shows the episode under its show', async () => {
		const c = makeClient({
			getItem: jest.fn(async () => ({
				id: 'show-1', libraryId: 'p', mediaType: 'podcast',
				media: {coverPath: '/c', metadata: {title: 'Behind the Bastards', author: 'Cool Zone Media'}, episodes: [
					{id: 'ep-2', libraryItemId: 'show-1', title: ' Part Two: Example ', publishedAt: Date.UTC(2026, 10, 19, 10)}
				]}
			}))
		});
		const audio = new FakeAudio();
		const engine = new PlayerEngine(c.client, audio as unknown as HTMLAudioElement, device);
		await engine.open('show-1', true, undefined, 'ep-2');
		expect(c.raw.startPlayback).toHaveBeenCalledWith('show-1', device, ['audio/mpeg', 'audio/mp4'], 'ep-2');
		expect(c.raw.getProgress).toHaveBeenCalledWith('show-1', 'ep-2');
		const s = engine.getState();
		expect(s.episodeId).toBe('ep-2');
		expect(s.title).toBe('Part Two: Example');
		expect(s.author).toBe('Cool Zone Media');
		expect(s.seriesLine).toBe('Behind the Bastards · 19 Nov 2026');
		// No series, so no Up Next or series autoplay for episodes.
		expect(s.series).toBeNull();
	});
});
