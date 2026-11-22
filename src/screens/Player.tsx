import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';

import {Clock} from '../components/Clock';
import {Button, Cover, Icon, Tile} from '../components/controls';
import {focusWithin, PanelScope, pinScroll, ScreenContainer} from '../components/ScreenContainer';
import type {Bookmark, Chapter} from '../abs/types';
import {bookLabel} from '../app/series';
import type {NextUp} from '../app/upnext';
import type {SleepDefault} from '../app/settings';
import type {PlayerEngine, PlayerState, SleepState} from '../player/engine';
import {
	chapterIndexAt, clamp, formatClock, formatDuration, formatRate, RATE_PRESETS, seekStepForRepeat, stepRate
} from '../player/timeline';
import {isBackKey, Keys} from '../platform/webos';

interface PlayerProps {
	engine: PlayerEngine;
	player: PlayerState;
	autoplay: boolean;
	/** The next book in the series (or a podcast's next episode) when autoplay will play it, else null. */
	next: NextUp | null;
	nextCoverUrl: string;
	onToggleAutoplay: () => void;
	onPlayNext: () => void;
	onDeclineNext: () => void;
	onHome: () => void;
	onRetry: () => void;
	skipBack: number;
	skipForward: number;
	/** What the sleep panel offers first. */
	sleepDefault: SleepDefault;
	bookmarks: Bookmark[];
	onAddBookmark: () => void;
	onRemoveBookmark: (b: Bookmark) => void;
}

type Panel = 'none' | 'speed' | 'chapters' | 'bookmarks' | 'sleep';

const SLEEP_OPTIONS: SleepDefault[] = ['off', 'chapter', 15, 30, 45, 60];

export function sleepChipLabel (sleep: SleepState | null): string {
	if (!sleep) return 'Sleep';
	if (sleep.mode === 'chapter') return 'End of chapter';
	return formatDuration(Math.ceil(sleep.remainingMs / 60000) * 60);
}

interface SleepPanelProps {
	sleep: SleepState | null;
	preferred: SleepDefault;
	onPick: (c: SleepDefault) => void;
	/** Shown for books in a series and podcast episodes: whether the next one plays on its own. */
	autoplay: boolean | null;
	episode: boolean;
	onToggleAutoplay: () => void;
}

function SleepPanel ({sleep, preferred, onPick, autoplay, episode, onToggleAutoplay}: SleepPanelProps) {
	const active: SleepDefault | null = !sleep ? 'off' : sleep.mode === 'chapter' ? 'chapter' : null;
	const focusOn = active && active !== 'off' ? active : preferred;
	return (
		<>
			<div className="vf-scrim" />
			<PanelScope id="sleep-panel" className="vf-panel">
				<div className="vf-panel__head">
					<h2 className="vf-panel__title">Sleep timer</h2>
					<span className="vf-muted">Back to close</span>
				</div>
				{sleep && <p className="vf-panel__status">{sleep.mode === 'chapter' ? 'Pausing at the end of this chapter' : 'Pausing in ' + formatDuration(Math.ceil(sleep.remainingMs / 1000))}</p>}
				<div className="vf-sleep">
					{SLEEP_OPTIONS.map((o) => (
						<Button
							key={String(o)}
							className={'vf-sleep__option' + (o === active ? ' is-selected' : '')}
							data-default-focus={o === focusOn || undefined}
							onClick={() => onPick(o)}
						>
							{o === 'off' ? (sleep ? 'Turn off' : 'Off') : o === 'chapter' ? 'End of chapter' : o + ' minutes'}
						</Button>
					))}
				</div>
				<p className="vf-panel__note">Fades out at the end. Press any key at &ldquo;Still listening?&rdquo; to keep going.</p>
				{autoplay !== null && (
					<Button className={'vf-sleep__option vf-sleep__autoplay' + (autoplay ? ' is-selected' : '')} data-focus-key="autoplay" onClick={onToggleAutoplay}>
						<Icon name="autoplay" size={28} />{'Autoplay the next ' + (episode ? 'episode' : 'book') + (autoplay ? ': on' : ': off')}
					</Button>
				)}
			</PanelScope>
		</>
	);
}

/** Seconds left on the sleep timer, ticking evenly on its own clock towards the engine's deadline. */
export function useSleepSeconds (sleep: SleepState | null): number {
	const now = useNow(250);
	if (!sleep) return 0;
	if (sleep.endsAt && now) return Math.max(0, Math.ceil((sleep.endsAt - now) / 1000));
	return Math.max(0, Math.ceil(sleep.remainingMs / 1000));
}

