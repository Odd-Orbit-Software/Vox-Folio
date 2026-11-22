import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent, ReactNode} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import {progressKey} from '../abs/client';
import type {LibraryItem, MediaProgress, PodcastEpisode, Shelf} from '../abs/types';
import {subscribeProgress} from '../app/live';
import {snoozeYearPrompt} from '../app/yearReview';
import {episodeDate, episodeTitle, podcastLibraryId} from '../app/podcasts';
import {isPremium} from '../app/premium';
import type {Route} from '../app/routes';
import {homeRowShown, orderedHomeRows, useSettings} from '../app/settings';
import type {HomeRowId} from '../app/settings';
import {Button, Cover, Icon} from '../components/controls';
import type {GridItem} from '../components/CoverGrid';
import {Rail} from '../components/Rail';
import {CoverRow, VScroll} from '../components/Rows';
import {ErrorPanel, errorTitle} from '../components/ErrorPanel';
import {focusWithin, ScreenContainer} from '../components/ScreenContainer';
import {report} from '../dev/probe';
import type {PlayerState} from '../player/engine';
import {formatDuration} from '../player/timeline';
import {Keys} from '../platform/webos';
import {resolveLibraryId, toGridItem} from './Library';
import {episodeKey, episodeTile} from './Podcasts';

interface HomeProps {
	client: AbsClient;
	player: PlayerState;
	restoreKey: string | null;
	/** Play (or bring forward) a book; `fromKey` is the item to refocus on return. */
	onPlay: (itemId: string, fromKey: string) => void;
	onDetails: (itemId: string, fromKey: string) => void;
	onPlayEpisode: (itemId: string, episodeId: string, fromKey: string) => void;
	onOpenShow: (itemId: string, title: string, fromKey: string) => void;
	onShowPlayer: (fromKey: string) => void;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onToast: (text: string) => void;
	onOpenSeries: (libraryId: string, seriesId: string, name: string, fromKey: string) => void;
	/** Settings, at the Home rows section. */
	onCustomise: () => void;
}

interface Entry {
	item: LibraryItem;
	progress: MediaProgress | null;
	/** Set when this is a podcast episode in progress (item is then the show). */
	episode?: PodcastEpisode;
}

type Load = {state: 'loading'} | {state: 'error'; error: AbsError} | {state: 'ready'; entries: Entry[]; progress: Record<string, MediaProgress>};

/* Instant start: the last Home, kept per account (book data only, never tokens), shown at once
   while the fresh copy loads. */
interface HomeCache {
	entries: Entry[];
	progress: Record<string, MediaProgress>;
	shelves: Shelf[];
	/** ★ The podcast library's newest episodes. */
	episodes?: PodcastEpisode[];
}

function cacheKey (client: AbsClient): string {
	return 'voxfolio.home.v1:' + client.credentials.serverUrl + '|' + client.credentials.userId;
}

function readCache (client: AbsClient): HomeCache | null {
	try {
		const raw = window.localStorage.getItem(cacheKey(client));
		return raw ? JSON.parse(raw) as HomeCache : null;
	} catch {
		return null;
	}
}

function writeCache (client: AbsClient, patch: Partial<HomeCache>): void {
	try {
		const next = {...(readCache(client) || {entries: [], progress: {}, shelves: []}), ...patch};
		window.localStorage.setItem(cacheKey(client), JSON.stringify(next));
	} catch {
		// Storage full: Home just loads normally next time.
	}
}

/** Audiobookshelf's own Home shelves we show, in order, with our labels. */
const SHELVES: {id: HomeRowId; label: string; prefix: string}[] = [
	{id: 'continue-series', label: 'Continue series', prefix: 'next'},
	{id: 'recently-added', label: 'Recently added', prefix: 'new'},
	{id: 'discover', label: 'Discover', prefix: 'disc'},
	{id: 'listen-again', label: 'Listen again', prefix: 'again'},
	{id: 'recent-series', label: 'New series', prefix: 'series'}
];

/** A series tile for the Recent series row: its first book's cover and how many books. */
function seriesTile (client: AbsClient, sr: {id: string; name: string; books?: LibraryItem[]}): GridItem {
	const books = sr.books || [];
	const first = books[0];
	return {
		key: 'series:' + sr.id,
		coverUrl: first && first.media.coverPath ? client.coverUrl(first.id, 480) : '',
		title: sr.name,
		subtitle: books.length + (books.length === 1 ? ' book' : ' books'),
		percent: null
	};
}

