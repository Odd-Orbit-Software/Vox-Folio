import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {LibraryItem, MediaProgress} from '../abs/types';
import type {Route} from '../app/routes';
import {Button, Cover, Icon, Tile} from '../components/controls';
import {Rail} from '../components/Rail';
import {ScreenContainer} from '../components/ScreenContainer';
import type {PlayerState} from '../player/engine';
import {formatDuration} from '../player/timeline';

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

type Load = {state: 'loading'} | {state: 'error'; error: AbsError} | {state: 'ready'; entries: Entry[]};

function remaining (e: Entry): string {
	const duration = e.item.media.duration || (e.progress ? e.progress.duration : 0);
	if (!e.progress || !duration) return formatDuration(duration);
	return formatDuration(Math.max(0, duration - e.progress.currentTime)) + ' left';
}

function percent (e: Entry): number {
	return e.progress ? Math.round(e.progress.progress * 100) : 0;
}

export default function Home ({client, player, restoreKey, onPlay, onDetails, onShowPlayer, onTab, onSettings}: HomeProps) {
	const [load, setLoad] = useState<Load>({state: 'loading'});

	const [reload, setReload] = useState(0);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.itemsInProgress(12), client.progressByItem()]).then(([items, progress]) => {
			if (!cancelled) setLoad({state: 'ready', entries: items.map((item) => ({item, progress: progress[item.id] || null}))});
		}, (e: unknown) => {
			if (!cancelled) setLoad({state: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		});
		return () => {
			cancelled = true;
		};
	}, [client, reload]);

	const retry = () => {
		setLoad({state: 'loading'});
		setReload((n) => n + 1);
	};

	const entries = load.state === 'ready' ? load.entries : [];
	const hero = entries[0];
	const rest = entries.slice(1, 7);
	const nowPlaying = player.itemId && player.status !== 'error' ? player : null;

	return (
		<ScreenContainer id="home" className="vf-home vf-browse" restoreKey={restoreKey} focusDeps={[load.state]}>
			<Rail active="home" onTab={onTab} onSettings={onSettings} />
			<header className="vf-topbar">
				<h1 className="vf-browse__h1">Home</h1>
				<div className="vf-topbar__actions">
					{nowPlaying && (
						<Button variant="chip" className="vf-nowplaying" onClick={() => onShowPlayer('now-playing')} data-focus-key="now-playing">
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

			{load.state === 'error' && (
				<div className="vf-message">
					<h1 className="vf-message__title">Can&apos;t load your books</h1>
					<p className="vf-message__body">{load.error.message}</p>
					<div className="vf-row">
						<Button variant="primary" data-default-focus onClick={retry}>Retry</Button>
					</div>
				</div>
			)}

			{load.state === 'ready' && !hero && (
				<div className="vf-message">
					<h1 className="vf-message__title">Nothing in progress yet</h1>
					<p className="vf-message__body">Start a book on your phone, or open one from the Polaris home screen, and it will show up here.</p>
					{nowPlaying && (
						<div className="vf-row">
							<Button variant="primary" data-default-focus onClick={() => onShowPlayer('now-playing')}>Back to the player</Button>
						</div>
					)}
				</div>
			)}

			{hero && (
				<section className="vf-hero" aria-label="Continue listening">
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
				<section className="vf-shelf" aria-label="In progress">
					<h2 className="vf-shelf__title">In progress</h2>
					<div className="vf-shelf__row">
						{rest.map((e) => (
							<Tile
								key={e.item.id}
								className="vf-book"
								data-focus-key={'book:' + e.item.id}
								onClick={() => onPlay(e.item.id, 'book:' + e.item.id)}
								aria-label={e.item.media.metadata.title + ', ' + remaining(e)}
							>
								<Cover url={client.coverUrl(e.item.id, 480)} title={e.item.media.metadata.title} author={e.item.media.metadata.authorName} size={240} />
								<div className="vf-bar vf-bar--tile"><div className="vf-bar__fill" style={{width: percent(e) + '%'}} /></div>
								<div className="vf-book__title">{e.item.media.metadata.title}</div>
								<div className="vf-book__meta">{remaining(e)}</div>
							</Tile>
						))}
					</div>
				</section>
			)}
		</ScreenContainer>
	);
}
