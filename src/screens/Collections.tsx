import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {Collection, LibraryItem, Playlist} from '../abs/types';
import type {BookSource} from '../app/routes';
import {Icon} from '../components/controls';
import {CoverGrid} from '../components/CoverGrid';
import type {GridItem} from '../components/CoverGrid';
import {ErrorPanel} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';

interface CollectionsProps {
	client: AbsClient;
	libraryId: string;
	restoreKey: string | null;
	onOpen: (title: string, source: BookSource, fromKey: string) => void;
}

function tile (client: AbsClient, key: string, name: string, books: LibraryItem[], kind: string): GridItem {
	const first = books[0];
	// A playlist of four or more shows its first four covers; anything else, its first.
	const withCovers = books.filter((b) => b.media.coverPath);
	return {
		key,
		mosaic: kind === 'Playlist' && withCovers.length >= 4 ? withCovers.slice(0, 4).map((b) => client.coverUrl(b.id, 240)) : undefined,
		coverUrl: first && first.media.coverPath ? client.coverUrl(first.id, 480) : '',
		title: name,
		subtitle: kind + ' · ' + books.length + (books.length === 1 ? ' book' : ' books'),
		percent: null
	};
}

/** The server's collections and this listener's playlists for the library. Read-only on the TV. */
export default function Collections ({client, libraryId, restoreKey, onOpen}: CollectionsProps) {
	const [data, setData] = useState<{collections: Collection[]; playlists: Playlist[]} | null>(null);
	const [error, setError] = useState<AbsError | null>(null);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.collections(libraryId), client.playlists(libraryId)]).then(([collections, playlists]) => {
			if (!cancelled) setData({collections, playlists});
		}, (e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, libraryId, reload]);

	const items: GridItem[] = data ? [
		...data.collections.map((c) => tile(client, 'collection:' + c.id, c.name, c.books || [], 'Collection')),
		...data.playlists.map((p) => tile(client, 'playlist:' + p.id, p.name, (p.items || []).map((i) => i.libraryItem).filter(Boolean) as LibraryItem[], 'Playlist'))
	] : [];

	return (
		<ScreenContainer id="collections" className="vf-list" restoreKey={restoreKey} focusDeps={[data !== null, error]}>
			<div className="vf-hint vf-list__back"><Icon name="back" size={24} />Back</div>
			<header className="vf-list__head">
				<div className="vf-eyebrow">Library</div>
				<h1 className="vf-list__title">Collections &amp; playlists</h1>
			</header>
			{error && (
				<ErrorPanel error={error} onRetry={() => {
					setError(null);
					setReload((n) => n + 1);
				}}
				/>
			)}
			{!data && !error && <CoverGrid items={[]} loading onSelect={() => undefined} />}
			{data && !items.length && <p className="vf-message__body vf-list__message">No collections or playlists yet.</p>}
			{items.length > 0 && (
				<CoverGrid
					items={items}
					onSelect={(g) => {
						const [kind, id] = [g.key.slice(0, g.key.indexOf(':')), g.key.slice(g.key.indexOf(':') + 1)];
						onOpen(g.title, kind === 'collection' ? {kind: 'collection', id} : {kind: 'playlist', id}, g.key);
					}}
				/>
			)}
		</ScreenContainer>
	);
}
