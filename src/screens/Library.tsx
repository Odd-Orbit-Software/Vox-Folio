import {useCallback, useEffect, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {FilterData, Library as LibraryInfo, LibraryItem, MediaProgress} from '../abs/types';
import {loadLibraryId, saveLibraryId} from '../abs/store';
import {filterLabel, filterParam, noMatchText, sameFilter, sourcesOf} from '../app/filters';
import type {LibraryFilter} from '../app/filters';
import type {Route} from '../app/routes';
import {CoverGrid} from '../components/CoverGrid';
import type {GridItem} from '../components/CoverGrid';
import {Button, Icon} from '../components/controls';
import {FilterPanel} from '../components/FilterPanel';
import {Rail} from '../components/Rail';
import {ErrorPanel} from '../components/ErrorPanel';
import {focusWithin, ScreenContainer} from '../components/ScreenContainer';
import {formatDuration} from '../player/timeline';
import {Keys} from '../platform/webos';

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
	filter: LibraryFilter | null;
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

/** Sort merged results the way the server would for the chosen sort. */
function sortItems (items: LibraryItem[], sortId: SortId): LibraryItem[] {
	const md = (i: LibraryItem) => i.media.metadata as {title?: string; titleIgnorePrefix?: string; authorNameLF?: string; authorName?: string};
	const text = (a: string | undefined, b: string | undefined) => (a || '').localeCompare(b || '');
	const out = items.slice();
	if (sortId === 'recent') out.sort((a, b) => ((b as {addedAt?: number}).addedAt || 0) - ((a as {addedAt?: number}).addedAt || 0));
	else if (sortId === 'title') out.sort((a, b) => text(md(a).titleIgnorePrefix || md(a).title, md(b).titleIgnorePrefix || md(b).title));
	else out.sort((a, b) => text(md(a).authorNameLF || md(a).authorName, md(b).authorNameLF || md(b).authorName));
	return out;
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
	const [filter, setFilter] = useState<LibraryFilter | null>(cache ? cache.filter : null);
	const [filterData, setFilterData] = useState<FilterData | null>(null);
	const [filterOpen, setFilterOpen] = useState(false);
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

	const fetchPage = (lib: string, sortId: SortId, page: number, append: boolean, f: LibraryFilter | null = filter) => {
		if (loading.current) return;
		loading.current = true;
		const s = SORTS.filter((x) => x.id === sortId)[0];
		const sources = f ? sourcesOf(f) : [];
		// A tidied choice standing for several server values: fetch each in full and merge them.
		const request = sources.length > 1
			? Promise.all(sources.map((src) => client.libraryItems(lib, {sort: s.key, desc: s.desc, page: 0, limit: 1000, filter: filterParam(f, src)}))).then((pages) => {
				const seen: Record<string, boolean> = {};
				const merged: LibraryItem[] = [];
				pages.forEach((pg) => pg.results.forEach((it) => {
					if (!seen[it.id]) {
						seen[it.id] = true;
						merged.push(it);
					}
				}));
				const results = sortItems(merged, sortId);
				return {results, total: results.length, limit: results.length, page: 0};
			})
			: client.libraryItems(lib, {sort: s.key, desc: s.desc, page, limit: PAGE, filter: filterParam(f)});
		request.then((res) => {
			loading.current = false;
			setItems((prev) => {
				const next = append ? prev.concat(res.results) : res.results;
				setCache({libraryId: lib, sort: sortId, filter: f, items: next, total: res.total, row: append && cache ? cache.row : 0});
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
		if (cache && cache.libraryId === libraryId && cache.sort === sort && sameFilter(cache.filter, filter) && cache.items.length) return;
		fetchPage(libraryId, sort, 0, false);
	}, [libraryId, sort, filter, reload]); // eslint-disable-line react-hooks/exhaustive-deps

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

	// What can be filtered on comes from the server once per library, when the panel first opens.
	useEffect(() => {
		// Loaded with the library (it also gives the full count for "2 of 181 titles").
		if (!libraryId || filterData) return undefined;
		let cancelled = false;
		client.filterData(libraryId).then((d) => {
			if (!cancelled) setFilterData(d);
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, libraryId, filterData]);

	// Closing without a change puts focus back on the Filter chip.
	const closeFilter = useCallback(() => {
		setFilterOpen(false);
		window.setTimeout(() => focusWithin('library', 'filter'), 0);
	}, []);

	const chooseFilter = (f: LibraryFilter | null) => {
		if (sameFilter(f, filter)) {
			closeFilter();
			return;
		}
		setFilterOpen(false);
		setCache(null);
		setItems([]);
		setTotal(-1);
		setFilter(f);
	};

	const nextLibrary = () => {
		if (!libraries || libraries.length < 2 || !libraryId) return;
		const i = libraries.map((l) => l.id).indexOf(libraryId);
		const next = libraries[(i + 1) % libraries.length];
		saveLibraryId(next.id);
		setCache(null);
		setItems([]);
		setTotal(-1);
		// Another library has its own genres and narrators.
		setFilter(null);
		setFilterData(null);
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
					{total >= 0 && (
						<span className="vf-muted vf-browse__count">
							{filter && filterData && filterData.bookCount ? total + ' of ' + filterData.bookCount + ' titles' : total + (total === 1 ? ' title' : ' titles')}
						</span>
					)}
				</div>
				<div className="vf-sorts" role="group" aria-label="Sort">
					{lists > 0 && libraryId && (
						<Button variant="chip" className="vf-sorts__lists" data-focus-key="collections" onClick={() => onOpenCollections(libraryId)}>
							{'Collections · ' + lists}
						</Button>
					)}
					<Button
						variant="chip"
						className={'vf-sort vf-filterchip' + (filter ? ' is-active' : '')}
						data-focus-key="filter"
						aria-label={filter ? 'Filtered by ' + filterLabel(filter) + '. OK to change' : 'Filter'}
						onClick={() => setFilterOpen(true)}
						onKeyDown={(ev: KeyboardEvent<HTMLElement>) => {
							// Red clears the filter here too.
							if (ev.keyCode !== Keys.RED || !filter) return;
							ev.preventDefault();
							chooseFilter(null);
						}}
					>
						<Icon name="filter" size={22} /><span className="vf-filterchip__label">{filter ? filterLabel(filter) : 'Filter'}</span>
					</Button>
					<span className="vf-sorts__label vf-sorts__label--gap">Sort</span>
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
			) : total === 0 && filter ? (
				<div className="vf-browse__message">
					<p className="vf-message__body">{noMatchText(filter)}</p>
					<div className="vf-row">
						<Button variant="primary" data-default-focus onClick={() => chooseFilter(null)}>Show all books</Button>
					</div>
				</div>
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
			{filterOpen && <FilterPanel data={filterData} current={filter} onPick={chooseFilter} onClose={closeFilter} />}
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
