/* Podcast helpers: finding the podcast library, and how episodes read on screen. */

import type {AbsClient} from '../abs/client';
import {progressKey} from '../abs/client';
import type {MediaProgress, PodcastEpisode} from '../abs/types';
import {formatDuration} from '../player/timeline';

const libraryIds = new WeakMap<AbsClient, Promise<string | null>>();

/** The account's first podcast library, or null when it has none (asked once per account). */
export function podcastLibraryId (client: AbsClient): Promise<string | null> {
	let found = libraryIds.get(client);
	if (!found) {
		found = client.libraries('podcast').then((libs) => (libs.length ? libs[0].id : null));
		found.catch(() => libraryIds.delete(client));
		libraryIds.set(client, found);
	}
	return found;
}

/** Episode titles from feeds often carry stray spaces. */
export function episodeTitle (e: PodcastEpisode): string {
	return (e.title || '').replace(/\s+/g, ' ').trim();
}

const SHORT_DATE = {day: 'numeric', month: 'short', year: 'numeric'} as const;

const DAY_MONTH = {day: 'numeric', month: 'short'} as const;

/** "19 Nov" this year, "19 Nov 2025" before: short enough for a tile. */
export function episodeTileDate (e: PodcastEpisode, now: Date = new Date()): string {
	if (!e.publishedAt) return '';
	const d = new Date(e.publishedAt);
	try {
		return d.getFullYear() === now.getFullYear() ? d.toLocaleDateString('en-GB', DAY_MONTH) : d.toLocaleDateString('en-GB', SHORT_DATE);
	} catch {
		return '';
	}
}

export function episodeDate (e: PodcastEpisode): string {
	if (!e.publishedAt) return '';
	try {
		return new Date(e.publishedAt).toLocaleDateString('en-GB', SHORT_DATE);
	} catch {
		return '';
	}
}

export interface EpisodeState {
	finished: boolean;
	/** 0–100, or 0 when not started. */
	percent: number;
	/** Seconds left, when started. */
	left: number | null;
}

export function episodeState (e: PodcastEpisode, progress: Record<string, MediaProgress>): EpisodeState {
	const p = progress[progressKey(e.libraryItemId, e.id)];
	if (!p) return {finished: false, percent: 0, left: null};
	if (p.isFinished) return {finished: true, percent: 100, left: null};
	const duration = p.duration || e.duration || 0;
	const started = p.currentTime > 0;
	return {
		finished: false,
		percent: started ? Math.max(1, Math.round((p.progress || (duration ? p.currentTime / duration : 0)) * 100)) : 0,
		left: started && duration ? Math.max(0, duration - p.currentTime) : null
	};
}

/** "1h 20m" or "34m left". */
export function episodeLength (e: PodcastEpisode, s: EpisodeState): string {
	if (s.left !== null) return formatDuration(s.left) + ' left';
	return e.duration ? formatDuration(e.duration) : '';
}

/** Plain text from a feed's HTML description. */
export function plainText (html: string | undefined | null): string {
	if (!html) return '';
	// Paragraphs and line breaks become spaces, so sentences don't run together.
	const spaced = html.replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, ' ');
	const doc = new DOMParser().parseFromString(spaced, 'text/html');
	return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}
