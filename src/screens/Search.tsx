import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {MediaProgress, PodcastEpisode, PodcastSearchResults, SearchResults} from '../abs/types';
import {podcastLibraryId} from '../app/podcasts';
import {isPremium} from '../app/premium';
import type {Route} from '../app/routes';
import {orderSeries} from '../app/series';
import {Button, TextField} from '../components/controls';
import type {GridItem} from '../components/CoverGrid';
import {Rail} from '../components/Rail';
import {CoverRow, VScroll} from '../components/Rows';
import {ErrorPanel} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';
import {resolveLibraryId, toGridItem} from './Library';
import {episodeTile, showTile} from './Podcasts';

interface SearchProps {
	client: AbsClient;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onOpenTitle: (itemId: string, fromKey: string) => void;
	onOpenSeries: (libraryId: string, seriesId: string, seriesName: string, fromKey: string) => void;
	onOpenAuthor: (authorId: string, name: string, fromKey: string) => void;
	onOpenNarrator: (libraryId: string, name: string, fromKey: string) => void;
	onOpenShow: (itemId: string, title: string, fromKey: string) => void;
	onPlayEpisode: (itemId: string, episodeId: string, fromKey: string) => void;
}

interface Found {
	query: string;
	libraryId: string;
	results: SearchResults | null;
	/** ★ When the account has a podcast library. */
	podcasts: PodcastSearchResults | null;
}

const noPodcasts = Promise.resolve(null);

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;

// The last search, kept so Back from a result returns to it.
let last: {query: string; found: Found | null} = {query: '', found: null};

function remember (query: string, found: Found | null): void {
	last = {query, found};
}

/** Development: pre-fill the search box (the `searchText` launch param, only with `probe`). */
export function presetSearch (query: string): void {
	last = {query, found: null};
}

