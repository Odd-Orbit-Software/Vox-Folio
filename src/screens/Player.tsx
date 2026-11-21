import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';

import {Clock} from '../components/Clock';
import {Button, Cover, Icon, Tile} from '../components/controls';
import {focusWithin, PanelScope, pinScroll, ScreenContainer} from '../components/ScreenContainer';
import type {Chapter} from '../abs/types';
import {bookLabel} from '../app/series';
import type {SeriesEntry} from '../app/series';
import type {PlayerEngine, PlayerState} from '../player/engine';
import {
	chapterIndexAt, clamp, formatClock, formatDuration, formatRate, RATE_PRESETS, seekStepForRepeat, stepRate
} from '../player/timeline';
import {isBackKey, Keys} from '../platform/webos';

interface PlayerProps {
	engine: PlayerEngine;
	player: PlayerState;
	autoplay: boolean;
	/** The next book in the series when autoplay will play it, else null. */
	next: SeriesEntry | null;
	nextCoverUrl: string;
	onToggleAutoplay: () => void;
	onPlayNext: () => void;
	onDeclineNext: () => void;
	onHome: () => void;
	onRetry: () => void;
}

type Panel = 'none' | 'speed' | 'chapters';

/** Show Up Next this many seconds (real time, at the current speed) before the end. */
const UP_NEXT_SECONDS = 15;
/** Chapter rows are 82 px with a 6 px gap; must match .vf-chapter. */
const CHAPTER_PITCH = 88;

function ChaptersPanel ({chapters, current, onPick}: {chapters: Chapter[]; current: number; onPick: (c: Chapter) => void}) {
	const [focusRow, setFocusRow] = useState(Math.max(0, current));
	return (
		<>
			<div className="vf-scrim" />
			<PanelScope id="chapters-panel" className="vf-panel">
				<div className="vf-panel__head">
					<h2 className="vf-panel__title">Chapters</h2>
					<span className="vf-muted">{chapters.length + ' · Back to close'}</span>
				</div>
				<div className="vf-chapters" onScroll={pinScroll}>
					<ol className="vf-chapters__list" style={{transform: 'translateY(' + -Math.max(0, focusRow - 4) * CHAPTER_PITCH + 'px)'}}>
						{chapters.map((c, i) => (
							<li key={c.id + ':' + i}>
								<Tile
									className={'vf-chapter' + (i === current ? ' is-current' : '') + (i < current ? ' is-played' : '')}
									data-default-focus={i === Math.max(0, current) || undefined}
									onFocus={() => setFocusRow(i)}
									onClick={() => onPick(c)}
								>
									<span className="vf-chapter__num">{i + 1}</span>
									<span className="vf-chapter__title">{c.title}</span>
									<span className="vf-chapter__meta">{i === current ? 'Playing' : formatClock(c.end - c.start)}</span>
								</Tile>
							</li>
						))}
					</ol>
				</div>
			</PanelScope>
		</>
	);
}

function UpNextCard ({next, coverUrl, seconds, onPlay, onDecline}: {next: SeriesEntry; coverUrl: string; seconds: number; onPlay: () => void; onDecline: () => void}) {
	const md = next.item.media.metadata;
	return (
		<>
			<div className="vf-scrim vf-scrim--light" />
			<PanelScope id="up-next" className="vf-upnext">
				<Cover url={coverUrl} title={md.title} author={md.authorName} size={260} className="vf-upnext__cover" />
				<div className="vf-upnext__body">
					<div className="vf-eyebrow vf-eyebrow--brass">{'Up next' + (next.sequence ? ' · ' + bookLabel(next.sequence) : '')}</div>
					<div className="vf-upnext__title">{md.title}</div>
					<div className="vf-upnext__meta">{'Starts in ' + seconds + 's · this book will be marked finished'}</div>
					<div className="vf-bar vf-upnext__bar"><div className="vf-bar__fill vf-upnext__fill" style={{width: Math.max(0, 100 - seconds / UP_NEXT_SECONDS * 100) + '%'}} /></div>
					<div className="vf-row vf-row--spaced">
						<Button variant="primary" data-default-focus onClick={onPlay}>Play now</Button>
						<Button onClick={onDecline}>Not now</Button>
					</div>
				</div>
			</PanelScope>
		</>
	);
}

