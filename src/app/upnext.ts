/* What plays after the current book or episode: the next book in its series, or the next episode
   of a podcast in the order they were published. */

import {progressKey} from '../abs/client';
import type {AbsClient} from '../abs/client';
import type {MediaProgress, PodcastEpisode} from '../abs/types';
import {episodeDate, episodeTitle} from './podcasts';
import type {SeriesEntry} from './series';

export interface NextUp {
	/** progressKey of what plays next (pass to openBook). */
	key: string;
	itemId: string;
	episodeId: string | null;
	title: string;
	author: string;
	/** Books: the series sequence, for "Book 3". */
	sequence: string | null;
	/** Episodes: when it was published, "19 Nov 2026". */
	date: string;
	hasCover: boolean;
	/** Overrides the Up Next eyebrow, e.g. "Weekend queue · 2 of 3" in a playlist. */
	label?: string;
}

export function fromSeries (e: SeriesEntry): NextUp {
	const md = e.item.media.metadata;
	return {key: e.item.id, itemId: e.item.id, episodeId: null, title: md.title, author: md.authorName || '', sequence: e.sequence, date: '', hasCover: Boolean(e.item.media.coverPath)};
}

/** The next episode published after `currentId` (Part One → Part Two) that hasn't been played, or null
    when there's none newer. */
export function nextEpisode (episodes: PodcastEpisode[], currentId: string, played: (id: string) => boolean = () => false): PodcastEpisode | null {
	const ordered = episodes.slice().sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0));
	const at = ordered.map((e) => e.id).indexOf(currentId);
	if (at < 0) return null;
	for (let i = at + 1; i < ordered.length; i++) {
		if (!played(ordered[i].id)) return ordered[i];
	}
	return null;
}

export function fromEpisode (e: PodcastEpisode, show: string, hasCover: boolean): NextUp {
	return {key: progressKey(e.libraryItemId, e.id), itemId: e.libraryItemId, episodeId: e.id, title: episodeTitle(e), author: show, sequence: null, date: episodeDate(e), hasCover};
}

/** Look up the next episode of a show from the server. */
export async function findNextEpisode (client: AbsClient, showId: string, episodeId: string): Promise<NextUp | null> {
	const [show, progress] = await Promise.all([client.getItem(showId), client.progressByItem().catch(() => ({} as Record<string, MediaProgress>))]);
	const played = (id: string) => {
		const p = progress[progressKey(showId, id)];
		return Boolean(p && p.isFinished);
	};
	const next = nextEpisode(show.media.episodes || [], episodeId, played);
	return next ? fromEpisode({...next, libraryItemId: showId}, show.media.metadata.title, Boolean(show.media.coverPath)) : null;
}
