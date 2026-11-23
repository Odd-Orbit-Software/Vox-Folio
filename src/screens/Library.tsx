import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {FilterData, Library as LibraryInfo, LibraryItem, MediaProgress} from '../abs/types';
import {loadLibraryId, saveLibraryId} from '../abs/store';
import {filterParam, filtersLabel, hasFilters, NO_FILTERS, noMatchText, progressMatches, sameFilters, sourcesOf} from '../app/filters';
import type {Filters} from '../app/filters';
import type {Route} from '../app/routes';
import {CoverGrid} from '../components/CoverGrid';
import type {GridItem} from '../components/CoverGrid';
import {Button, Icon} from '../components/controls';
import {FilterPanel} from '../components/FilterPanel';
import {GenreView, genreShelves, NarratorView, narrators} from '../components/LibraryViews';
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
	filters: Filters;
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

type ViewId = 'all' | 'genres' | 'narrators';
const VIEWS: {id: ViewId; label: string}[] = [
	{id: 'all', label: 'Books'},
	{id: 'genres', label: 'Genres'},
	{id: 'narrators', label: 'Narrators'}
];
/** The chosen view, kept while the app runs (written only through rememberView, outside the component). */
let viewCache: ViewId = 'all';

function rememberView (v: ViewId): void {
	viewCache = v;
}

/* The whole library (for filter counts and the genre and narrator views) and its filter data, kept per
   library while the app runs, so Back from a narrator or a book returns at once to the same place. */
let wholeCache: {libraryId: string; items: LibraryItem[] | null; data: FilterData | null} | null = null;

function rememberWhole (libraryId: string, patch: {items?: LibraryItem[] | null; data?: FilterData | null}): void {
	const base = wholeCache && wholeCache.libraryId === libraryId ? wholeCache : {libraryId, items: null, data: null};
	wholeCache = {...base, ...patch};
}

function wholeFor (libraryId: string | null): {items: LibraryItem[] | null; data: FilterData | null} {
	return wholeCache && libraryId && wholeCache.libraryId === libraryId ? wholeCache : {items: null, data: null};
}

interface LibraryProps {
	client: AbsClient;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onOpenTitle: (itemId: string, fromKey: string) => void;
	onOpenCollections: (libraryId: string) => void;
	onOpenNarrator: (libraryId: string, name: string, fromKey: string) => void;
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
		percent: started ? Math.floor(progress!.progress * 100) : null,
		finished: Boolean(progress && progress.isFinished)
	};
}