function syncLabel (p: PlayerState, now: number): string {
	if (p.sync === 'offline') return 'Offline · ' + formatDuration(p.unsyncedSeconds) + ' not synced';
	if (p.sync === 'pending') return 'Sync pending';
	if (!p.lastSyncedAt) return '';
	if (!now) return 'Synced';
	const ago = Math.max(0, Math.round((now - p.lastSyncedAt) / 1000));
	return ago < 60 ? 'Synced ' + ago + 's ago' : 'Synced ' + Math.round(ago / 60) + 'm ago';
}

/** Wall-clock time refreshed every `ms`; 0 until the first tick (reading the clock during render isn't pure). */
function useNow (ms: number): number {
	const [now, setNow] = useState(0);
	useEffect(() => {
		const t = window.setInterval(() => setNow(Date.now()), ms);
		return () => window.clearInterval(t);
	}, [ms]);
	return now;
}

function SpeedPanel ({rate, onRate}: {rate: number; onRate: (r: number) => void}) {
	const remainingNote = 'Your place is saved in book time, so it lines up with your phone at any speed.';
	return (
		<>
			<div className="vf-scrim" />
			<PanelScope id="speed-panel" className="vf-panel">
				<div className="vf-panel__head">
					<h2 className="vf-panel__title">Playback speed</h2>
					<span className="vf-muted">Back to close</span>
				</div>
				<div className="vf-speed">
					<Button variant="icon" className="vf-speed__step" aria-label="Slower" onClick={() => onRate(stepRate(rate, -1))}>−</Button>
					<div className="vf-speed__value">
						<div className="vf-speed__rate">{formatRate(rate)}</div>
						<div className="vf-muted">0.05× steps</div>
					</div>
					<Button variant="icon" className="vf-speed__step" aria-label="Faster" data-default-focus onClick={() => onRate(stepRate(rate, 1))}>+</Button>
				</div>
				<div className="vf-eyebrow vf-panel__section">Presets</div>
				<div className="vf-presets">
					{RATE_PRESETS.map((r) => (
						<Button key={r} className={'vf-preset' + (Math.abs(r - rate) < 0.001 ? ' is-selected' : '')} onClick={() => onRate(r)}>
							{formatRate(r)}
						</Button>
					))}
				</div>
				<p className="vf-panel__note">{remainingNote}</p>
			</PanelScope>
		</>
	);
}

