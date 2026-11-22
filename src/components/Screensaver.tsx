import mark from '../assets/vox-folio-mark.svg';
import type {PlayerState} from '../player/engine';
import {formatDuration} from '../player/timeline';
import {isPremium} from '../app/premium';
import {useSettings} from '../app/settings';
import {cornerAt, countPerfectCorner, DRIFT, driftAt} from '../app/corners';
import type {Corner} from '../app/corners';
import {useEffect, useRef, useState} from 'react';
import {Clock, useHour} from './Clock';
import {Cover} from './controls';

/** The listening screensaver (design canvas board 10): the time and the current book drift slowly around
    a near-black screen, the percentage updating as the narration continues. Without a book, the time
    and the wordmark drift. */
/** Where the card's corner meets the screen for each corner (the card is 724×304 inside the safe area). */
const BURST_AT: Record<Corner, {left: number; top: number}> = {
	tl: {left: 96, top: 54},
	tr: {left: 96 + DRIFT.xRange + 724, top: 54},
	bl: {left: 96, top: 54 + DRIFT.yRange + 304},
	br: {left: 96 + DRIFT.xRange + 724, top: 54 + DRIFT.yRange + 304}
};

interface ScreensaverProps {
	player: PlayerState;
	listener?: string;
	/** Development: start the drift so it reaches a corner within seconds. */
	cornerSoon?: boolean;
}

export function Screensaver ({player, listener = '', cornerSoon = false}: ScreensaverProps) {
	const book = player.itemId && player.status !== 'error' && player.title ? player : null;
	const percent = book && book.duration ? Math.floor((book.position / book.duration) * 100) : 0;
	const chapter = book && book.chapterIndex >= 0 ? book.chapters[book.chapterIndex] : null;
	// ★ Night mode: dimmer and slower from 10pm to 6am, by the TV's clock.
	const settings = useSettings();
	const hour = useHour();
	const night = isPremium() && settings.nightMode && hour >= 0 && (hour >= 22 || hour < 6);

	// The drift's timing lives here (not in CSS) so the Perfect corner check uses the same numbers.
	const slow = night ? 2 : 1;
	const xSeconds = DRIFT.xSeconds * slow;
	const ySeconds = DRIFT.ySeconds * slow;
	const timing = {
		...DRIFT,
		xSeconds,
		ySeconds,
		xDelay: cornerSoon ? -(2 * xSeconds - 6) : DRIFT.xDelay * slow,
		yDelay: cornerSoon ? -(2 * ySeconds - 6) : DRIFT.yDelay * slow
	};

	// Easter egg: celebrate when the card lands exactly in a corner.
	const [burst, setBurst] = useState<{corner: Corner; id: number} | null>(null);
	const started = useRef(0);
	useEffect(() => {
		started.current = Date.now();
		let last = 0;
		const timer = window.setInterval(() => {
			const t = (Date.now() - started.current) / 1000;
			const corner = cornerAt(driftAt(t, timing), timing);
			if (corner && Date.now() - last > 5000) {
				last = Date.now();
				countPerfectCorner();
				setBurst({corner, id: last});
				window.setTimeout(() => setBurst(null), 1800);
			}
		}, 100);
		return () => window.clearInterval(timer);
	}, [night, cornerSoon]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div className={'vf-saver' + (night ? ' vf-saver--night' : '')} aria-hidden="true">
			<div key={night ? 'night' : 'day'} className="vf-saver__y" style={{animationDuration: timing.ySeconds + 's', animationDelay: timing.yDelay + 's'}}>
				<div className={'vf-saver__x' + (burst ? ' is-perfect' : '')} style={{animationDuration: timing.xSeconds + 's', animationDelay: timing.xDelay + 's'}}>
					{book ? (
						<div className="vf-saver__card">
							<Cover url={book.coverUrl} title={book.title} author={book.author} size={280} className="vf-saver__cover" />
							<div className="vf-saver__text">
								<Clock className="vf-saver__clock" />
								<div className="vf-saver__title">{book.title}</div>
								{listener && <div className="vf-saver__listener">{listener + "'s book"}</div>}
								<div className="vf-saver__chapter">
									{chapter ? chapter.title : book.author}
									{book.status === 'paused' ? ' · Paused' : ''}
								</div>
								{book.sleep && (
									<div className={'vf-saver__sleep' + (book.sleep.prompt ? ' is-prompt' : '')}>
										{book.sleep.prompt
											? 'Still listening? Press any key'
											: book.sleep.mode === 'chapter' ? 'Sleep at end of chapter' : 'Sleep in ' + formatDuration(Math.ceil(book.sleep.remainingMs / 60000) * 60)}
									</div>
								)}
								<div className="vf-saver__progress">
									<div className="vf-bar vf-saver__bar"><div className="vf-bar__fill" style={{width: percent + '%'}} /></div>
									<span className="vf-saver__pct">{percent + '%'}</span>
								</div>
							</div>
						</div>
					) : (
						<div className="vf-saver__card vf-saver__card--idle">
							<Clock className="vf-saver__clock vf-saver__clock--big" />
							<div className="vf-lockup vf-lockup--small">
								<img className="vf-logo-mark vf-logo-mark--small" src={mark} alt="" />
								<div className="vf-wordmark">Vox Folio</div>
							</div>
						</div>
					)}
				</div>
			</div>
			{burst && (
				<div key={burst.id} className={'vf-burst vf-burst--' + burst.corner} style={BURST_AT[burst.corner]}>
					<svg className="vf-burst__star" width="120" height="120" viewBox="-12 -12 24 24" aria-hidden="true">
						<path d="M0 -11 C1 -3 3 -1 11 0 C3 1 1 3 0 11 C-1 3 -3 1 -11 0 C-3 -1 -1 -3 0 -11 Z" fill="#F2B84B" />
					</svg>
					{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className="vf-burst__dot" style={{transform: 'rotate(' + i * 45 + 'deg)'}} />)}
				</div>
			)}
		</div>
	);
}
