import {useEffect, useState} from 'react';

import {AbsClient, AbsError, progressKey} from '../abs/client';
import type {LibraryItem, MediaProgress, PodcastEpisode} from '../abs/types';
import {episodeLength, episodeState, episodeTitle, plainText} from '../app/podcasts';
import {Button, Cover, Icon, Tile} from '../components/controls';
import {ErrorPanel} from '../components/ErrorPanel';
import {Marquee} from '../components/marquee';
import {pinScroll, ScreenContainer} from '../components/ScreenContainer';
import {Keys} from '../platform/webos';
import type {PlayerState} from '../player/engine';

interface PodcastShowProps {
	client: AbsClient;
	itemId: string;
	title: string;
	player: PlayerState;
	restoreKey: string | null;
	onPlayEpisode: (itemId: string, episodeId: string, fromKey: string) => void;
	onToast: (text: string) => void;
}

type Load = {state: 'loading'} | {state: 'error'; error: AbsError} | {state: 'ready'; show: LibraryItem; episodes: PodcastEpisode[]; progress: Record<string, MediaProgress>};

/** Rows are 140 px with a 12 px gap; must match .vf-series__row. */
const ROW_PITCH = 152;

const DAY = {day: 'numeric'} as const;
const MONTH_YEAR = {month: 'short', year: 'numeric'} as const;

function dateParts (at: number | null | undefined): [string, string] {
	if (!at) return ['·', ''];
	try {
		const d = new Date(at);
		return [d.toLocaleDateString('en-GB', DAY), d.toLocaleDateString('en-GB', MONTH_YEAR)];
	} catch {
		return ['·', ''];
	}
}