export default function Player ({engine, player, autoplay, next, nextCoverUrl, onToggleAutoplay, onPlayNext, onDeclineNext, onHome, onRetry}: PlayerProps) {
	const [panel, setPanel] = useState<Panel>('none');
	const speedOpen = panel === 'speed';
	const remainingReal = player.duration ? Math.max(0, player.duration - player.position) / (player.rate || 1) : Infinity;
	const showUpNext = Boolean(next) && player.status === 'playing' && remainingReal <= UP_NEXT_SECONDS && panel === 'none';
	const [preview, setPreview] = useState<number | null>(null);
	const repeat = useRef({dir: 0, count: 0, at: 0});
	const now = useNow(5000);

	// Remote keys that belong to the player. Capture phase, so we run before the app's Back handler.
	useEffect(() => {
		const onKeyDown = (ev: KeyboardEvent) => {
			const code = ev.keyCode;
			let handled = true;
			if (isBackKey(code) && panel !== 'none') setPanel('none');
			else if (isBackKey(code) && showUpNext) onDeclineNext();
			else if (isBackKey(code) && preview !== null) setPreview(null);
			else if (code === Keys.GREEN) setPanel((o) => (o === 'speed' ? 'none' : 'speed'));
			else if (code === Keys.RED && player.chapters.length) setPanel((o) => (o === 'chapters' ? 'none' : 'chapters'));
			else if (code === Keys.BLUE) onToggleAutoplay();
			else if (code === Keys.CH_UP && panel === 'none') engine.nextChapter();
			else if (code === Keys.CH_DOWN && panel === 'none') engine.previousChapter();
			else handled = false;
			if (handled) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [engine, panel, preview, showUpNext, player.chapters.length, onDeclineNext, onToggleAutoplay]);

	// When a panel closes, put focus back on the button that opened it.
	const wasOpen = useRef<Panel>('none');
	useEffect(() => {
		if (wasOpen.current !== 'none' && panel === 'none') focusWithin('player', wasOpen.current);
		wasOpen.current = panel;
	}, [panel]);

	// When Up Next goes away (declined, or the next book started), return focus to the controls.
	const upNextWas = useRef(false);
	useEffect(() => {
		if (upNextWas.current && !showUpNext) focusWithin('player', 'play');
		upNextWas.current = showUpNext;
	}, [showUpNext]);

	const ticks = useMemo(() => {
		if (!player.duration) return [];
		return player.chapters.slice(1).map((c) => (c.start / player.duration) * 100);
	}, [player.chapters, player.duration]);

	// Scrubber: Left/Right move a preview (accelerating while held), OK seeks, Back cancels.
	const onScrubKey = (ev: ReactKeyboardEvent<HTMLDivElement>) => {
		const code = ev.keyCode;
		if (code === Keys.LEFT || code === Keys.RIGHT) {
			ev.preventDefault();
			ev.stopPropagation();
			const dir = code === Keys.RIGHT ? 1 : -1;
			const t = Date.now();
			const r = repeat.current;
			r.count = r.dir === dir && t - r.at < 350 ? r.count + 1 : 0;
			r.dir = dir;
			r.at = t;
			const from = preview === null ? player.position : preview;
			setPreview(clamp(from + dir * seekStepForRepeat(r.count), 0, player.duration));
		} else if (code === Keys.ENTER && preview !== null) {
			ev.preventDefault();
			ev.stopPropagation();
			engine.seek(preview);
			setPreview(null);
		}
	};

	const p = player;
	const percent = p.duration ? (p.position / p.duration) * 100 : 0;
	const chapter = p.chapterIndex >= 0 ? p.chapters[p.chapterIndex] : null;
	const chapterStart = chapter && p.duration ? (chapter.start / p.duration) * 100 : 0;
	const chapterWidth = chapter && p.duration ? ((chapter.end - chapter.start) / p.duration) * 100 : 0;
	const left = Math.max(0, p.duration - p.position);
	const previewChapter = preview !== null ? p.chapters[chapterIndexAt(p.chapters, preview)] : null;

	if (p.status === 'error' && p.error) {
		const connection = p.error.kind === 'network' || p.error.kind === 'timeout' || p.error.kind === 'server';
		return (
			<ScreenContainer key="error" id="player-error" className="vf-error">
				<Icon name="alert" size={72} />
				<h1 className="vf-message__title">{connection ? "Can't reach your server" : "We couldn't open that book"}</h1>
				<p className="vf-message__body">
					{connection ? p.error.message : "It isn't in your library on this server. It may have been removed, or it belongs to a different account."}
				</p>
				<div className="vf-row vf-row--spaced">
					{connection && <Button variant="primary" data-default-focus onClick={onRetry}>Retry</Button>}
					<Button variant={connection ? 'secondary' : 'primary'} data-default-focus={connection ? undefined : true} onClick={onHome}>Go to Home</Button>
				</div>
			</ScreenContainer>
		);
	}

	const loading = p.status === 'loading' && !p.title;

	return (
		<ScreenContainer key="player" id="player" className={'vf-player' + (panel !== 'none' ? ' has-panel' : '')}>
			<div className="vf-player__top">
				<span className="vf-hint"><Icon name="chevronDown" size={24} />Back to browsing</span>
				<Clock className="vf-player__time" />
				<span className="vf-player__status">
					{p.series && (
						<span className={'vf-hint vf-player__autoplay' + (autoplay ? ' is-on' : '')}>
							<Icon name="autoplay" size={24} />{autoplay ? 'Autoplay on' : 'Autoplay off'}
						</span>
					)}
					<span className="vf-hint">
						{p.sync === 'synced' ? <Icon name="cloud" size={24} /> : <Icon name="cloudOff" size={24} />}
						{syncLabel(p, now)}
					</span>
				</span>
			</div>

			<Cover url={p.coverUrl} title={p.title || ' '} author={p.author} size={560} className="vf-player__cover" />

			<div className="vf-player__info">
				{p.seriesLine && <div className="vf-player__series">{p.seriesLine}</div>}
				<h1 className="vf-player__title">{loading ? 'Opening…' : p.title}</h1>
				<div className="vf-player__byline">{p.author}{p.narrator ? ' · read by ' + p.narrator : ''}</div>
				{chapter && (
					<>
						<div className="vf-eyebrow vf-player__chapter-label">{'Chapter ' + (p.chapterIndex + 1) + ' of ' + p.chapters.length}</div>
						<div className="vf-player__chapter">{chapter.title}</div>
					</>
				)}
				<div className="vf-player__clock">
					<span className="vf-player__position">{formatClock(p.position)}</span>
					<span className="vf-player__of">{'of ' + formatClock(p.duration)}</span>
				</div>
				<div className="vf-player__left">
					{p.status === 'ended' ? 'Finished' : formatDuration(left) + ' left' + (p.rate !== 1 ? ' · ' + formatDuration(left / p.rate) + ' at ' + formatRate(p.rate) : '')}
				</div>
			</div>

			<div className="vf-player__controls">
				<div className="vf-player__scrub-meta">
					<span>
						{preview !== null
							? 'Go to ' + formatClock(preview) + (previewChapter ? ' · ' + previewChapter.title : '') + ' · OK to jump, Back to cancel'
							: chapter
								? 'Chapter ' + (p.chapterIndex + 1) + ' · ' + formatClock(p.position - chapter.start) + ' / ' + formatClock(chapter.end - chapter.start)
								: ''}
					</span>
					<span>{Math.floor(percent) + '% of book'}</span>
				</div>
				<Tile
					className="vf-scrub"
					data-focus-key="scrub"
					aria-label={'Position ' + formatClock(p.position) + ' of ' + formatClock(p.duration)}
					onKeyDown={onScrubKey}
					onBlur={() => setPreview(null)}
				>
					<div className="vf-scrub__track">
						{chapter && <div className="vf-scrub__chapter" style={{left: chapterStart + '%', width: chapterWidth + '%'}} />}
						<div className="vf-scrub__fill" style={{width: percent + '%'}} />
						{ticks.map((t, i) => <div key={i} className="vf-scrub__tick" style={{left: t + '%'}} />)}
						<div className="vf-scrub__knob" style={{left: percent + '%'}} />
						{preview !== null && <div className="vf-scrub__preview" style={{left: (preview / (p.duration || 1)) * 100 + '%'}} />}
					</div>
				</Tile>

				<div className="vf-transport">
					<div className="vf-transport__side vf-muted">◀◀ ▶▶ 30s · CH ▲▼ chapter</div>
					<div className="vf-transport__main">
						<Button variant="icon" className="vf-round" aria-label="Previous chapter" disabled={!p.chapters.length} onClick={() => engine.previousChapter()}><Icon name="prevChapter" size={34} /></Button>
						<Button variant="icon" className="vf-round" aria-label="Back 30 seconds" onClick={() => engine.skip(-30)}><Icon name="back30" size={46} /><span className="vf-round__num">30</span></Button>
						<Button
							variant="primary"
							className="vf-round vf-round--play"
							aria-label={p.status === 'playing' ? 'Pause' : 'Play'}
							data-default-focus
							data-focus-key="play"
							onClick={() => engine.toggle()}
						>
							<Icon name={p.status === 'playing' || p.status === 'loading' ? 'pause' : 'play'} size={48} />
						</Button>
						<Button variant="icon" className="vf-round" aria-label="Forward 30 seconds" onClick={() => engine.skip(30)}><Icon name="fwd30" size={46} /><span className="vf-round__num">30</span></Button>
						<Button variant="icon" className="vf-round" aria-label="Next chapter" disabled={!p.chapters.length} onClick={() => engine.nextChapter()}><Icon name="nextChapter" size={34} /></Button>
					</div>
					<div className="vf-transport__side vf-transport__side--end">
						<Button variant="chip" data-focus-key="speed" onClick={() => setPanel('speed')}>
							<span className="vf-dot vf-dot--green" />{formatRate(p.rate)}
						</Button>
						{p.chapters.length > 0 && (
							<Button variant="chip" data-focus-key="chapters" onClick={() => setPanel('chapters')}>
								<span className="vf-dot vf-dot--red" />Chapters
							</Button>
						)}
					</div>
				</div>
			</div>

			{speedOpen && <SpeedPanel rate={p.rate} onRate={(r) => engine.setRate(r)} />}
			{panel === 'chapters' && (
				<ChaptersPanel
					chapters={p.chapters}
					current={p.chapterIndex}
					onPick={(c) => {
						engine.seek(c.start);
						setPanel('none');
					}}
				/>
			)}
			{showUpNext && next && (
				<UpNextCard next={next} coverUrl={nextCoverUrl} seconds={Math.ceil(remainingReal)} onPlay={onPlayNext} onDecline={onDeclineNext} />
			)}
		</ScreenContainer>
	);
}
