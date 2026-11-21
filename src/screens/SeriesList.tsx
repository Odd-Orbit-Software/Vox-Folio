import {useEffect, useRef, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {Series} from '../abs/types';
import type {Route} from '../app/routes';
import {CoverGrid} from '../components/CoverGrid';
import type {GridItem} from '../components/CoverGrid';
import {Button} from '../components/controls';
import {Rail} from '../components/Rail';
import {ScreenContainer} from '../components/ScreenContainer';
import {resolveLibraryId} from './Library';

const PAGE = 60;

interface Loaded {
	libraryId: string;
	series: Series[];
	total: number;
	row: number;
}

let cache: Loaded | null = null;

function setCache (next: Loaded | null): void {
	cache = next;
}

function setCacheRow (row: number): void {
	if (cache) cache = {...cache, row};
}

interface SeriesListProps {
	client: AbsClient;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onOpenSeries: (libraryId: string, series: Series, fromKey: string) => void;
}

/** Every series in the library, by name, shown by its first book's cover. */
export default function SeriesList ({client, restoreKey, onTab, onSettings, onOpenSeries}: SeriesListProps) {
	const [loaded, setLoaded] = useState<Loaded | null>(cache);
	const [error, setError] = useState<AbsError | null>(null);
	const [reload, setReload] = useState(0);
	const loading = useRef(false);

	const fetchPage = (libraryId: string, page: number, prev: Series[]) => {
		if (loading.current) return;
		loading.current = true;
		client.librarySeries(libraryId, page, PAGE).then((res) => {
			loading.current = false;
			const next: Loaded = {libraryId, series: prev.concat(res.results), total: res.total, row: cache ? cache.row : 0};
			setCache(next);
			setLoaded(next);
		}, (e: unknown) => {
			loading.current = false;
			setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
	};

	useEffect(() => {
		let cancelled = false;
		resolveLibraryId(client).then((libraryId) => {
			if (cancelled || !libraryId) return;
			if (cache && cache.libraryId === libraryId) return;
			setCache(null);
			fetchPage(libraryId, 0, []);
		}, (e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, reload]); // eslint-disable-line react-hooks/exhaustive-deps

	const items: GridItem[] = loaded ? loaded.series.map((s) => {
		const first = s.books && s.books[0];
		const count = s.books ? s.books.length : 0;
		return {
			key: 'series:' + s.id,
			coverUrl: first && first.media.coverPath ? client.coverUrl(first.id, 480) : '',
			title: s.name,
			author: first ? first.media.metadata.authorName : '',
			subtitle: count + (count === 1 ? ' book' : ' books'),
			percent: null
		};
	}) : [];

	return (
		<ScreenContainer id="series" className="vf-browse" restoreKey={restoreKey} focusDeps={[items.length > 0, error]}>
			<Rail active="series" onTab={onTab} onSettings={onSettings} />
			<header className="vf-browse__head">
				<div className="vf-browse__title">
					<h1 className="vf-browse__h1">Series</h1>
					{loaded && <span className="vf-muted vf-browse__count">{loaded.total + ' series'}</span>}
				</div>
			</header>
			{error ? (
				<div className="vf-browse__message">
					<h2 className="vf-message__title">Can&apos;t load your series</h2>
					<p className="vf-message__body">{error.message}</p>
					<Button variant="primary" data-default-focus onClick={() => {
						setError(null);
						setReload((n) => n + 1);
					}}
					>
						Retry
					</Button>
				</div>
			) : loaded && items.length ? (
				<CoverGrid
					items={items}
					initialRow={loaded.row}
					onRowChange={setCacheRow}
					onNearEnd={() => {
						if (loaded.series.length < loaded.total) fetchPage(loaded.libraryId, Math.floor(loaded.series.length / PAGE), loaded.series);
					}}
					onSelect={(g) => {
						const s = loaded.series.filter((x) => 'series:' + x.id === g.key)[0];
						if (s) onOpenSeries(loaded.libraryId, s, g.key);
					}}
				/>
			) : (
				<div className="vf-grid" aria-busy="true">
					{loaded && loaded.total === 0 ? <p className="vf-message__body">No series in this library yet.</p> : null}
				</div>
			)}
		</ScreenContainer>
	);
}
