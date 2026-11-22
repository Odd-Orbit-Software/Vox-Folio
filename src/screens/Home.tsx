import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {LibraryItem, MediaProgress, Shelf} from '../abs/types';
import type {Route} from '../app/routes';
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

interface HomeProps {
	client: AbsClient;
	player: PlayerState;
	restoreKey: string | null;
	/** Play (or bring forward) a book; `fromKey` is the item to refocus on return. */
	onPlay: (itemId: string, fromKey: string) => void;
	onDetails: (itemId: string, fromKey: string) => void;
	onShowPlayer: (fromKey: string) => void;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
}

interface Entry {
	item: LibraryItem;
	progress: MediaProgress | null;
}

type Load = {state: 'loading'} | {state: 'error'; error: AbsError} | {state: 'ready'; entries: Entry[]; progress: Record<string, MediaProgress>};

/* Instant start: the last Home, kept per account (book data only, never tokens), shown at once
   while the fresh copy loads. */
interface HomeCache {
	entries: Entry[];
	progress: Record<string, MediaProgress>;
	shelves: Shelf[];
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
const SHELVES: {id: string; label: string; prefix: string}[] = [
	{id: 'continue-series', label: 'Continue series', prefix: 'next'},
	{id: 'recently-added', label: 'Recently added', prefix: 'new'}
];

function remaining (e: Entry): string {
	const duration = e.item.media.duration || (e.progress ? e.progress.duration : 0);
	if (!e.progress || !duration) return formatDuration(duration);
	return formatDuration(Math.max(0, duration - e.progress.currentTime)) + ' left';
}

function percent (e: Entry): number {
	return e.progress ? Math.round(e.progress.progress * 100) : 0;
}

export default function Home ({client, player, restoreKey, onPlay, onDetails, onShowPlayer, onTab, onSettings}: HomeProps) {
	const [cached] = useState(() => readCache(client));
	const [load, setLoad] = useState<Load>(() => (cached && cached.entries.length
		? {state: 'ready', entries: cached.entries, progress: cached.progress}
		: {state: 'loading'}));

	const [reload, setReload] = useState(0);
	/** The last refresh failed while saved books are showing. */
	const [stale, setStale] = useState<AbsError | null>(null);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.itemsInProgress(12), client.progressByItem()]).then(([items, progress]) => {
			if (cancelled) return;
			// Development: time from launch to fresh Home data (no-op without `probe`).
			report({kind: 'perf', homeFreshMs: Math.round(performance.now()), fromCache: Boolean(cached)});
			const entries = items.map((item) => ({item, progress: progress[item.id] || null}));
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
	useEffect(() => {
		let cancelled = false;
		resolveLibraryId(client).then((id) => (id ? client.shelves(id) : [])).then((list) => {
			if (cancelled) return;
			setShelves(list);
			writeCache(client, {shelves: list.filter((sh) => SHELVES.some((d) => d.id === sh.id))});
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, reload]);

	const retry = () => {
		setStale(null);
		setLoad((prev) => (prev.state === 'ready' ? prev : {state: 'loading'}));
		setReload((n) => n + 1);
	};

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
	const restItems: GridItem[] = rest.map((e) => ({...toGridItem(client, e.item, progress[e.item.id]), subtitle: remaining(e), percent: percent(e)}));
	const extraRows = SHELVES.map((def) => {
		const shelf = shelves.filter((sh) => sh.id === def.id && sh.type === 'book')[0];
		const items: GridItem[] = shelf ? shelf.entities.map((item) => ({...toGridItem(client, item, progress[item.id]), key: def.prefix + ':' + item.id})) : [];
		return {...def, items};
	}).filter((r) => r.items.length > 0);
	const nowPlaying = player.itemId && player.status !== 'error' ? player : null;

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
						<p className="vf-message__body">Books you start will appear here.</p>
						{nowPlaying && (
							<div className="vf-row">
								<Button variant="primary" data-default-focus onClick={() => onShowPlayer('now-playing')}>Back to the player</Button>
							</div>
						)}
					</div>
				)}
				{hero && (
					<section className="vf-hero" data-vrow aria-label="Continue listening">
						<Cover url={client.coverUrl(hero.item.id, 680)} title={hero.item.media.metadata.title} author={hero.item.media.metadata.authorName} size={340} className="vf-hero__cover" />
						<div className="vf-hero__body">
							<div className="vf-eyebrow">Continue listening</div>
							<div className="vf-hero__title">{hero.item.media.metadata.title}</div>
							<div className="vf-hero__meta">
								{hero.item.media.metadata.authorName}
								{hero.item.media.metadata.narratorName ? ' · read by ' + hero.item.media.metadata.narratorName : ''}
								{hero.item.media.metadata.seriesName ? ' · ' + hero.item.media.metadata.seriesName : ''}
							</div>
							<div className="vf-progress-line">
								<div className="vf-bar vf-bar--hero"><div className="vf-bar__fill" style={{width: percent(hero) + '%'}} /></div>
								<span>{percent(hero) + '% · ' + remaining(hero)}</span>
							</div>
							<div className="vf-row vf-row--spaced">
								<Button
									variant="primary"
									data-default-focus
									data-focus-key={'hero:' + hero.item.id}
									onClick={() => onPlay(hero.item.id, 'hero:' + hero.item.id)}
								>
									<Icon name="play" size={26} />
									{player.itemId === hero.item.id ? 'Back to player' : 'Resume'}
								</Button>
								<Button data-focus-key={'details:' + hero.item.id} onClick={() => onDetails(hero.item.id, 'details:' + hero.item.id)}>Details</Button>
							</div>
						</div>
					</section>
				)}

				{rest.length > 0 && (
					<CoverRow title="In progress" items={restItems} onSelect={(g) => onPlay(g.key.slice(5), g.key)} />
				)}
				{extraRows.map((r, i) => (
					<CoverRow key={r.id} title={r.label} items={r.items} defaultFocus={!hero && !nowPlaying && i === 0} onSelect={(g) => onDetails(g.key.slice(r.prefix.length + 1), g.key)} />
				))}
			</VScroll>
			</div>
		</ScreenContainer>
	);
}
