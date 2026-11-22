import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {MediaProgress} from '../abs/types';
import {orderSeries} from '../app/series';
import type {SeriesEntry} from '../app/series';
import {Cover, Icon, Tile} from '../components/controls';
import {ErrorPanel} from '../components/ErrorPanel';
import {pinScroll, ScreenContainer} from '../components/ScreenContainer';
import {formatDuration} from '../player/timeline';

interface SeriesDetailProps {
	client: AbsClient;
	libraryId: string;
	seriesId: string;
	seriesName: string;
	/** Focus this book first (arriving from its title screen). */
	focusItemId?: string;
	restoreKey: string | null;
	onOpenTitle: (itemId: string, fromKey: string) => void;
}

type Load = {state: 'loading'} | {state: 'error'; error: AbsError} | {state: 'ready'; entries: SeriesEntry[]; progress: Record<string, MediaProgress>};

/** Rows are 140 px with a 12 px gap; must match .vf-series__row. */
const ROW_PITCH = 152;

export default function SeriesDetail ({client, libraryId, seriesId, seriesName, focusItemId, restoreKey, onOpenTitle}: SeriesDetailProps) {
	const [load, setLoad] = useState<Load>({state: 'loading'});
	const [reload, setReload] = useState(0);
	const [focusRow, setFocusRow] = useState(0);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.seriesBooks(libraryId, seriesId), client.progressByItem()]).then(([books, progress]) => {
			if (!cancelled) setLoad({state: 'ready', entries: orderSeries(books, seriesId, seriesName), progress});
		}, (e: unknown) => {
			if (!cancelled) setLoad({state: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		});
		return () => {
			cancelled = true;
		};
	}, [client, libraryId, seriesId, seriesName, reload]);

	const entries = load.state === 'ready' ? load.entries : [];
	const progress = load.state === 'ready' ? load.progress : {};
	const finished = entries.filter((e) => progress[e.item.id] && progress[e.item.id].isFinished).length;
	const started = entries.filter((e) => progress[e.item.id] && !progress[e.item.id].isFinished && progress[e.item.id].progress > 0).length;
	const author = entries.length ? entries[0].item.media.metadata.authorName : '';
	const restore = restoreKey || (focusItemId ? 'book:' + focusItemId : null);

	return (
		<ScreenContainer id="series-detail" className="vf-series" restoreKey={restore} focusDeps={[load.state]}>
			<div className="vf-hint vf-series__back"><Icon name="back" size={24} />Back</div>
			<header className="vf-series__head">
				<div>
					<div className="vf-eyebrow">Series</div>
					<h1 className="vf-series__title">{seriesName}</h1>
				</div>
				{load.state === 'ready' && (
					<div className="vf-series__summary">
						{(author ? author + ' · ' : '') + entries.length + (entries.length === 1 ? ' book' : ' books')}
						<br />
						{finished + ' finished · ' + started + ' in progress'}
					</div>
				)}
			</header>

			{load.state === 'error' && (
				<ErrorPanel error={load.error} onRetry={() => {
					setLoad({state: 'loading'});
					setReload((n) => n + 1);
				}}
				/>
			)}

			<div className="vf-series__viewport" onScroll={pinScroll}>
				<ol className="vf-series__list" style={{transform: 'translateY(' + -Math.max(0, focusRow - 2) * ROW_PITCH + 'px)'}}>
					{entries.map((e, i) => {
						const p = progress[e.item.id];
						const done = Boolean(p && p.isFinished);
						const pct = p && !done ? Math.round(p.progress * 100) : 0;
						const md = e.item.media.metadata;
						const chapters = e.item.media.numChapters;
						return (
							<li key={e.item.id}>
								<Tile
									className="vf-series__row"
									data-focus-key={'book:' + e.item.id}
									data-default-focus={i === 0 || undefined}
									aria-label={(e.sequence ? 'Book ' + e.sequence + ', ' : '') + md.title}
									onFocus={() => setFocusRow(i)}
									onClick={() => onOpenTitle(e.item.id, 'book:' + e.item.id)}
								>
									<span className="vf-series__seq">{e.sequence || '·'}</span>
									<Cover url={e.item.media.coverPath ? client.coverUrl(e.item.id, 240) : ''} title={md.title} size={108} />
									<span className="vf-series__info">
										<span className="vf-series__book">{md.title}</span>
										<span className="vf-series__meta">
											{formatDuration(e.item.media.duration || 0)}
											{chapters ? ' · ' + chapters + ' chapters' : ''}
										</span>
									</span>
									<span className="vf-series__state">
										{done && <><Icon name="check" size={26} /><span className="vf-series__done">Finished</span></>}
										{!done && pct > 0 && <><span className="vf-bar vf-series__bar"><span className="vf-bar__fill" style={{width: pct + '%', display: 'block'}} /></span><span>{pct + '%'}</span></>}
										{!done && pct === 0 && <span className="vf-faint">Not started</span>}
									</span>
								</Tile>
							</li>
						);
					})}
				</ol>
			</div>
		</ScreenContainer>
	);
}
