import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {Author} from '../abs/types';
import type {Route} from '../app/routes';
import {CoverGrid} from '../components/CoverGrid';
import type {GridItem} from '../components/CoverGrid';
import {Rail} from '../components/Rail';
import {ErrorPanel} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';
import {resolveLibraryId} from './Library';

interface Loaded {
	libraryId: string;
	authors: Author[];
	row: number;
}

let cache: Loaded | null = null;

function setCache (next: Loaded | null): void {
	cache = next;
}

function setCacheRow (row: number): void {
	if (cache) cache = {...cache, row};
}

interface AuthorsProps {
	client: AbsClient;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onOpenAuthor: (authorId: string, name: string, fromKey: string) => void;
}

/** Every author with books in the library, A–Z by surname. */
export default function Authors ({client, restoreKey, onTab, onSettings, onOpenAuthor}: AuthorsProps) {
	const [loaded, setLoaded] = useState<Loaded | null>(cache);
	const [error, setError] = useState<AbsError | null>(null);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		let cancelled = false;
		resolveLibraryId(client).then(async (libraryId) => {
			if (!libraryId || (cache && cache.libraryId === libraryId)) return;
			const authors = await client.authors(libraryId);
			const sorted = authors.slice().sort((a, b) => {
				const ka = ((a as {lastFirst?: string}).lastFirst || a.name).toLowerCase();
				const kb = ((b as {lastFirst?: string}).lastFirst || b.name).toLowerCase();
				return ka < kb ? -1 : ka > kb ? 1 : 0;
			});
			const next = {libraryId, authors: sorted, row: 0};
			setCache(next);
			if (!cancelled) setLoaded(next);
		}).catch((e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, reload]);

	const items: GridItem[] = loaded ? loaded.authors.map((a) => ({
		key: 'author:' + a.id,
		coverUrl: a.imagePath ? client.authorImageUrl(a.id) : '',
		title: a.name,
		subtitle: (a.numBooks || 0) + ((a.numBooks || 0) === 1 ? ' book' : ' books'),
		percent: null,
		round: true
	})) : [];

	return (
		<ScreenContainer id="authors" className="vf-browse" restoreKey={restoreKey} focusDeps={[items.length > 0, error]}>
			<Rail active="authors" onTab={onTab} onSettings={onSettings} />
			<header className="vf-browse__head">
				<div className="vf-browse__title">
					<h1 className="vf-browse__h1">Authors</h1>
					{loaded && <span className="vf-muted vf-browse__count">{loaded.authors.length + ' authors'}</span>}
				</div>
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
					loading={!loaded}
					round
					initialRow={loaded ? loaded.row : 0}
					onRowChange={setCacheRow}
					onSelect={(g) => onOpenAuthor(g.key.slice(7), g.title, g.key)}
				/>
			)}
		</ScreenContainer>
	);
}
