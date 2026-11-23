import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {LibraryItem, MediaProgress, SeriesRef} from '../abs/types';
import {bookLabel, nextInSeries} from '../app/series';
import type {SeriesEntry} from '../app/series';
import {Button, Cover, Icon, Tile} from '../components/controls';
import {ErrorPanel} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';
import type {PlayerState} from '../player/engine';
import {formatClock, formatDuration} from '../player/timeline';

interface DetailsProps {
	client: AbsClient;
	itemId: string;
	player: PlayerState;
	autoplay: boolean;
	restoreKey: string | null;
	onToggleAutoplay: () => void;
	onPlay: (itemId: string, startAt?: number) => void;
	onShowPlayer: () => void;
	onOpenSeries: (libraryId: string, series: SeriesRef, fromKey: string) => void;
	onOpenAuthor: (authorId: string, name: string, fromKey: string) => void;
	onOpenTitle: (itemId: string, fromKey: string) => void;
}

interface Data {
	item: LibraryItem;
	progress: MediaProgress | null;
	series: SeriesRef | null;
	next: SeriesEntry | null;
}

type Load = {state: 'loading'} | {state: 'error'; error: AbsError} | {state: 'ready'; data: Data};

function firstSeries (item: LibraryItem): SeriesRef | null {
	const s = (item.media.metadata as {series?: SeriesRef[] | SeriesRef}).series;
	if (Array.isArray(s)) return s[0] || null;
	return s || null;
}