/** The progress key for an entry: item, or item/episode. */
function entryKey (e: Entry): string {
	return progressKey(e.item.id, e.episode ? e.episode.id : null);
}

/** The focus key of an entry's tile in the In progress row. */
function tileKey (e: Entry): string {
	return e.episode ? episodeKey(e.episode) : 'book:' + e.item.id;
}

/** How long a removal can be undone; matches the toast's time on screen. */
const UNDO_MS = 4000;

function entryTitle (e: Entry): string {
	return e.episode ? episodeTitle(e.episode) : e.item.media.metadata.title;
}

/** Long podcast titles would fill the toast. */
function shorten (title: string): string {
	return title.length > 42 ? title.slice(0, 40).replace(/\s+\S*$/, '') + '…' : title;
}

function insertAt<T> (list: T[], at: number, item: T): T[] {
	return list.slice(0, at).concat([item], list.slice(at));
}

function remaining (e: Entry): string {
	const duration = (e.episode ? e.episode.duration : e.item.media.duration) || (e.progress ? e.progress.duration : 0) || 0;
	if (!e.progress || !duration) return formatDuration(duration);
	return formatDuration(Math.max(0, duration - e.progress.currentTime)) + ' left';
}

function percent (e: Entry): number {
	return e.progress ? Math.round(e.progress.progress * 100) : 0;
}

