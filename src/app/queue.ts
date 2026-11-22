/* Playing a playlist in order: a queue of books or episodes. Up Next and autoplay follow the queue
   while what's playing is one of its entries; anything played from elsewhere leaves it. */

import {progressKey} from '../abs/client';
import type {LibraryItem, MediaProgress, Playlist} from '../abs/types';
import {episodeDate, episodeTitle} from './podcasts';
import type {NextUp} from './upnext';

export interface Queue {
	id: string;
	name: string;
	entries: NextUp[];
	/** Playing a playlist that was already all finished: go through it again, finished or not. */
	replay?: boolean;
	/** The account it belongs to, so a saved queue isn't picked up by another profile. */
	userId?: string;
}

/** The playlist's playable entries, in its order. */
export function queueFromPlaylist (playlist: Playlist): Queue {
	const entries: NextUp[] = [];
	(playlist.items || []).forEach((it) => {
		const item = it.libraryItem as LibraryItem | undefined;
		if (!item) return;
		const md = item.media.metadata;
		const hasCover = Boolean(item.media.coverPath);
		if (it.episodeId) {
			const ep = it.episode;
			entries.push({
				key: progressKey(item.id, it.episodeId), itemId: item.id, episodeId: it.episodeId,
				title: ep ? episodeTitle(ep) : md.title, author: md.title, sequence: null, date: ep ? episodeDate(ep) : '', hasCover
			});
		} else if (item.mediaType === 'book') {
			entries.push({key: item.id, itemId: item.id, episodeId: null, title: md.title, author: md.authorName || '', sequence: null, date: '', hasCover});
		}
	});
	return {id: playlist.id, name: playlist.name, entries};
}

export function queueIndex (queue: Queue | null, key: string | null): number {
	if (!queue || !key) return -1;
	return queue.entries.map((e) => e.key).indexOf(key);
}

/** What follows `key` in the queue, skipping anything already finished; null at the end. */
export function nextInQueue (queue: Queue, key: string, progress: Record<string, MediaProgress>): NextUp | null {
	const at = queueIndex(queue, key);
	if (at === -1) return null;
	for (let i = at + 1; i < queue.entries.length; i++) {
		const e = queue.entries[i];
		const p = progress[e.key];
		if (queue.replay || !(p && p.isFinished)) return {...e, label: queue.name + ' · ' + (i + 1) + ' of ' + queue.entries.length};
	}
	return null;
}

/** Where "Play all" starts: the first entry not yet finished. When every entry is finished, the
    first one, as a replay of the whole playlist. */
export function queueStart (queue: Queue, progress: Record<string, MediaProgress>): {entry: NextUp; at: number; replay: boolean} | null {
	const keys = queue.entries.map((e) => e.key);
	const open = queue.entries.filter((e) => !(progress[e.key] && progress[e.key].isFinished));
	if (open.length) return {entry: open[0], at: keys.indexOf(open[0].key), replay: false};
	return queue.entries.length ? {entry: queue.entries[0], at: 0, replay: true} : null;
}

const STORE_KEY = 'voxfolio.queue.v1';

/** The playlist being played survives a relaunch (it's small: keys and titles). */
export function saveQueue (queue: Queue | null): void {
	try {
		if (queue) window.localStorage.setItem(STORE_KEY, JSON.stringify(queue));
		else window.localStorage.removeItem(STORE_KEY);
	} catch {
		// Storage unavailable: the queue lasts for this run.
	}
}

export function loadQueue (userId: string): Queue | null {
	try {
		const raw = window.localStorage.getItem(STORE_KEY);
		const q = raw ? JSON.parse(raw) as Queue : null;
		return q && q.userId === userId && Array.isArray(q.entries) ? q : null;
	} catch {
		return null;
	}
}