export default function Library ({client, restoreKey, onTab, onSettings, onOpenTitle, onOpenCollections, onOpenNarrator}: LibraryProps) {
	const [libraries, setLibraries] = useState<LibraryInfo[] | null>(libsCache);
	const [libraryId, setLibraryId] = useState<string | null>(cache ? cache.libraryId : null);
	const [sort, setSort] = useState<SortId>(cache ? cache.sort : 'recent');
	const [filters, setFilters] = useState<Filters>(cache ? cache.filters : NO_FILTERS);
	// Every book, for the filter panel's counts (loaded when the panel opens, small libraries only).
	const startLibrary = cache ? cache.libraryId : null;
	const [allItems, setAllItemsState] = useState<LibraryItem[] | null>(() => wholeFor(startLibrary).items);
	const [filterData, setFilterDataState] = useState<FilterData | null>(() => wholeFor(startLibrary).data);
	const [wholeError, setWholeError] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);
	const [view, setViewState] = useState<ViewId>(viewCache);
	const setView = (v: ViewId) => {
		rememberView(v);
		setViewState(v);
	};
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

	// Each request is numbered; only the latest one's result is used (filters change while the panel is open).
	const requestId = useRef(0);
	const fetchPage = (lib: string, sortId: SortId, page: number, append: boolean, f: Filters = filters) => {
		if (append && loading.current) return;
		const id = ++requestId.current;
		loading.current = true;
		const s = SORTS.filter((x) => x.id === sortId)[0];
		const meta = f.meta;
		const sources = meta ? sourcesOf(meta) : [];
		/* A metadata value standing for several server spellings, or one combined with a progress state,
		   is fetched in full and merged here; the progress part is applied against the listener's own
		   progress. A single filter of either kind is paged by the server. */
		const full = meta && (sources.length > 1 || f.progress);
		const request = full && meta
			? Promise.all(sources.map((src) => client.libraryItems(lib, {sort: s.key, desc: s.desc, page: 0, limit: 1000, filter: filterParam(meta, src)}))).then((pages) => {
				const seen: Record<string, boolean> = {};
				const merged: LibraryItem[] = [];
				pages.forEach((pg) => pg.results.forEach((it) => {
					if (!seen[it.id] && (!f.progress || progressMatches(it, f.progress, progress))) {
						seen[it.id] = true;
						merged.push(it);
					}
				}));
				const results = sortItems(merged, sortId);
				return {results, total: results.length, limit: results.length, page: 0};
			})
			: client.libraryItems(lib, {
				sort: s.key,
				desc: s.desc,
				page,
				limit: PAGE,
				filter: meta ? filterParam(meta) : f.progress ? filterParam({group: 'progress', value: f.progress}) : undefined
			});
		request.then((res) => {
			if (id !== requestId.current) return;
			loading.current = false;
			setItems((prev) => {
				const next = append ? prev.concat(res.results) : res.results;
				setCache({libraryId: lib, sort: sortId, filters: f, items: next, total: res.total, row: append && cache ? cache.row : 0});
				return next;
			});
			setTotal(res.total);
		}, (e: unknown) => {
			if (id !== requestId.current) return;
			loading.current = false;
			setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
	};

	// First page whenever the library, sort or filters change (unless it's what we already have).
	useEffect(() => {
		if (!libraryId) return;
		if (cache && cache.libraryId === libraryId && cache.sort === sort && sameFilters(cache.filters, filters) && cache.items.length) return;
		fetchPage(libraryId, sort, 0, false);
	}, [libraryId, sort, filters, reload]); // eslint-disable-line react-hooks/exhaustive-deps

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
			rememberWhole(libraryId, {data: d});
			if (!cancelled) setFilterDataState(d);
		}, () => {
			if (!cancelled) setWholeError(true);
		});
		return () => {
			cancelled = true;
		};
	}, [client, libraryId, filterData, reload]);

	// Closing without a change puts focus back on the Filter chip.
	const closeFilter = useCallback(() => {
		setFilterOpen(false);
		window.setTimeout(() => focusWithin('library', 'filter'), 0);
	}, []);

	/** Apply filters as they're picked; the panel stays open so a second one can be added. */
	const chooseFilters = (f: Filters) => {
		if (sameFilters(f, filters)) return;
		setCache(null);
		setItems([]);
		setTotal(-1);
		setFilters(f);
	};

	// Counts in the filter panel need every book: fetched once per library when the panel opens, and
	// only for libraries small enough to hold in memory on a TV.
	useEffect(() => {
		if ((!filterOpen && view === 'all') || allItems || !libraryId || !filterData || (filterData.bookCount || 0) > 2000) return undefined;
		let cancelled = false;
		client.libraryItems(libraryId, {sort: 'media.metadata.title', page: 0, limit: 2000}).then((res) => {
			rememberWhole(libraryId, {items: res.results});
			if (!cancelled) setAllItemsState(res.results);
		}, () => {
			if (!cancelled) setWholeError(true);
		});
		return () => {
			cancelled = true;
		};
	}, [client, filterOpen, view, allItems, libraryId, filterData]);

	const nextLibrary = () => {
		if (!libraries || libraries.length < 2 || !libraryId) return;
		const i = libraries.map((l) => l.id).indexOf(libraryId);
		const next = libraries[(i + 1) % libraries.length];
		saveLibraryId(next.id);
		setCache(null);
		setItems([]);
		setTotal(-1);
		// Another library has its own genres and narrators.
		setFilters(NO_FILTERS);
		setFilterDataState(null);
		setAllItemsState(null);
		setLibraryId(next.id);
	};

	// Built once per library load, not on every render.
	const shelves = useMemo(() => (allItems ? genreShelves(allItems, filterData) : []), [allItems, filterData]);
	const readers = useMemo(() => (allItems ? narrators(allItems) : []), [allItems]);

	const current = libraries && libraryId ? libraries.filter((l) => l.id === libraryId)[0] : null;
	const grid = items.map((item) => toGridItem(client, item, progress[item.id]));

	return (
		<ScreenContainer id="library" className={'vf-browse vf-library vf-library--' + view} restoreKey={restoreKey} focusDeps={[items.length > 0, error, view, allItems !== null]}>
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
					{view === 'genres' && allItems && <span className="vf-muted vf-browse__count">{shelves.length + ' genres'}</span>}
					{view === 'narrators' && allItems && <span className="vf-muted vf-browse__count">{readers.length + ' narrators'}</span>}
					{view === 'all' && total >= 0 && (
						<span className="vf-muted vf-browse__count">
							{hasFilters(filters) && filterData && filterData.bookCount ? total + ' of ' + filterData.bookCount + ' titles' : total + (total === 1 ? ' title' : ' titles')}
						</span>
					)}
				</div>
				<div className="vf-sorts vf-views" role="tablist" aria-label="View">
					{VIEWS.map((v) => (
						<Button
							key={v.id}
							variant="chip"
							role="tab"
							className={'vf-sort' + (v.id === view ? ' is-selected' : '')}
							aria-selected={v.id === view}
							data-focus-key={'view:' + v.id}
							onClick={() => setView(v.id)}
						>
							{v.label}
						</Button>
					))}
					{lists > 0 && libraryId && (
						<Button variant="chip" className="vf-sort" data-focus-key="collections" onClick={() => onOpenCollections(libraryId)}>
							{'Collections · ' + lists}
						</Button>
					)}
				</div>
			</header>
			{view === 'all' && (
				<div className="vf-sorts vf-library__tools" role="group" aria-label="Filter and sort">
					<Button
						variant="chip"
						className={'vf-sort vf-filterchip' + (hasFilters(filters) ? ' is-active' : '')}
						data-focus-key="filter"
						aria-label={hasFilters(filters) ? 'Filtered by ' + filtersLabel(filters) + '. OK to change' : 'Filter'}
						onClick={() => setFilterOpen(true)}
						onKeyDown={(ev: KeyboardEvent<HTMLElement>) => {
							// Red clears the filter here too.
							if (ev.keyCode !== Keys.RED || !hasFilters(filters)) return;
							ev.preventDefault();
							chooseFilters(NO_FILTERS);
						}}
					>
						<Icon name="filter" size={22} /><span className="vf-filterchip__label">{hasFilters(filters) ? filtersLabel(filters) : 'Filter'}</span>
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
			)}

			{view !== 'all' && !error ? (
				wholeError && !allItems ? (
					<ErrorPanel error={new AbsError('network', 'Could not load the library.')} onRetry={() => {
						setWholeError(false);
						setReload((n) => n + 1);
					}}
					/>
				) : !allItems ? (
					filterData && (filterData.bookCount || 0) > 2000
						? <p className="vf-message__body vf-browse__message">This library is too large to group on the TV. Use Filter in Books instead.</p>
						: <CoverGrid items={[]} loading round={view === 'narrators'} onSelect={() => undefined} />
				) : view === 'genres' && !shelves.length ? (
					<p className="vf-message__body vf-browse__message">No genres are tagged in this library.</p>
				) : view === 'narrators' && !readers.length ? (
					<p className="vf-message__body vf-browse__message">No narrators are listed in this library.</p>
				) : view === 'genres' ? (
					<GenreView
						client={client}
						shelves={shelves}
						restoreKey={restoreKey}
						toTile={(b) => toGridItem(client, b, progress[b.id])}
						onOpenTitle={onOpenTitle}
						onOpenGenre={(g) => {
							setView('all');
							chooseFilters({progress: null, meta: {group: 'genres', value: g.value, sources: g.sources}});
						}}
					/>
				) : (
					<NarratorView list={readers} restoreKey={restoreKey} onOpenNarrator={(name, fromKey) => libraryId && onOpenNarrator(libraryId, name, fromKey)} />
				)
			) : error ? (
				<ErrorPanel error={error} onRetry={() => {
					setError(null);
					setReload((n) => n + 1);
				}}
				/>
			) : total === 0 && hasFilters(filters) ? (
				<div className="vf-browse__message">
					<p className="vf-message__body">{noMatchText(filters)}</p>
					<div className="vf-row">
						<Button variant="primary" data-default-focus onClick={() => chooseFilters(NO_FILTERS)}>Show all books</Button>
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
			{filterOpen && <FilterPanel data={filterData} filters={filters} allItems={allItems} progress={progress} onChange={chooseFilters} onClose={closeFilter} />}
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