export default function Home ({client, player, restoreKey, onPlay, onDetails, onPlayEpisode, onOpenShow, onShowPlayer, onTab, onSettings, onToast, onOpenSeries, onCustomise}: HomeProps) {
	const [cached] = useState(() => readCache(client));
	const settings = useSettings();
	const [load, setLoad] = useState<Load>(() => (cached && cached.entries.length
		? {state: 'ready', entries: cached.entries, progress: cached.progress}
		: {state: 'loading'}));

	const [reload, setReload] = useState(0);
	/** The last refresh failed while saved books are showing. */
	const [stale, setStale] = useState<AbsError | null>(null);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.itemsInProgress(25, isPremium()), client.progressByItem()]).then(([all, progress]) => {
			if (cancelled) return;
			// Development: time from launch to fresh Home data (no-op without `probe`).
			report({kind: 'perf', homeFreshMs: Math.round(performance.now()), fromCache: Boolean(cached)});
			// The server's in-progress list ignores "Remove from Continue Listening"; honour it here.
			const items = all.filter((item) => {
				const p = progress[progressKey(item.id, item.recentEpisode ? item.recentEpisode.id : null)];
				return !(p && p.hideFromContinueListening);
			}).slice(0, 13);
			const entries: Entry[] = items.map((item) => {
				const episode = item.recentEpisode ? {...item.recentEpisode, libraryItemId: item.id} : undefined;
				return {item, episode, progress: progress[progressKey(item.id, episode ? episode.id : null)] || null};
			});
			setLoad({state: 'ready', entries, progress});
			// Keep only what Home shows, so the cache stays small.
			const shown: Record<string, MediaProgress> = {};
			Object.keys(progress).forEach((k) => {
				if (progress[k].isFinished === false || items.some((i) => i.id === k)) shown[k] = progress[k];
			});
			writeCache(client, {entries, progress: shown});
		}, (e: unknown) => {
			if (cancelled) return;
			const err = e instanceof AbsError ? e : new AbsError('server', String(e));
			// With saved books on screen, keep them and just flag that we couldn't refresh.
			setLoad((prev) => (prev.state === 'ready' ? prev : {state: 'error', error: err}));
			setStale(err);
		});
		return () => {
			cancelled = true;
		};
	}, [client, reload, cached]);

	// The server's shelves are extras: Home works without them.
	const [shelves, setShelves] = useState<Shelf[]>(() => (cached ? cached.shelves : []));
	const [libraryId, setLibraryId] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		resolveLibraryId(client).then((id) => {
			if (!cancelled) setLibraryId(id);
			return id ? client.shelves(id) : [];
		}).then((list) => {
			if (cancelled) return;
			setShelves(list);
			writeCache(client, {shelves: list.filter((sh) => SHELVES.some((d) => d.id === sh.id))});
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, reload]);

	// ★ New podcast episodes, when the account has a podcast library.
	const [episodes, setEpisodes] = useState<PodcastEpisode[]>(() => (cached && cached.episodes) || []);
	useEffect(() => {
		let cancelled = false;
		if (!isPremium()) return undefined;
		podcastLibraryId(client).then((id) => (id ? client.recentEpisodes(id, 12) : [])).then((list) => {
			if (cancelled) return;
			setEpisodes(list);
			writeCache(client, {episodes: list.map((e) => ({...e, description: ''}))});
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, reload]);

	const loadRef = useRef(load);
	// After a live reload, focus goes back to the same tile wherever it now sits.
	const refocusKey = useRef<string | null>(null);
	useEffect(() => {
		loadRef.current = load;
		const key = refocusKey.current;
		if (!key) return;
		refocusKey.current = null;
		window.setTimeout(() => {
			if (document.querySelector('[data-spotlight-id="home"] [data-focus-key="' + key + '"]')) focusWithin('home', key);
		}, 0);
	}, [load]);

	/* Live progress from the server: update the bars in place; something new (or finished) in
	   progress means the list itself changed, so reload it, at most every few seconds. */
	useEffect(() => {
		let timer: number | null = null;
		const reloadSoon = () => {
			if (timer !== null) return;
			timer = window.setTimeout(() => {
				timer = null;
				const active = document.activeElement as HTMLElement | null;
				// Never swap the main card under the listener's finger: wait until focus leaves it.
				if (active && active.closest('.vf-hero')) {
					reloadSoon();
					return;
				}
				refocusKey.current = active && active.closest('[data-spotlight-id="home"]') ? active.getAttribute('data-focus-key') : null;
				setReload((n) => n + 1);
			}, 3000);
		};
		const unsubscribe = subscribeProgress((p) => {
			if (!p) {
				reloadSoon();
				return;
			}
			const key = progressKey(p.libraryItemId, p.episodeId);
			const now = loadRef.current;
			const known = now.state === 'ready' && now.entries.some((e) => entryKey(e) === key);
			setLoad((prev) => {
				if (prev.state !== 'ready') return prev;
				return {
					...prev,
					progress: {...prev.progress, [key]: p},
					entries: prev.entries.map((e) => (entryKey(e) === key ? {...e, progress: p} : e))
				};
			});
			if (!known || p.isFinished) reloadSoon();
		});
		return () => {
			unsubscribe();
			if (timer !== null) window.clearTimeout(timer);
		};
	}, []);

	const retry = () => {
		setStale(null);
		setLoad((prev) => (prev.state === 'ready' ? prev : {state: 'loading'}));
		setReload((n) => n + 1);
	};

	/* Remove from Continue listening, with a short window to undo: the entry leaves at once, and the
	   server is told only when the window closes (or Home is left). Red again within it puts it back. */
	const pending = useRef<{entry: Entry; at: number; progressId: string; timer: number} | null>(null);
	const [undoable, setUndoable] = useState(false);

	const commitRemoval = () => {
		const p = pending.current;
		if (!p) return;
		window.clearTimeout(p.timer);
		pending.current = null;
		setUndoable(false);
		const title = entryTitle(p.entry);
		client.removeFromContinueListening(p.progressId).then(() => {
			// Keep the saved Home in step, so it doesn't reappear on the next launch's first paint.
			const saved = readCache(client);
			if (saved) writeCache(client, {entries: saved.entries.filter((e) => entryKey(e) !== entryKey(p.entry))});
		}, () => {
			onToast("Couldn't remove " + title + '. It will stay in Continue listening.');
			setLoad((prev) => (prev.state === 'ready' && !prev.entries.some((e) => entryKey(e) === entryKey(p.entry))
				? {...prev, entries: insertAt(prev.entries, p.at, p.entry)}
				: prev));
		});
	};

	// Leaving Home finishes any removal still waiting.
	useEffect(() => () => commitRemoval(), []); // eslint-disable-line react-hooks/exhaustive-deps

	const removeEntry = (key: string) => {
		if (load.state !== 'ready') return;
		commitRemoval();
		const list = load.entries;
		const at = list.map(entryKey).indexOf(key);
		const p = load.progress[key];
		if (at === -1 || !p || !p.id) return;
		const entry = list[at];
		const entries = list.filter((e) => entryKey(e) !== key);
		setLoad((prev) => (prev.state === 'ready' ? {...prev, entries: prev.entries.filter((e) => entryKey(e) !== key)} : prev));
		pending.current = {entry, at, progressId: p.id, timer: window.setTimeout(commitRemoval, UNDO_MS)};
		setUndoable(true);
		onToast('Removed ' + shorten(entryTitle(entry)) + ' · Red to undo');
		// The hero is entries[0]; the In progress row holds the rest.
		const next = entries[Math.min(at, entries.length - 1)];
		window.setTimeout(() => {
			if (!next) focusWithin('home', null);
			else if (entries.indexOf(next) === 0) focusWithin('home', 'hero:' + entryKey(next));
			else focusWithin('home', tileKey(next));
		}, 0);
	};

	const undoRemoval = () => {
		const p = pending.current;
		if (!p) return;
		window.clearTimeout(p.timer);
		pending.current = null;
		setUndoable(false);
		setLoad((prev) => (prev.state === 'ready' ? {...prev, entries: insertAt(prev.entries, p.at, p.entry)} : prev));
		onToast('Kept ' + shorten(entryTitle(p.entry)) + ' in Continue listening');
		const key = p.at === 0 ? 'hero:' + entryKey(p.entry) : tileKey(p.entry);
		window.setTimeout(() => focusWithin('home', key), 0);
	};

	// Red: undo a removal that's still waiting, wherever focus is on Home.
	useEffect(() => {
		if (!undoable) return undefined;
		const onKey = (ev: globalThis.KeyboardEvent) => {
			if (ev.keyCode !== Keys.RED) return;
			ev.preventDefault();
			ev.stopPropagation();
			undoRemoval();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [undoable]); // eslint-disable-line react-hooks/exhaustive-deps

	// Down from the top bar (the now-playing chip) returns to where you were in the shelves.
	const lastRowKey = useRef<string | null>(null);
	const rememberRow = (ev: {target: EventTarget}) => {
		const key = (ev.target as HTMLElement).getAttribute && (ev.target as HTMLElement).getAttribute('data-focus-key');
		if (key) lastRowKey.current = key;
	};
	const downFromTop = (ev: KeyboardEvent<HTMLElement>) => {
		if (ev.keyCode !== Keys.DOWN) return;
		ev.preventDefault();
		ev.stopPropagation();
		focusWithin('home', lastRowKey.current);
	};

	const entries = load.state === 'ready' ? load.entries : [];
	const hero = entries[0];
	const rest = entries.slice(1, 13);
	const progress = load.state === 'ready' ? load.progress : {};
	const restItems: GridItem[] = rest.map((e) => (e.episode
		? episodeTile(client, e.episode, progress)
		: {...toGridItem(client, e.item, progress[e.item.id]), subtitle: remaining(e), percent: percent(e)}));
	const newEpisodes: GridItem[] = episodes.map((e) => ({...episodeTile(client, e, progress), key: 'new' + episodeKey(e)}));
	// Tiles are "book:<id>" or "ep:<show>/<episode>"; "newep:" for the New episodes row.
	const openTile = (g: GridItem) => {
		const ep = /^(?:new)?ep:([^/]+)\/(.+)$/.exec(g.key);
		if (ep) onPlayEpisode(ep[1], ep[2], g.key);
		else onPlay(g.key.slice(5), g.key);
	};
	const heroEp = hero ? hero.episode : undefined;
	const heroKey = hero ? progressKey(hero.item.id, heroEp ? heroEp.id : null) : '';
	const heroIsLoaded = Boolean(hero && player.itemId && progressKey(player.itemId, player.episodeId) === heroKey);
	const extraRows = SHELVES.filter((def) => homeRowShown(settings, def.id)).map((def) => {
		const shelf = shelves.filter((sh) => sh.id === def.id && (sh.type === 'book' || sh.type === 'series'))[0];
		const items: GridItem[] = !shelf ? [] : shelf.type === 'series'
			// A one-book "series" isn't much of a series to browse.
			? (shelf.entities as unknown as {id: string; name: string; books?: LibraryItem[]}[]).filter((sr) => (sr.books || []).length > 1).map((sr) => seriesTile(client, sr))
			: shelf.entities.map((item) => ({...toGridItem(client, item, progress[item.id]), key: def.prefix + ':' + item.id}));
		return {...def, items};
	}).filter((r) => r.items.length > 0);
	const showInProgress = homeRowShown(settings, 'in-progress');
	const showNewEpisodes = homeRowShown(settings, 'new-episodes');
	const openShelfTile = (r: {prefix: string}, g: GridItem) => {
		if (g.key.indexOf('series:') === 0) {
			if (libraryId) onOpenSeries(libraryId, g.key.slice(7), g.title, g.key);
		} else {
			onDetails(g.key.slice(r.prefix.length + 1), g.key);
		}
	};
	const nowPlaying = player.itemId && player.status !== 'error' ? player : null;

	// Rows in the listener's order (Settings); the first one with tiles takes focus when there's no hero.
	const rowEls: Partial<Record<HomeRowId, {el: (focus: boolean) => ReactNode; has: boolean}>> = {
		'in-progress': {
			has: showInProgress && rest.length > 0,
			el: (focus) => (
				<CoverRow
					key="in-progress"
					title="In progress"
					items={restItems}
					onSelect={openTile}
					defaultFocus={focus}
					action={{label: undoable ? 'Undo remove' : 'Remove from Continue listening', onAction: (g) => {
						const e = rest.filter((r) => tileKey(r) === g.key)[0];
						if (e) removeEntry(entryKey(e));
					}}}
				/>
			)
		},
		'new-episodes': {
			has: showNewEpisodes && newEpisodes.length > 0,
			el: (focus) => <CoverRow key="new-episodes" title="New episodes" items={newEpisodes} defaultFocus={focus} onSelect={openTile} />
		}
	};
	extraRows.forEach((r) => {
		rowEls[r.id] = {has: true, el: (focus) => <CoverRow key={r.id} title={r.label} items={r.items} defaultFocus={focus} onSelect={(g) => openShelfTile(r, g)} />};
	});
	const shown = orderedHomeRows(settings).filter((id) => rowEls[id] && rowEls[id]!.has);
	const rowsInOrder = shown.map((id, i) => rowEls[id]!.el(!hero && !nowPlaying && i === 0));

	return (
		<ScreenContainer id="home" className="vf-home vf-browse" restoreKey={restoreKey} focusDeps={[load.state, extraRows.length > 0]}>
			<Rail active="home" onTab={onTab} onSettings={onSettings} />
			<header className="vf-topbar">
				<h1 className="vf-browse__h1">Home</h1>
				<div className="vf-topbar__actions">
					{stale && load.state === 'ready' && (
						<Button variant="chip" className="vf-offline" data-focus-key="offline" onClick={retry}>{errorTitle(stale) + ' · Retry'}</Button>
					)}
					{nowPlaying && (
						<Button variant="chip" className="vf-nowplaying" onClick={() => onShowPlayer('now-playing')} onKeyDown={downFromTop} data-focus-key="now-playing">
							<Icon name={nowPlaying.status === 'playing' ? 'pause' : 'play'} size={18} />
							<span className="vf-nowplaying__title">{nowPlaying.title || 'Loading…'}</span>
							{nowPlaying.duration > 0 && <span className="vf-muted vf-nowplaying__pct">{'· ' + Math.round(nowPlaying.position / nowPlaying.duration * 100) + '%'}</span>}
						</Button>
					)}
				</div>
			</header>

			{load.state === 'loading' && (
				<div className="vf-hero vf-hero--skeleton" aria-busy="true">
					<div className="vf-skeleton vf-skeleton--cover" />
					<div className="vf-hero__body">
						<div className="vf-skeleton vf-skeleton--line" />
						<div className="vf-skeleton vf-skeleton--title" />
						<div className="vf-skeleton vf-skeleton--line" />
					</div>
				</div>
			)}

			{load.state === 'error' && <ErrorPanel error={load.error} onRetry={retry} className="vf-errorpanel--home" />}

			<div onFocus={rememberRow}>
			<VScroll className="vf-home__rows">
				{load.state === 'ready' && !hero && (
					<div className="vf-message vf-home__empty" data-vrow>
						<h1 className="vf-message__title">Nothing in progress yet</h1>
						<p className="vf-message__body">Whatever you start listening to will appear here.</p>
						{nowPlaying && (
							<div className="vf-row">
								<Button variant="primary" data-default-focus onClick={() => onShowPlayer('now-playing')}>Back to the player</Button>
							</div>
						)}
					</div>
				)}
				{hero && (
					<section
						className="vf-hero"
						data-vrow
						aria-label="Continue listening"
						onKeyDown={(ev) => {
							if (ev.keyCode !== Keys.RED || heroIsLoaded) return;
							ev.preventDefault();
							ev.stopPropagation();
							removeEntry(heroKey);
						}}
					>
						<Cover url={client.coverUrl(hero.item.id, 680)} title={hero.item.media.metadata.title} author={hero.item.media.metadata.authorName} size={340} className="vf-hero__cover" />
						<div className="vf-hero__body">
							<div className="vf-eyebrow">Continue listening</div>
							<div className="vf-hero__title">{heroEp ? episodeTitle(heroEp) : hero.item.media.metadata.title}</div>
							{heroEp ? (
								<div className="vf-hero__meta">{[hero.item.media.metadata.title, episodeDate(heroEp)].filter(Boolean).join(' · ')}</div>
							) : (
								<div className="vf-hero__meta">
									{hero.item.media.metadata.authorName}
									{hero.item.media.metadata.narratorName ? ' · read by ' + hero.item.media.metadata.narratorName : ''}
									{hero.item.media.metadata.seriesName ? ' · ' + hero.item.media.metadata.seriesName : ''}
								</div>
							)}
							<div className="vf-progress-line">
								<div className="vf-bar vf-bar--hero"><div className="vf-bar__fill" style={{width: percent(hero) + '%'}} /></div>
								<span>{percent(hero) + '% · ' + remaining(hero)}</span>
							</div>
							<div className="vf-row vf-row--spaced">
								<Button
									variant="primary"
									data-default-focus
									data-focus-key={'hero:' + heroKey}
									onClick={() => (heroEp ? onPlayEpisode(hero.item.id, heroEp.id, 'hero:' + heroKey) : onPlay(hero.item.id, 'hero:' + heroKey))}
								>
									<Icon name="play" size={26} />
									{heroIsLoaded ? 'Back to player' : 'Resume'}
								</Button>
								{heroEp ? (
									<Button data-focus-key={'show:' + hero.item.id} onClick={() => onOpenShow(hero.item.id, hero.item.media.metadata.title, 'show:' + hero.item.id)}>All episodes</Button>
								) : (
									<Button data-focus-key={'details:' + hero.item.id} onClick={() => onDetails(hero.item.id, 'details:' + hero.item.id)}>Details</Button>
								)}
								{!heroIsLoaded && (
									<Button data-focus-key="hero-remove" onClick={() => removeEntry(heroKey)}><span className="vf-dot vf-dot--red" />Remove</Button>
								)}
							</div>
						</div>
					</section>
				)}

				{showInProgress && rest.length > 0 && (
					<CoverRow
						title="In progress"
						items={restItems}
						onSelect={openTile}
						action={{label: undoable ? 'Undo remove' : 'Remove from Continue listening', onAction: (g) => {
							const e = rest.filter((r) => tileKey(r) === g.key)[0];
							if (e) removeEntry(entryKey(e));
						}}}
					/>
				)}
				{showNewEpisodes && newEpisodes.length > 0 && (
					<CoverRow title="New episodes" items={newEpisodes} defaultFocus={!hero && !nowPlaying} onSelect={openTile} />
				)}
				{extraRows.map((r, i) => (
					<CoverRow key={r.id} title={r.label} items={r.items} defaultFocus={!hero && !nowPlaying && !(showNewEpisodes && newEpisodes.length) && i === 0} onSelect={(g) => openShelfTile(r, g)} />
				))}

				{load.state === 'ready' && (
					<div className="vf-home__customise" data-vrow>
						<Button variant="chip" data-focus-key="customise" onClick={onCustomise}>
							<Icon name="settings" size={22} />Choose Home rows
						</Button>
					</div>
				)}
			</VScroll>
			</div>
		</ScreenContainer>
	);
}
