import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {LibraryItem, MediaProgress, Playlist} from '../abs/types';
import {queueFromPlaylist, queueStart} from '../app/queue';
import type {Queue} from '../app/queue';
import type {BookSource} from '../app/routes';
import {Button, Icon} from '../components/controls';
import {CoverGrid} from '../components/CoverGrid';
import type {GridItem} from '../components/CoverGrid';
import {ErrorPanel} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';
import {toGridItem} from './Library';
import {episodeTile} from './Podcasts';
import {Keys} from '../platform/webos';

interface BookListProps {
	client: AbsClient;
	title: string;
	source: BookSource;
	restoreKey: string | null;
	onOpenTitle: (itemId: string, fromKey: string) => void;
	/** Play a playlist in order, starting at one of its entries. */
	onPlayQueue: (queue: Queue, startKey: string, fromKey: string) => void;
	/** Green on a podcast episode in a playlist: its show's page. */
	onOpenShow: (itemId: string, title: string, fromKey: string) => void;
}

interface Loaded {
	books: LibraryItem[];
	/** Set for a playlist: what plays, in order. */
	playlist: Playlist | null;
	progress: Record<string, MediaProgress>;
}

function loadBooks (client: AbsClient, source: BookSource): Promise<{books: LibraryItem[]; playlist: Playlist | null}> {
	if (source.kind === 'narrator') return client.narratorBooks(source.libraryId, source.name).then((books) => ({books, playlist: null}));
	if (source.kind === 'collection') return client.collection(source.id).then((c) => ({books: c.books || [], playlist: null}));
	return client.playlist(source.id).then((p) => ({books: [], playlist: p}));
}

const EYEBROW: Record<BookSource['kind'], string> = {narrator: 'Read by', collection: 'Collection', playlist: 'Playlist'};

function countLabel (n: number, episodes: boolean, mixed: boolean): string {
	const noun = mixed ? 'item' : episodes ? 'episode' : 'book';
	return n + ' ' + noun + (n === 1 ? '' : 's');
}

/** A plain grid of books: a narrator's work or a collection. A playlist also plays in order: OK on an
    entry plays from there, and Play goes from the first one not yet finished. */
export default function BookList ({client, title, source, restoreKey, onOpenTitle, onPlayQueue, onOpenShow}: BookListProps) {
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<AbsError | null>(null);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		let cancelled = false;
		Promise.all([loadBooks(client, source), client.progressByItem()]).then(([b, progress]) => {
			if (cancelled) return;
			setData({books: b.books.filter((i) => i.mediaType === 'book'), playlist: b.playlist, progress});
		}, (e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, source, reload]);

	const queue = data && data.playlist ? queueFromPlaylist(data.playlist) : null;

	// In a playlist OK plays; Green opens the focused entry's Details (a book) or its show (an episode).
	useEffect(() => {
		if (!queue) return undefined;
		const onKey = (ev: KeyboardEvent) => {
			if (ev.keyCode !== Keys.GREEN) return;
			const el = document.activeElement as HTMLElement | null;
			const key = el && el.getAttribute('data-focus-key');
			if (!key || key.indexOf('q:') !== 0) return;
			const entry = queue.entries.filter((e) => e.key === key.slice(2))[0];
			if (!entry) return;
			ev.preventDefault();
			ev.stopPropagation();
			if (entry.episodeId) onOpenShow(entry.itemId, entry.author, key);
			else onOpenTitle(entry.itemId, key);
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [queue, onOpenShow, onOpenTitle]);
	const progress = data ? data.progress : {};
	let items: GridItem[] = [];
	if (queue && data && data.playlist) {
		const byKey: Record<string, GridItem> = {};
		(data.playlist.items || []).forEach((it) => {
			const item = it.libraryItem;
			if (!item) return;
			if (it.episodeId && it.episode) {
				// The cover shows the show; the date and length tell episodes apart.
				byKey[item.id + '/' + it.episodeId] = episodeTile(client, {...it.episode, libraryItemId: item.id}, progress, item.media.metadata.title);
			} else if (!it.episodeId) {
				byKey[item.id] = toGridItem(client, item, progress[item.id]);
			}
		});
		// Tiles are keyed by the queue entry, so OK can start the queue there.
		// Numbered by place in the queue, matching the player's "2 of 3".
		queue.entries.forEach((e, i) => {
			if (byKey[e.key]) items.push({...byKey[e.key], key: 'q:' + e.key, badge: String(i + 1)});
		});
	} else if (data) {
		items = data.books.map((b) => toGridItem(client, b, progress[b.id]));
	}
	const start = queue ? queueStart(queue, progress) : null;
	const playLabel = !start ? '' : start.replay ? 'Play again from the start' : start.at > 0 ? 'Continue · ' + start.entry.title : 'Play all';
	const episodes = Boolean(queue && queue.entries.length && queue.entries.every((e) => e.episodeId));
	const mixed = Boolean(queue && queue.entries.some((e) => e.episodeId) && !episodes);

	return (
		<ScreenContainer id="books" className={'vf-list' + (queue ? ' vf-list--playlist' : '')} restoreKey={restoreKey} focusDeps={[data !== null, error]}>
			<div className="vf-hint vf-list__back"><Icon name="back" size={24} />Back</div>
			<header className="vf-list__head">
				<div className="vf-eyebrow">{EYEBROW[source.kind]}</div>
				<h1 className="vf-list__title">{title}</h1>
				{data && <span className="vf-muted vf-browse__count">{countLabel(items.length, episodes, mixed)}</span>}
				{queue && start && (
					<div className="vf-row vf-list__actions">
						<Button variant="primary" className="vf-list__play" data-default-focus data-focus-key="play-all" onClick={() => onPlayQueue({...queue, replay: start.replay}, start.entry.key, 'play-all')}>
							<Icon name="play" size={26} /><span className="vf-list__playlabel">{playLabel}</span>
						</Button>
						<span className="vf-muted vf-list__note">Plays in order · OK on an entry plays from there · <span className="vf-dot vf-dot--green" />Green: details or show</span>
					</div>
				)}
			</header>
			{error ? (
				<ErrorPanel error={error} onRetry={() => {
					setError(null);
					setReload((n) => n + 1);
				}}
				/>
			) : (
				<CoverGrid
					items={items}
					loading={data === null}
					onSelect={(g) => {
						if (queue && g.key.indexOf('q:') === 0) onPlayQueue(queue, g.key.slice(2), g.key);
						else onOpenTitle(g.key.slice(5), g.key);
					}}
				/>
			)}
			{data && !items.length && <p className="vf-message__body vf-list__message">{queue ? 'This playlist is empty.' : 'Nothing here yet.'}</p>}
		</ScreenContainer>
	);
}
