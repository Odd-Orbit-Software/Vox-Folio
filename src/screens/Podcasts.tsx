import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {LibraryItem, MediaProgress, Playlist, PodcastEpisode} from '../abs/types';
import {episodeLength, episodeState, episodeTileDate, episodeTitle, podcastLibraryId} from '../app/podcasts';
import type {Route} from '../app/routes';
import type {GridItem} from '../components/CoverGrid';
import {ErrorPanel} from '../components/ErrorPanel';
import {Rail} from '../components/Rail';
import {CoverRow, VScroll} from '../components/Rows';
import {ScreenContainer} from '../components/ScreenContainer';

interface PodcastsProps {
	client: AbsClient;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onPlayEpisode: (itemId: string, episodeId: string, fromKey: string) => void;
	onOpenShow: (itemId: string, title: string, fromKey: string) => void;
	onOpenPlaylist: (id: string, name: string, fromKey: string) => void;
}

interface Data {
	inProgress: PodcastEpisode[];
	latest: PodcastEpisode[];
	shows: LibraryItem[];
	playlists: Playlist[];
	progress: Record<string, MediaProgress>;
}

type Load = {state: 'loading'} | {state: 'none'} | {state: 'error'; error: AbsError} | {state: 'ready'; data: Data};

/** Kept between visits (per account) so coming back is instant. */
const cache = new WeakMap<AbsClient, Data>();

/** A tile key for an episode: "ep:<show>/<episode>". */
export function episodeKey (e: PodcastEpisode): string {
	return 'ep:' + e.libraryItemId + '/' + e.id;
}

export function episodeTile (client: AbsClient, e: PodcastEpisode, progress: Record<string, MediaProgress>, show?: string): GridItem {
	const s = episodeState(e, progress);
	const length = episodeLength(e, s);
	return {
		key: episodeKey(e),
		coverUrl: client.coverUrl(e.libraryItemId, 480),
		title: episodeTitle(e),
		author: show,
		// The cover already says which show; the date and length are what tell episodes apart.
		subtitle: s.left !== null ? length : [episodeTileDate(e), length].filter(Boolean).join(' · '),
		percent: s.percent > 0 && !s.finished ? s.percent : null,
		finished: s.finished
	};
}

/** A show's tile: its episode count, or its host when the listing doesn't say (search results). */
export function showTile (client: AbsClient, s: LibraryItem): GridItem {
	const count = s.media.numEpisodes || (s.media.episodes ? s.media.episodes.length : 0);
	return {
		key: 'show:' + s.id,
		coverUrl: s.media.coverPath ? client.coverUrl(s.id, 480) : '',
		title: s.media.metadata.title,
		author: s.media.metadata.author,
		subtitle: count ? count + (count === 1 ? ' episode' : ' episodes') : s.media.metadata.author || '',
		percent: null
	};
}

/** A playlist's tile: the first entry's cover and how many it holds. */
export function playlistTile (client: AbsClient, pl: Playlist): GridItem {
	const items = pl.items || [];
	const first = items[0];
	const episodes = items.filter((i) => i.episodeId).length;
	const noun = episodes === items.length ? (items.length === 1 ? ' episode' : ' episodes') : (items.length === 1 ? ' item' : ' items');
	// Four or more entries: their first four distinct covers (episodes of one show share one).
	const ids = items.map((i) => i.libraryItemId).filter((id, i, all) => all.indexOf(id) === i);
	return {
		key: 'playlist:' + pl.id,
		mosaic: ids.length >= 4 ? ids.slice(0, 4).map((id) => client.coverUrl(id, 240)) : undefined,
		coverUrl: first ? client.coverUrl(first.libraryItemId, 480) : '',
		title: pl.name,
		subtitle: 'Playlist · ' + items.length + noun,
		percent: null
	};
}