export function StillListening ({sleep}: {sleep: SleepState}) {
	const seconds = useSleepSeconds(sleep);
	const more = sleep.mode === 'chapter' ? 'to the end of the next chapter' : 'for another ' + formatDuration(sleep.durationMs / 1000);
	return (
		<div className="vf-still" role="alertdialog" aria-label="Still listening?">
			<Icon name="moon" size={40} />
			<div>
				<div className="vf-still__title">Still listening?</div>
				<div className="vf-still__body">{'Pausing in ' + seconds + 's. Press any key to keep listening ' + more + '.'}</div>
			</div>
		</div>
	);
}

/** Show Up Next this many seconds (real time, at the current speed) before the end. */
const UP_NEXT_SECONDS = 15;
/** Chapter rows are 82 px with a 6 px gap; must match .vf-chapter. */
const CHAPTER_PITCH = 88;

interface NavPanelProps {
	chapters: Chapter[];
	current: number;
	bookmarks: Bookmark[];
	position: number;
	startTab: 'chapters' | 'bookmarks';
	onPick: (time: number) => void;
	onAddBookmark: () => void;
	onRemoveBookmark: (b: Bookmark) => void;
}

/** Chapters and bookmarks, one panel with two tabs (Red opens it on Chapters). */
function NavPanel ({chapters, current, bookmarks, position, startTab, onPick, onAddBookmark, onRemoveBookmark}: NavPanelProps) {
	const [tab, setTab] = useState<'chapters' | 'bookmarks'>(chapters.length ? startTab : 'bookmarks');
	const [focusRow, setFocusRow] = useState(Math.max(0, current));
	const [bmRow, setBmRow] = useState(0);

	// Right from a chapter shows Bookmarks; Left from a bookmark shows Chapters (no walking up to the tabs).
	const switchTo = (next: 'chapters' | 'bookmarks') => (ev: ReactKeyboardEvent<HTMLElement>) => {
		const key = next === 'bookmarks' ? Keys.RIGHT : Keys.LEFT;
		if (ev.keyCode !== key || (next === 'chapters' && !chapters.length)) return;
		ev.preventDefault();
		ev.stopPropagation();
		setTab(next);
	};

	// After a bookmark is removed (its row had focus), move to the next one, or to "Add".
	const lastRemovedAt = useRef<number | null>(null);
	const count = useRef(bookmarks.length);
	useEffect(() => {
		if (bookmarks.length < count.current && lastRemovedAt.current !== null) {
			const at = Math.min(lastRemovedAt.current, bookmarks.length - 1);
			focusWithin('nav-panel', at >= 0 ? 'bookmark:' + at : 'bookmark-add');
			lastRemovedAt.current = null;
		}
		count.current = bookmarks.length;
	}, [bookmarks.length]);

	// After a tab change, focus lands on that tab's first useful item.
	const firstTab = useRef(true);
	useEffect(() => {
		if (firstTab.current) {
			firstTab.current = false;
			return undefined;
		}
		const t = window.setTimeout(() => focusWithin('nav-panel', tab === 'chapters' ? 'chapter:' + Math.max(0, current) : 'bookmark-add'), 0);
		return () => window.clearTimeout(t);
	}, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
	return (
		<>
			<div className="vf-scrim" />
			<PanelScope id="nav-panel" className="vf-panel">
				<div className="vf-panel__head">
					<div className="vf-tabs" role="tablist">
						{chapters.length > 0 && (
							<Button variant="chip" role="tab" aria-selected={tab === 'chapters'} className={'vf-tab' + (tab === 'chapters' ? ' is-selected' : '')} onClick={() => setTab('chapters')} onFocus={() => setTab('chapters')}>
								{'Chapters · ' + chapters.length}
							</Button>
						)}
						<Button variant="chip" role="tab" aria-selected={tab === 'bookmarks'} className={'vf-tab' + (tab === 'bookmarks' ? ' is-selected' : '')} onClick={() => setTab('bookmarks')} onFocus={() => setTab('bookmarks')}>
							{'Bookmarks · ' + bookmarks.length}
						</Button>
					</div>
					<span className="vf-muted">Back to close</span>
				</div>
				{tab === 'chapters' ? (
					<div className="vf-chapters" onScroll={pinScroll}>
						<ol className="vf-chapters__list" style={{transform: 'translateY(' + -Math.max(0, focusRow - 4) * CHAPTER_PITCH + 'px)'}}>
							{chapters.map((c, i) => (
								<li key={c.id + ':' + i}>
									<Tile
										className={'vf-chapter' + (i === current ? ' is-current' : '') + (i < current ? ' is-played' : '')}
										data-default-focus={(startTab === 'chapters' && i === Math.max(0, current)) || undefined}
										data-focus-key={'chapter:' + i}
										onFocus={() => setFocusRow(i)}
										onKeyDown={switchTo('bookmarks')}
										onClick={() => onPick(c.start)}
									>
										<span className="vf-chapter__num">{i + 1}</span>
										<span className="vf-chapter__title">{c.title}</span>
										<span className="vf-chapter__meta">{i === current ? 'Playing' : formatClock(c.end - c.start)}</span>
									</Tile>
								</li>
							))}
						</ol>
					</div>
				) : (
					<div className="vf-chapters" onScroll={pinScroll}>
						<ol className="vf-chapters__list" style={{transform: 'translateY(' + -Math.max(0, bmRow - 4) * CHAPTER_PITCH + 'px)'}}>
							<li>
								<Button className="vf-bookmark-add" data-default-focus={startTab === 'bookmarks' || undefined} data-focus-key="bookmark-add" onFocus={() => setBmRow(0)} onKeyDown={switchTo('chapters')} onClick={onAddBookmark}>
									<Icon name="bookmark" size={26} />{'Add a bookmark at ' + formatClock(position)}
								</Button>
							</li>
							{bookmarks.map((b, i) => (
								<li key={b.time + ':' + b.createdAt} className="vf-bookmark">
									<Tile className="vf-chapter vf-bookmark__row" data-focus-key={'bookmark:' + i} onFocus={() => setBmRow(i + 1)} onKeyDown={switchTo('chapters')} onClick={() => onPick(b.time)} aria-label={b.title + ' at ' + formatClock(b.time)}>
										<span className="vf-chapter__title">{b.title.replace(/ · [\d:]+$/, '')}</span>
										<span className="vf-chapter__meta">{formatClock(b.time)}</span>
									</Tile>
									<Button variant="icon" className="vf-bookmark__remove" aria-label={'Remove bookmark ' + b.title} onFocus={() => setBmRow(i + 1)} onClick={() => {
										lastRemovedAt.current = i;
										onRemoveBookmark(b);
									}}
									>
										<Icon name="close" size={26} />
									</Button>
								</li>
							))}
							{!bookmarks.length && <li className="vf-panel__note vf-bookmark__empty">No bookmarks in this book yet.</li>}
						</ol>
					</div>
				)}
			</PanelScope>
		</>
	);
}

function UpNextCard ({next, coverUrl, seconds, onPlay, onDecline}: {next: NextUp; coverUrl: string; seconds: number; onPlay: () => void; onDecline: () => void}) {
	const label = next.episodeId ? next.date : next.sequence ? bookLabel(next.sequence) : '';
	return (
		<>
			<div className="vf-scrim vf-scrim--light" />
			<PanelScope id="up-next" className="vf-upnext">
				<Cover url={coverUrl} title={next.title} author={next.author} size={260} className="vf-upnext__cover" />
				<div className="vf-upnext__body">
					<div className="vf-eyebrow vf-eyebrow--brass">{'Up next' + (label ? ' · ' + label : '')}</div>
					<div className="vf-upnext__title">{next.title}</div>
					<div className="vf-upnext__meta">{'Starts in ' + seconds + 's · ' + (next.episodeId ? 'this episode will be marked played' : 'this book will be marked finished')}</div>
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
	const remainingNote = 'Your place stays in sync at any speed.';
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

export default function Player ({engine, player, autoplay, next, nextCoverUrl, onToggleAutoplay, onPlayNext, onDeclineNext, onHome, onRetry, skipBack, skipForward, sleepDefault, bookmarks, onAddBookmark, onRemoveBookmark}: PlayerProps) {
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
			else if (code === Keys.RED && (!player.episodeId || player.chapters.length > 0)) setPanel((o) => (o === 'chapters' || o === 'bookmarks' ? 'none' : 'chapters'));
			else if (code === Keys.BLUE && !player.episodeId) onAddBookmark();
			else if (code === Keys.YELLOW) setPanel((o) => (o === 'sleep' ? 'none' : 'sleep'));
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
	}, [engine, panel, preview, showUpNext, player.chapters.length, player.episodeId, onDeclineNext, onAddBookmark]);

	// When a panel closes, put focus back on the button that opened it.
	const wasOpen = useRef<Panel>('none');
	useEffect(() => {
		if (wasOpen.current !== 'none' && panel === 'none') focusWithin('player', wasOpen.current === 'bookmarks' ? 'chapters' : wasOpen.current);
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
	/** Something can follow this item: a series book or a podcast episode. */
	const hasNext = Boolean(p.series || p.episodeId);

	return (
		<ScreenContainer key="player" id="player" className={'vf-player' + (panel !== 'none' ? ' has-panel' : '')}>
			<div className="vf-player__top">
				<span className="vf-hint"><Icon name="chevronDown" size={24} />Back to browsing</span>
				<Clock className="vf-player__time" />
				<span className="vf-player__status">
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
					<span>{Math.floor(percent) + (p.episodeId ? '% of episode' : '% of book')}</span>
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
					<div className="vf-transport__side vf-transport__side--start">
						<Button variant="chip" className={p.sleep ? 'is-active' : ''} data-focus-key="sleep" onClick={() => setPanel('sleep')}>
							<span className="vf-dot vf-dot--yellow" />{sleepChipLabel(p.sleep)}
						</Button>
						{hasNext && (
							<Button
								variant="chip"
								className={'vf-autoplay' + (autoplay ? ' is-active' : '')}
								role="switch"
								aria-checked={autoplay}
								aria-label={'Autoplay the next ' + (p.episodeId ? 'episode' : 'book') + ': ' + (autoplay ? 'on' : 'off')}
								data-focus-key="autoplay"
								onClick={onToggleAutoplay}
							>
								<Icon name="autoplay" size={24} />{autoplay ? 'Autoplay on' : 'Autoplay off'}
							</Button>
						)}
					</div>
					<div className="vf-transport__main">
						<Button variant="icon" className="vf-round" aria-label="Previous chapter" disabled={!p.chapters.length} onClick={() => engine.previousChapter()}><Icon name="prevChapter" size={34} /></Button>
						<Button variant="icon" className="vf-round" aria-label={'Back ' + skipBack + ' seconds'} onClick={() => engine.skip(-skipBack)}><Icon name="back30" size={46} /><span className="vf-round__num">{skipBack}</span></Button>
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
						<Button variant="icon" className="vf-round" aria-label={'Forward ' + skipForward + ' seconds'} onClick={() => engine.skip(skipForward)}><Icon name="fwd30" size={46} /><span className="vf-round__num">{skipForward}</span></Button>
						<Button variant="icon" className="vf-round" aria-label="Next chapter" disabled={!p.chapters.length} onClick={() => engine.nextChapter()}><Icon name="nextChapter" size={34} /></Button>
					</div>
					<div className="vf-transport__side vf-transport__side--end">
						<Button variant="chip" data-focus-key="speed" onClick={() => setPanel('speed')}>
							<span className="vf-dot vf-dot--green" />{formatRate(p.rate)}
						</Button>
						{/* Bookmarks belong to a whole item on the server, so podcast episodes don't get them. */}
						{!p.episodeId && (
							<Button variant="icon" className="vf-round vf-round--small" aria-label="Add a bookmark here" data-focus-key="bookmark" onClick={onAddBookmark}>
								<Icon name="bookmark" size={28} /><span className="vf-dot vf-dot--blue vf-round__dot" />
							</Button>
						)}
						{(!p.episodeId || p.chapters.length > 0) && (
							<Button variant="chip" data-focus-key="chapters" onClick={() => setPanel(p.chapters.length ? 'chapters' : 'bookmarks')}>
								<span className="vf-dot vf-dot--red" />{p.chapters.length ? 'Chapters' : 'Bookmarks'}
							</Button>
						)}
					</div>
				</div>
			</div>

			{speedOpen && <SpeedPanel rate={p.rate} onRate={(r) => engine.setRate(r)} />}
			{panel === 'sleep' && (
				<SleepPanel
					sleep={p.sleep}
					preferred={sleepDefault}
					onPick={(c) => {
						engine.setSleep(c);
						setPanel('none');
					}}
					autoplay={hasNext ? autoplay : null}
					episode={Boolean(p.episodeId)}
					onToggleAutoplay={onToggleAutoplay}
				/>
			)}
			{p.sleep && p.sleep.prompt && panel === 'none' && <StillListening sleep={p.sleep} />}
			{(panel === 'chapters' || panel === 'bookmarks') && (
				<NavPanel
					chapters={p.chapters}
					current={p.chapterIndex}
					bookmarks={bookmarks}
					position={p.position}
					startTab={panel === 'bookmarks' ? 'bookmarks' : 'chapters'}
					onPick={(t) => {
						engine.seek(t);
						setPanel('none');
					}}
					onAddBookmark={onAddBookmark}
					onRemoveBookmark={onRemoveBookmark}
				/>
			)}
			{showUpNext && next && (
				<UpNextCard next={next} coverUrl={nextCoverUrl} seconds={Math.ceil(remainingReal)} onPlay={onPlayNext} onDecline={onDeclineNext} />
			)}
		</ScreenContainer>
	);
}
