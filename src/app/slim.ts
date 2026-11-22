/* Slim copies of server items for the saved Home (instant start). */

import type {LibraryItem, PodcastEpisode} from '../abs/types';

/** Only what Home draws: the server sends far more (descriptions, file lists), and the saved copy
    lives in the TV's limited storage. */
export function slimEpisode (e: PodcastEpisode): PodcastEpisode {
	return {id: e.id, libraryItemId: e.libraryItemId, title: e.title, publishedAt: e.publishedAt, duration: e.duration, season: e.season, episode: e.episode} as PodcastEpisode;
}

export function slimItem (item: LibraryItem): LibraryItem {
	const books = (item as unknown as {books?: LibraryItem[]}).books;
	// A series (Recent series shelf): its name and enough of its books for a cover and a count.
	if (!item.media) {
		return {id: item.id, name: (item as unknown as {name?: string}).name, books: (books || []).map(slimItem)} as unknown as LibraryItem;
	}
	const md = item.media.metadata;
	const slim = {
		id: item.id,
		libraryId: item.libraryId,
		mediaType: item.mediaType,
		media: {
			coverPath: item.media.coverPath,
			duration: item.media.duration,
			numEpisodes: item.media.numEpisodes,
			metadata: {title: md.title, authorName: md.authorName, narratorName: md.narratorName, seriesName: md.seriesName, author: md.author}
		},
		recentEpisode: item.recentEpisode ? slimEpisode(item.recentEpisode) : undefined
	} as LibraryItem;
	// Series shelf entries carry their books: keep enough for a cover and a count.
	if (books) (slim as unknown as {name?: string; books: LibraryItem[]}).books = books.map(slimItem);
	if ((item as unknown as {name?: string}).name) (slim as unknown as {name?: string}).name = (item as unknown as {name: string}).name;
	return slim;
}
