import type {MediaProgress, Playlist} from '../abs/types';
import {nextInQueue, queueFromPlaylist, queueIndex, queueStart} from './queue';

const book = (id: string, title: string) => ({id, mediaType: 'book', media: {metadata: {title, authorName: 'A'}, coverPath: '/c'}});
const show = {id: 's', mediaType: 'podcast', media: {metadata: {title: 'Show'}, coverPath: null}};

const playlist = {
	id: 'p', name: 'Weekend',
	items: [
		{libraryItemId: 'a', libraryItem: book('a', 'A book')},
		{libraryItemId: 's', episodeId: 'e1', libraryItem: show, episode: {id: 'e1', title: 'Ep one', publishedAt: 0}},
		{libraryItemId: 'b', libraryItem: book('b', 'B book')},
		{libraryItemId: 'gone'}
	]
} as unknown as Playlist;

const done = (key: string): Record<string, MediaProgress> => ({[key]: {libraryItemId: key, currentTime: 1, duration: 1, progress: 1, isFinished: true, lastUpdate: 0}});

describe('playlist queue', () => {
	test('keeps the playlist order and skips missing items', () => {
		const q = queueFromPlaylist(playlist);
		expect(q.entries.map((e) => e.key)).toEqual(['a', 's/e1', 'b']);
		expect(q.entries[1].author).toBe('Show');
		expect(queueIndex(q, 's/e1')).toBe(1);
		expect(queueIndex(q, 'x')).toBe(-1);
	});

	test('the next entry carries its place in the queue', () => {
		const q = queueFromPlaylist(playlist);
		const next = nextInQueue(q, 'a', {});
		expect(next && next.key).toBe('s/e1');
		expect(next && next.label).toBe('Weekend · 2 of 3');
		expect(nextInQueue(q, 'b', {})).toBeNull();
		expect(nextInQueue(q, 'x', {})).toBeNull();
	});

	test('skips finished entries', () => {
		const q = queueFromPlaylist(playlist);
		const next = nextInQueue(q, 'a', done('s/e1'));
		expect(next && next.key).toBe('b');
		expect(queueStart(q, done('a'))!.entry.key).toBe('s/e1');
		expect(queueStart(q, done('a'))!.at).toBe(1);
		const all = {...done('a'), ...done('s/e1'), ...done('b')};
		expect(queueStart(q, all)).toEqual(expect.objectContaining({at: 0, replay: true}));
		// A replay goes through finished entries too.
		expect(nextInQueue({...q, replay: true}, 'a', all)!.key).toBe('s/e1');
	});
});