/** Search by title, author, narrator or series, and podcasts. The TV keyboard's microphone works here too. */
export default function Search ({client, restoreKey, onTab, onSettings, onOpenTitle, onOpenSeries, onOpenAuthor, onOpenNarrator, onOpenShow, onPlayEpisode}: SearchProps) {
	const [query, setQuery] = useState(last.query);
	const [found, setFound] = useState<Found | null>(last.found);
	const [progress, setProgress] = useState<Record<string, MediaProgress>>({});
	const [error, setError] = useState<AbsError | null>(null);
	const [retries, setRetries] = useState(0);
	/** With matches in both, show everything or just one kind. */
	const [scope, setScope] = useState<'all' | 'books' | 'podcasts'>('all');

	useEffect(() => {
		let cancelled = false;
		client.progressByItem().then((p) => {
			if (!cancelled) setProgress(p);
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client]);

	// Search as you type, once the typing pauses.
	useEffect(() => {
		const q = query.trim();
		if (q.length < MIN_CHARS) return undefined;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			Promise.all([resolveLibraryId(client), isPremium() ? podcastLibraryId(client) : null]).then(([libraryId, podcastId]) => {
				if (!libraryId && !podcastId) return undefined;
				return Promise.all([
					libraryId ? client.search(libraryId, q) : null,
					podcastId ? client.searchPodcasts(podcastId, q) : noPodcasts
				]).then(([results, podcasts]) => {
					if (cancelled) return;
					const next = {query: q, libraryId: libraryId || '', results, podcasts};
					setFound(next);
					setError(null);
					remember(query, next);
				});
			}).catch((e: unknown) => {
				if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
			});
		}, DEBOUNCE_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [client, query, retries]);

	const onChange = (value: string) => {
		setQuery(value);
		remember(value, last.found);
	};

	const q = query.trim();
	const showing = q.length >= MIN_CHARS && found ? found : null;
	const r = showing ? showing.results : null;

	const books: GridItem[] = r ? r.book.map((b) => toGridItem(client, b.libraryItem, progress[b.libraryItem.id])) : [];
	const series: GridItem[] = r ? r.series.map((s) => {
		// The server lists a series' books unordered here; use the first in series order for the cover.
		const firstEntry = orderSeries(s.books, s.series.id, s.series.name)[0];
		const first = firstEntry ? firstEntry.item : s.books[0];
		return {
			key: 'series:' + s.series.id,
			coverUrl: first && first.media.coverPath ? client.coverUrl(first.id, 480) : '',
			title: s.series.name,
			author: first ? first.media.metadata.authorName : '',
			subtitle: s.books.length + (s.books.length === 1 ? ' book' : ' books'),
			percent: null
		};
	}) : [];
	const authors: GridItem[] = r ? r.authors.filter((a) => (a.numBooks || 0) > 0).map((a) => ({
		key: 'author:' + a.id,
		coverUrl: a.imagePath ? client.authorImageUrl(a.id) : '',
		title: a.name,
		subtitle: (a.numBooks || 0) + ((a.numBooks || 0) === 1 ? ' book' : ' books'),
		percent: null,
		round: true
	})) : [];
	const pr = showing ? showing.podcasts : null;
	const shows: GridItem[] = pr ? pr.podcast.map(({libraryItem: s}) => showTile(client, s)) : [];
	const episodes: GridItem[] = pr ? pr.episodes
		.map(({libraryItem: s}) => (s.recentEpisode ? {...s.recentEpisode, libraryItemId: s.id} as PodcastEpisode : null))
		.filter((e): e is PodcastEpisode => Boolean(e))
		.map((e) => episodeTile(client, e, progress)) : [];
	const anyBooks = books.length + series.length + authors.length + (r ? r.narrators.length : 0) > 0;
	const anyPodcasts = shows.length + episodes.length > 0;
	// With matches in both, chips at the top choose all, audiobooks or podcasts, and in "All" a small
	// heading over each half keeps them apart.
	const both = anyBooks && anyPodcasts;
	const showBooks = !both || scope !== 'podcasts';
	const showPodcasts = !both || scope !== 'books';
	const grouped = both && scope === 'all';
	const bookCount = books.length + series.length + authors.length + (r ? r.narrators.length : 0);
	const podcastCount = shows.length + episodes.length;
	const nothing = showing && !anyBooks && !anyPodcasts;

	return (
		<ScreenContainer id="search" className="vf-browse vf-search" restoreKey={restoreKey}>
			<Rail active="search" onTab={onTab} onSettings={onSettings} />
			<header className="vf-browse__head">
				<h1 className="vf-browse__h1">Search</h1>
			</header>
			<div className="vf-search__field">
				<TextField
					label="SEARCH"
					value={query}
					onChange={onChange}
					placeholder="Search by title, author, narrator, or series"
					spotlightId="search-field"
					defaultFocus={!restoreKey}
				/>
			</div>

			<VScroll className="vf-search__results">
				{error && <ErrorPanel error={error} onRetry={() => setRetries((n) => n + 1)} />}
				{q.length > 0 && q.length < MIN_CHARS && <p className="vf-search__hint" data-vrow>Keep typing…</p>}
				{nothing && <p className="vf-search__hint" data-vrow>{'Nothing matches “' + showing!.query + '”.'}</p>}
				{both && (
					<div className="vf-chips vf-search__scope" data-vrow role="radiogroup" aria-label="Show">
						{([['all', 'All'], ['books', 'Audiobooks · ' + bookCount], ['podcasts', 'Podcasts · ' + podcastCount]] as const).map(([id, label]) => (
							<Button key={id} variant="chip" role="radio" aria-checked={scope === id} className={scope === id ? 'is-active' : ''} data-focus-key={'scope:' + id} onClick={() => setScope(id)}>
								{label}
							</Button>
						))}
					</div>
				)}
				{grouped && <h2 className="vf-search__group">Audiobooks</h2>}
				{showBooks && books.length > 0 && <CoverRow title="Books" meta={String(books.length)} items={books} onSelect={(g) => onOpenTitle(g.key.slice(5), g.key)} />}
				{showBooks && series.length > 0 && showing && <CoverRow title="Series" items={series} onSelect={(g) => onOpenSeries(showing.libraryId, g.key.slice(7), g.title, g.key)} />}
				{showBooks && authors.length > 0 && <CoverRow title="Authors" items={authors} onSelect={(g) => onOpenAuthor(g.key.slice(7), g.title, g.key)} />}
				{showBooks && r && r.narrators.length > 0 && showing && (
					<section className="vf-crow" data-vrow aria-label="Narrators">
						<h2 className="vf-crow__title">Narrators</h2>
						<div className="vf-chips">
							{r.narrators.map((n) => (
								<Button key={n.name} variant="chip" data-focus-key={'narrator:' + n.name} onClick={() => onOpenNarrator(showing.libraryId, n.name, 'narrator:' + n.name)}>
									{n.name}<span className="vf-muted vf-chips__count">{n.numBooks}</span>
								</Button>
							))}
						</div>
					</section>
				)}
				{grouped && <h2 className="vf-search__group">Podcasts</h2>}
				{showPodcasts && shows.length > 0 && <CoverRow title="Shows" items={shows} onSelect={(g) => onOpenShow(g.key.slice(5), g.title, g.key)} />}
				{showPodcasts && episodes.length > 0 && (
					<CoverRow
						title="Episodes"
						meta={String(episodes.length)}
						items={episodes}
						onSelect={(g) => {
							const [itemId, episodeId] = g.key.slice(3).split('/');
							onPlayEpisode(itemId, episodeId, g.key);
						}}
					/>
				)}
			</VScroll>
		</ScreenContainer>
	);
}