export default function Details ({client, itemId, player, autoplay, restoreKey, onToggleAutoplay, onPlay, onShowPlayer, onOpenSeries, onOpenAuthor, onOpenTitle}: DetailsProps) {
	const [load, setLoad] = useState<Load>({state: 'loading'});
	const [reload, setReload] = useState(0);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.getItem(itemId), client.getProgress(itemId)]).then(async ([item, progress]) => {
			const series = firstSeries(item);
			let next: SeriesEntry | null = null;
			if (series) {
				try {
					next = nextInSeries(await client.seriesBooks(item.libraryId, series.id), item.id, series.id, series.name);
				} catch {
					next = null; // The title still shows; only the series card is missing.
				}
			}
			if (!cancelled) setLoad({state: 'ready', data: {item, progress, series, next}});
		}).catch((e: unknown) => {
			if (!cancelled) setLoad({state: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		});
		return () => {
			cancelled = true;
		};
	}, [client, itemId, reload]);

	if (load.state === 'error') {
		return (
			<ScreenContainer key="error" id="details-error" className="vf-error">
				<ErrorPanel error={load.error} onRetry={() => {
					setLoad({state: 'loading'});
					setReload((n) => n + 1);
				}}
				/>
			</ScreenContainer>
		);
	}

	const data = load.state === 'ready' ? load.data : null;
	const item = data ? data.item : null;
	const md = item ? item.media.metadata : null;
	const progress = data ? data.progress : null;
	const duration = item ? item.media.duration || 0 : 0;
	const finished = Boolean(progress && progress.isFinished);
	const position = progress && !finished ? progress.currentTime : 0;
	const started = position > 0;
	const isCurrent = player.itemId === itemId && player.status !== 'error';
	// Floored, as the player shows it, so the two never disagree.
	const percent = isCurrent && player.duration ? Math.floor(player.position / player.duration * 100) : progress ? Math.floor(progress.progress * 100) : 0;
	const chapters = item ? item.media.numChapters : 0;
	const description = md ? ((md as {descriptionPlain?: string}).descriptionPlain || md.description || '') : '';

	const toggleFinished = () => {
		if (!item || busy) return;
		setBusy(true);
		client.setFinished(item.id, !finished).then(() => client.getProgress(item.id)).then((p) => {
			setBusy(false);
			setLoad((l) => (l.state === 'ready' ? {state: 'ready', data: {...l.data, progress: p}} : l));
		}, () => setBusy(false));
	};

	return (
		<ScreenContainer key="details" id="details" className="vf-details" restoreKey={restoreKey} focusDeps={[load.state]}>
			<div className="vf-hint vf-details__back"><Icon name="back" size={24} />Back</div>
			<Cover url={item && item.media.coverPath ? client.coverUrl(item.id, 680) : ''} title={md ? md.title : ''} author={md ? md.authorName : ''} size={560} className="vf-details__cover" />

			{md && item && (
				<div className="vf-details__info">
					<div className="vf-details__links">
						{data && data.series && (
							<Button
								variant="chip"
								className="vf-details__series"
								data-focus-key="series"
								onClick={() => onOpenSeries(item.libraryId, data.series!, 'series')}
							>
								<Icon name="series" size={22} />
								<span>{data.series.name + (data.series.sequence ? ' · ' + bookLabel(data.series.sequence) : '')}</span>
							</Button>
						)}
						{(md.authors || []).map((a) => (
							<Button
								key={a.id}
								variant="chip"
								className="vf-details__series"
								data-focus-key={'author:' + a.id}
								onClick={() => onOpenAuthor(a.id, a.name, 'author:' + a.id)}
							>
								<Icon name="authors" size={22} />
								<span>{a.name}</span>
							</Button>
						))}
					</div>
					<h1 className="vf-details__title">{md.title}</h1>
					<div className="vf-details__byline">{md.authorName}{md.narratorName ? ' · read by ' + md.narratorName : ''}</div>
					<div className="vf-details__meta">
						{[formatDuration(duration), chapters ? chapters + ' chapters' : '', (md.genres || []).filter((g) => !/^audio ?books?$/i.test(g))[0] || '', md.publishedYear || ''].filter(Boolean).join(' · ')}
					</div>
					{(started || finished || isCurrent) && (
						<div className="vf-progress-line">
							<div className="vf-bar vf-bar--details"><div className="vf-bar__fill" style={{width: (finished ? 100 : percent) + '%'}} /></div>
							<span>{finished ? 'Finished' : percent + '% · ' + formatDuration(Math.max(0, duration - (isCurrent ? player.position : position))) + ' left'}</span>
						</div>
					)}
					<div className="vf-row vf-row--spaced vf-details__actions">
						{isCurrent ? (
							<Button variant="primary" data-default-focus data-focus-key="play" onClick={onShowPlayer}>
								<Icon name="play" size={28} />Back to player
							</Button>
						) : (
							<Button variant="primary" data-default-focus data-focus-key="play" onClick={() => onPlay(item.id)}>
								<Icon name="play" size={28} />{started ? 'Resume at ' + formatClock(position) : finished ? 'Listen again' : 'Play'}
							</Button>
						)}
						{(started || finished) && !isCurrent && <Button data-focus-key="restart" onClick={() => onPlay(item.id, 0)}>Start over</Button>}
						<Button data-focus-key="finished" onClick={toggleFinished} disabled={busy}>{finished ? 'Mark unfinished' : 'Mark finished'}</Button>
					</div>
					{description && <p className="vf-details__desc">{description}</p>}
				</div>
			)}

			{data && data.series && (
				<div className="vf-details__bottom">
					<div className="vf-details__autoplay">
						<div className="vf-eyebrow">Series autoplay</div>
						<Button
							variant="chip"
							className={'vf-switch' + (autoplay ? ' is-on' : '')}
							role="switch"
							aria-checked={autoplay}
							data-focus-key="autoplay"
							onClick={onToggleAutoplay}
						>
							<span className="vf-switch__text">Play the next book when this ends</span>
							<span className="vf-switch__track"><span className="vf-switch__knob" /></span>
						</Button>
					</div>
					{data.next ? (
						<Tile className="vf-next" data-focus-key="next" onClick={() => onOpenTitle(data.next!.item.id, 'next')} aria-label={'Next in series: ' + data.next.item.media.metadata.title}>
							<Cover url={data.next.item.media.coverPath ? client.coverUrl(data.next.item.id, 360) : ''} title={data.next.item.media.metadata.title} size={180} />
							<span className="vf-next__body">
								<span className="vf-eyebrow vf-eyebrow--brass">{'Next in series' + (data.next.sequence ? ' · ' + bookLabel(data.next.sequence) : '')}</span>
								<span className="vf-next__title">{data.next.item.media.metadata.title}</span>
								<span className="vf-next__meta">{formatDuration(data.next.item.media.duration || 0)}</span>
							</span>
						</Tile>
					) : (
						<div className="vf-next vf-next--end">
							<span className="vf-next__body">
								<span className="vf-eyebrow">Series</span>
								<span className="vf-next__title">This is the last book in {data.series.name}</span>
							</span>
						</div>
					)}
				</div>
			)}
		</ScreenContainer>
	);
}
