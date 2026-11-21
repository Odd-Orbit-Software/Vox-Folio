import {AbsError} from '../abs/client';
import type {AbsClient} from '../abs/client';
import type {MediaProgress, PlaybackSession, SyncPayload} from '../abs/types';
import {PlayerEngine} from './engine';

/** Just enough of HTMLAudioElement for the engine. */
class FakeAudio extends EventTarget {
	paused = true;
	currentTime = 0;
	readyState = 0;
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

async function openEngine (c = makeClient()) {
	const audio = new FakeAudio();
	const engine = new PlayerEngine(c.client, audio as unknown as HTMLAudioElement, device);
	await engine.open('item-1');
	return {audio, engine, ...c};
}

test('opens at the server position, in the right file, and starts playing', async () => {
	const {audio, engine, raw} = await openEngine();
	expect(raw.startPlayback).toHaveBeenCalledWith('item-1', device, ['audio/mpeg', 'audio/mp4']);
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
	expect(syncs[0].timeListening).toBe(4);

	// A paused minute adds no listening time.
	jest.setSystemTime(1_000_000 + 64000);
	engine.play();
	jest.setSystemTime(1_000_000 + 66000);
	audio.advance(2);
	engine.pause();
	await flush();
	expect(syncs[1].timeListening).toBe(2);
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
	expect(syncs[0].timeListening).toBe(5);
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
	expect(syncs[1].timeListening).toBe(0);
});

test('closing flushes the position and closes the session once', async () => {
	const {audio, engine, closes, syncs} = await openEngine();
	jest.setSystemTime(1_000_000 + 3000);
	audio.advance(3);
	await engine.close();
	expect(closes).toEqual([{currentTime: 103, timeListening: 3, duration: 1200}]);
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
	expect(c.syncs[0].timeListening).toBe(5);
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