/** ★ Podcasts: what you're partway through, the newest episodes, and every show. */
export default function Podcasts ({client, restoreKey, onTab, onSettings, onPlayEpisode, onOpenShow, onOpenPlaylist}: PodcastsProps) {
	const [load, setLoad] = useState<Load>(() => {
		const saved = cache.get(client);
		return saved ? {state: 'ready', data: saved} : {state: 'loading'};
	});
	const [reload, setReload] = useState(0);

	useEffect(() => {
		let cancelled = false;
		podcastLibraryId(client).then((libraryId) => {
			if (!libraryId) {
				if (!cancelled) setLoad({state: 'none'});
				return undefined;
			}
			return Promise.all([
				client.shelves(libraryId),
				client.recentEpisodes(libraryId, 24),
				client.libraryItems(libraryId, {sort: 'media.metadata.title', page: 0, limit: 200}),
				client.progressByItem(),
				client.playlists(libraryId).catch(() => [] as Playlist[])
			]).then(([shelves, latest, shows, progress, playlists]) => {
				if (cancelled) return;
				const going = shelves.find((s) => s.id === 'continue-listening');
				const inProgress = (going ? going.entities : []).map((i) => i.recentEpisode).filter((e): e is PodcastEpisode => Boolean(e));
				const data = {inProgress, latest, shows: shows.results, playlists, progress};
				cache.set(client, data);
				setLoad({state: 'ready', data});
			});
		}).catch((e: unknown) => {
			if (cancelled) return;
			const err = e instanceof AbsError ? e : new AbsError('server', String(e));
			setLoad((prev) => (prev.state === 'ready' ? prev : {state: 'error', error: err}));
		});
		return () => {
			cancelled = true;
		};
	}, [client, reload]);

	const data = load.state === 'ready' ? load.data : null;
	const showName: Record<string, string> = {};
	if (data) {
		data.shows.forEach((s) => {
			showName[s.id] = s.media.metadata.title;
		});
	}
	const play = (g: GridItem) => {
		const [itemId, episodeId] = g.key.slice(3).split('/');
		onPlayEpisode(itemId, episodeId, g.key);
	};

	return (
		<ScreenContainer id="podcasts" className="vf-browse vf-podcasts" restoreKey={restoreKey} focusDeps={[load.state]}>
			<Rail active="podcasts" onTab={onTab} onSettings={onSettings} />
			<header className="vf-browse__head">
				<h1 className="vf-browse__h1">Podcasts</h1>
			</header>
			{load.state === 'error' && (
				<ErrorPanel error={load.error} onRetry={() => {
					setLoad({state: 'loading'});
					setReload((n) => n + 1);
				}}
				/>
			)}
			{load.state === 'none' && <p className="vf-message__body vf-browse__message">This server has no podcast library.</p>}
			{data && (
				<VScroll className="vf-podcasts__rows">
					{data.inProgress.length > 0 && (
						<CoverRow
							title="Continue listening"
							items={data.inProgress.map((e) => episodeTile(client, e, data.progress, showName[e.libraryItemId]))}
							onSelect={play}
							defaultFocus
						/>
					)}
					{data.latest.length > 0 && (
						<CoverRow
							title="Latest episodes"
							items={data.latest.map((e) => episodeTile(client, e, data.progress, e.podcast ? e.podcast.metadata.title : showName[e.libraryItemId]))}
							onSelect={play}
							defaultFocus={!data.inProgress.length}
						/>
					)}
					{data.shows.length > 0 && (
						<CoverRow
							title="Shows"
							meta={String(data.shows.length)}
							items={data.shows.map((s) => showTile(client, s))}
							onSelect={(g) => onOpenShow(g.key.slice(5), g.title, g.key)}
							defaultFocus={!data.inProgress.length && !data.latest.length}
						/>
					)}
					{data.playlists.length > 0 && (
						<CoverRow
							title="Playlists"
							items={data.playlists.map((pl) => playlistTile(client, pl))}
							onSelect={(g) => onOpenPlaylist(g.key.slice(9), g.title, g.key)}
						/>
					)}
					{!data.shows.length && <p className="vf-message__body" data-vrow>No shows in this library yet.</p>}
				</VScroll>
			)}
		</ScreenContainer>
	);
}
