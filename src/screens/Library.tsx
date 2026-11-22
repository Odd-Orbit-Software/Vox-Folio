import {useEffect, useRef, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {Library as LibraryInfo, LibraryItem, MediaProgress} from '../abs/types';
import {loadLibraryId, saveLibraryId} from '../abs/store';
import type {Route} from '../app/routes';
import {CoverGrid} from '../components/CoverGrid';
import type {GridItem} from '../components/CoverGrid';
import {Button} from '../components/controls';
import {Rail} from '../components/Rail';
import {ErrorPanel} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';
import {formatDuration} from '../player/timeline';

const SORTS = [
	{id: 'recent', label: 'Recently added', key: 'addedAt', desc: true},
	{id: 'title', label: 'Title', key: 'media.metadata.title', desc: false},
	{id: 'author', label: 'Author', key: 'media.metadata.authorNameLF', desc: false}
] as const;
type SortId = typeof SORTS[number]['id'];

const PAGE = 60;

interface Loaded {
	libraryId: string;
	sort: SortId;
	items: LibraryItem[];
	total: number;
	row: number;
}

// Kept across visits so Back from a title returns to the same place without reloading. Written only
// through these helpers, outside the components.
let cache: Loaded | null = null;
let libsCache: LibraryInfo[] | null = null;

function setCache (next: Loaded | null): void {
	cache = next;
}

function setCacheRow (row: number): void {
	if (cache) cache = {...cache, row};
}

function setLibsCache (libs: LibraryInfo[]): void {
	libsCache = libs;
}

interface LibraryProps {
	client: AbsClient;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onOpenTitle: (itemId: string, fromKey: string) => void;
	onOpenCollections: (libraryId: string) => void;
}

export function toGridItem (client: AbsClient, item: LibraryItem, progress: MediaProgress | undefined): GridItem {
	const md = item.media.metadata;
	const started = progress && progress.progress > 0 && !progress.isFinished;
	return {
		key: 'book:' + item.id,
		coverUrl: item.media.coverPath ? client.coverUrl(item.id, 480) : '',
		title: md.title,
		author: md.authorName,
		subtitle: started && item.media.duration
			? formatDuration(Math.max(0, item.media.duration - progress!.currentTime)) + ' left'
			: md.authorName || '',
		percent: started ? Math.round(progress!.progress * 100) : null,
		finished: Boolean(progress && progress.isFinished)
	};
}

export default function Library ({client, restoreKey, onTab, onSettings, onOpenTitle, onOpenCollections}: LibraryProps) {
	const [libraries, setLibraries] = useState<LibraryInfo[] | null>(libsCache);
	const [libraryId, setLibraryId] = useState<string | null>(cache ? cache.libraryId : null);
	const [sort, setSort] = useState<SortId>(cache ? cache.sort : 'recent');
	const [items, setItems] = useState<LibraryItem[]>(cache ? cache.items : []);
	const [total, setTotal] = useState(cache ? cache.total : -1);
	const [progress, setProgress] = useState<Record<string, MediaProgress>>({});
	const [error, setError] = useState<AbsError | null>(null);
	const [reload, setReload] = useState(0);
	const loading = useRef(false);
	const [lists, setLists] = useState(0);
	const initialRow = cache ? cache.row : 0;

	// Libraries, then the remembered (or first) book library.
	useEffect(() => {
		let cancelled = false;
		Promise.all([libsCache ? Promise.resolve(libsCache) : client.libraries(), client.progressByItem()]).then(([libs, prog]) => {
			if (cancelled) return;
			setLibsCache(libs);
			setLibraries(libs);
			setProgress(prog);
			if (!libraryId && libs.length) {
				const saved = loadLibraryId();
				setLibraryId(libs.some((l) => l.id === saved) ? saved : libs[0].id);
			}
		}, (e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, reload]); // eslint-disable-line react-hooks/exhaustive-deps

	const fetchPage = (lib: string, sortId: SortId, page: number, append: boolean) => {
		if (loading.current) return;
		loading.current = true;
		const s = SORTS.filter((x) => x.id === sortId)[0];
		client.libraryItems(lib, {sort: s.key, desc: s.desc, page, limit: PAGE}).then((res) => {
			loading.current = false;
			setItems((prev) => {
				const next = append ? prev.concat(res.results) : res.results;
				setCache({libraryId: lib, sort: sortId, items: next, total: res.total, row: append && cache ? cache.row : 0});
				return next;
			});
			setTotal(res.total);
		}, (e: unknown) => {
			loading.current = false;
			setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
	};

	// First page whenever the library or sort changes (unless it's what we already have).
	useEffect(() => {
		if (!libraryId) return;
		if (cache && cache.libraryId === libraryId && cache.sort === sort && cache.items.length) return;
		fetchPage(libraryId, sort, 0, false);
	}, [libraryId, sort, reload]); // eslint-disable-line react-hooks/exhaustive-deps

	// Collections and playlists get a chip only when there are some.
	useEffect(() => {
		if (!libraryId) return undefined;
		let cancelled = false;
		Promise.all([client.collections(libraryId), client.playlists(libraryId)]).then(([c, p]) => {
			if (!cancelled) setLists(c.length + p.length);
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, libraryId]);

	const onNearEnd = () => {
		if (libraryId && items.length < total) fetchPage(libraryId, sort, Math.floor(items.length / PAGE), true);
	};

	const chooseSort = (id: SortId) => {
		if (id === sort) return;
		setCache(null);
		setItems([]);
		setTotal(-1);
		setSort(id);
	};

	const nextLibrary = () => {
		if (!libraries || libraries.length < 2 || !libraryId) return;
		const i = libraries.map((l) => l.id).indexOf(libraryId);
		const next = libraries[(i + 1) % libraries.length];
		saveLibraryId(next.id);
		setCache(null);
		setItems([]);
		setTotal(-1);
		setLibraryId(next.id);
	};

	const current = libraries && libraryId ? libraries.filter((l) => l.id === libraryId)[0] : null;
	const grid = items.map((item) => toGridItem(client, item, progress[item.id]));

	return (
		<ScreenContainer id="library" className="vf-browse" restoreKey={restoreKey} focusDeps={[items.length > 0, error]}>
			<Rail active="library" onTab={onTab} onSettings={onSettings} />
			<header className="vf-browse__head">
				<div className="vf-browse__title">
					{libraries && libraries.length > 1 ? (
						<Button variant="chip" onClick={nextLibrary} aria-label={'Library: ' + (current ? current.name : '') + '. OK for the next library'}>
							{current ? current.name : 'Library'}
						</Button>
					) : (
						<h1 className="vf-browse__h1">{current ? current.name : 'Library'}</h1>
					)}
					{total >= 0 && <span className="vf-muted vf-browse__count">{total + ' titles'}</span>}
				</div>
				<div className="vf-sorts" role="group" aria-label="Sort">
					{lists > 0 && libraryId && (
						<Button variant="chip" className="vf-sorts__lists" data-focus-key="collections" onClick={() => onOpenCollections(libraryId)}>
							{'Collections · ' + lists}
						</Button>
					)}
					<span className="vf-sorts__label">Sort</span>
					{SORTS.map((s) => (
						<Button
							key={s.id}
							variant="chip"
							className={'vf-sort' + (s.id === sort ? ' is-selected' : '')}
							aria-pressed={s.id === sort}
							data-focus-key={'sort:' + s.id}
							onClick={() => chooseSort(s.id)}
						>
							{s.label}
						</Button>
					))}
				</div>
			</header>

			{error ? (
				<ErrorPanel error={error} onRetry={() => {
					setError(null);
					setReload((n) => n + 1);
				}}
				/>
			) : total === 0 ? (
				<p className="vf-message__body vf-browse__message">This library has no books yet.</p>
			) : items.length === 0 ? (
				<CoverGrid items={[]} loading onSelect={() => undefined} />
			) : (
				<CoverGrid
						items={grid}
						initialRow={initialRow}
						onRowChange={setCacheRow}
						onNearEnd={onNearEnd}
						onSelect={(g) => onOpenTitle(g.key.slice(5), g.key)}
					/>
			)}
		</ScreenContainer>
	);
}

/** The library the browse screens use: the remembered one if it still exists, else the first. */
export async function resolveLibraryId (client: AbsClient): Promise<string | null> {
	if (cache) return cache.libraryId;
	if (!libsCache) setLibsCache(await client.libraries());
	if (!libsCache) return null;
	const saved = loadLibraryId();
	if (libsCache.some((l) => l.id === saved)) return saved;
	return libsCache.length ? libsCache[0].id : null;
}