/** One show: its description and every episode, newest first. OK plays an episode. */
export default function PodcastShow ({client, itemId, title, player, restoreKey, onPlayEpisode, onToast}: PodcastShowProps) {
	const [load, setLoad] = useState<Load>({state: 'loading'});
	const [reload, setReload] = useState(0);
	const [focusRow, setFocusRow] = useState(0);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.getItem(itemId), client.progressByItem()]).then(([show, progress]) => {
			if (cancelled) return;
			const episodes = (show.media.episodes || []).slice().sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
			setLoad({state: 'ready', show, episodes, progress});
		}, (e: unknown) => {
			if (!cancelled) setLoad({state: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		});
		return () => {
			cancelled = true;
		};
	}, [client, itemId, reload]);

	const [busy, setBusy] = useState<string | null>(null);
	/** Mark an episode played, or not, and show the server's answer. */
	const togglePlayed = (e: PodcastEpisode, played: boolean) => {
		if (busy) return;
		setBusy(e.id);
		client.setFinished(itemId, !played, e.id).then(() => client.getProgress(itemId, e.id)).then((p) => {
			setBusy(null);
			setLoad((l) => {
				if (l.state !== 'ready') return l;
				const progress = {...l.progress};
				if (p) progress[progressKey(itemId, e.id)] = p;
				else delete progress[progressKey(itemId, e.id)];
				return {...l, progress};
			});
		}, () => {
			setBusy(null);
			onToast(played ? "Couldn't mark that unplayed" : "Couldn't mark that played");
		});
	};

	const ready = load.state === 'ready' ? load : null;
	const md = ready ? ready.show.media.metadata : null;
	const episodes = ready ? ready.episodes : [];
	// The header describes the focused episode (feeds put the useful detail there), or the show.
	const focused = episodes[focusRow];
	const episodeAbout = focused ? plainText(focused.description) : '';
	const description = episodeAbout || (md ? plainText(md.description) : '');
	const focusedPlayed = Boolean(ready && focused && episodeState(focused, ready.progress).finished);

	return (
		<ScreenContainer id="podcast-show" className="vf-series vf-show" restoreKey={restoreKey} focusDeps={[load.state]}>
			<div className="vf-hint vf-series__back"><Icon name="back" size={24} />Back</div>
			{focused && (
				<div className="vf-hint vf-show__hint" aria-hidden="true">
					<span className="vf-dot vf-dot--red" />{focusedPlayed ? 'Mark unplayed' : 'Mark played'}
				</div>
			)}
			<header className="vf-series__head vf-show__head">
				<Cover url={client.coverUrl(itemId, 360)} title={title} size={180} className="vf-show__cover" />
				<div className="vf-show__intro">
					<div className="vf-eyebrow">{'Podcast' + (md && md.author ? ' · ' + md.author : '')}</div>
					<h1 className="vf-series__title">{md ? md.title : title}</h1>
					{description && <p className="vf-show__desc">{description}</p>}
				</div>
			</header>

			{load.state === 'error' && (
				<ErrorPanel error={load.error} onRetry={() => {
					setLoad({state: 'loading'});
					setReload((n) => n + 1);
				}}
				/>
			)}
			{ready && !episodes.length && <p className="vf-message__body">No episodes downloaded for this show yet.</p>}

			<div className="vf-series__viewport vf-show__viewport" onScroll={pinScroll}>
				<ol className="vf-series__list" style={{transform: 'translateY(' + -Math.max(0, focusRow - 1) * ROW_PITCH + 'px)'}}>
					{ready && episodes.map((e, i) => {
						const s = episodeState(e, ready.progress);
						const playing = player.itemId === itemId && player.episodeId === e.id && player.status !== 'error';
						const pct = playing && player.duration ? Math.round(player.position / player.duration * 100) : s.percent;
						const [day, monthYear] = dateParts(e.publishedAt);
						const key = 'ep:' + itemId + '/' + e.id;
						return (
							<li key={e.id} className="vf-show__item">
								<Tile
									className="vf-series__row vf-show__row"
									data-focus-key={key}
									data-default-focus={i === 0 || undefined}
									aria-label={episodeTitle(e) + (monthYear ? ', ' + day + ' ' + monthYear : '')}
									onFocus={() => setFocusRow(i)}
									onKeyDown={(ev) => {
										if (ev.keyCode !== Keys.RED) return;
										ev.preventDefault();
										togglePlayed(e, s.finished);
									}}
									onClick={() => onPlayEpisode(itemId, e.id, key)}
								>
									<span className="vf-series__seq vf-show__date">{day}<span className="vf-show__month">{monthYear}</span></span>
									<span className="vf-series__info">
										<Marquee className="vf-series__book">{episodeTitle(e)}</Marquee>
										<span className="vf-series__meta">{playing ? 'Playing now' : episodeLength(e, s)}</span>
									</span>
									<span className="vf-series__state">
										{s.finished && !playing && <><Icon name="check" size={26} /><span className="vf-series__done">Played</span></>}
										{(playing || !s.finished) && pct > 0 && <><span className="vf-bar vf-series__bar"><span className="vf-bar__fill" style={{width: pct + '%', display: 'block'}} /></span><span>{pct + '%'}</span></>}
										{!s.finished && !playing && pct === 0 && <span className="vf-faint">New</span>}
									</span>
								</Tile>
								<Button
									variant="icon"
									className={'vf-show__played' + (s.finished ? ' is-on' : '')}
									role="switch"
									aria-checked={s.finished}
									aria-label={s.finished ? 'Played. OK to mark unplayed' : 'Mark played'}
									data-focus-key={'played:' + e.id}
									aria-busy={busy === e.id}
									onFocus={() => setFocusRow(i)}
									onKeyDown={(ev) => {
										if (ev.keyCode !== Keys.RED) return;
										ev.preventDefault();
										togglePlayed(e, s.finished);
									}}
									onClick={() => togglePlayed(e, s.finished)}
								>
									<Icon name="check" size={30} />
								</Button>
							</li>
						);
					})}
				</ol>
			</div>
		</ScreenContainer>
	);
}
