import Spotlight from '@enact/spotlight';
import {useState} from 'react';
import type {FocusEvent, KeyboardEvent, ReactNode} from 'react';

import {Keys} from '../platform/webos';

import {Icon, Tile} from './controls';
import {Marquee} from './marquee';
import {TileArt} from './CoverGrid';
import type {GridItem} from './CoverGrid';
import {pinScroll} from './ScreenContainer';

/** Cover tiles are 240 px with a 32 px gap; must match .vf-crow__track. */
const ITEM_PITCH = 272;
/** Covers fully visible in a row beside the rail (1608 px wide). */
const VISIBLE = 5;

interface CoverRowProps {
	title: string;
	items: GridItem[];
	onSelect: (item: GridItem) => void;
	/** Extra text after the title, e.g. a count. */
	meta?: string;
	defaultFocus?: boolean;
	/** A Red-button action on the focused tile, hinted beside the title while the row has focus. */
	action?: {label: string; onAction: (item: GridItem) => void};
}

/** A titled horizontal shelf of covers that slides to keep the focused one in view. */
export function CoverRow ({title, items, onSelect, meta, defaultFocus, action}: CoverRowProps) {
	const [index, setIndex] = useState(0);
	const maxOffset = Math.max(0, items.length - VISIBLE) * ITEM_PITCH;
	const offset = Math.min(maxOffset, Math.max(0, index - (VISIBLE - 2)) * ITEM_PITCH);

	/** Move focus a screenful along the row; the row follows focus as usual. */
	const page = (ev: {currentTarget: HTMLElement}, dir: 1 | -1) => {
		const next = Math.max(0, Math.min(items.length - 1, index + dir * (VISIBLE - 1)));
		const row = ev.currentTarget.closest('.vf-crow');
		const target = row ? row.querySelectorAll('.vf-crow__tile')[next] as HTMLElement | undefined : undefined;
		setIndex(next);
		// After the click settles (it blurs whatever had focus), focus the tile the row moved to.
		window.setTimeout(() => {
			if (target && !Spotlight.focus(target as unknown as string)) target.focus();
		}, 0);
	};

	return (
		<section className="vf-crow" data-vrow aria-label={title}>
			<h2 className="vf-crow__title">
				{title}
				{meta && <span className="vf-crow__meta">{meta}</span>}
				{action && <span className="vf-crow__action" aria-hidden="true"><span className="vf-dot vf-dot--red" />{action.label}</span>}
			</h2>
			{/* With the pointer, arrows at either end move along the row (the wheel moves between rows). */}
			{offset > 0 && (
				<div className="vf-crow__arrow vf-crow__arrow--left" aria-hidden="true" onClick={(ev) => page(ev, -1)}>
					<Icon name="chevronLeft" size={40} />
				</div>
			)}
			{offset < maxOffset && (
				<div className="vf-crow__arrow vf-crow__arrow--right" aria-hidden="true" onClick={(ev) => page(ev, 1)}>
					<Icon name="chevronRight" size={40} />
				</div>
			)}
			<div className="vf-crow__viewport" onScroll={pinScroll}>
				<div className="vf-crow__track" style={{transform: 'translateX(' + -offset + 'px)'}}>
					{items.map((item, i) => (
						<Tile
							key={item.key}
							className="vf-book vf-crow__tile"
							data-focus-key={item.key}
							data-default-focus={(defaultFocus && i === 0) || undefined}
							aria-label={item.title + (item.subtitle ? ', ' + item.subtitle : '')}
							onFocus={() => setIndex(i)}
							onClick={() => onSelect(item)}
							onKeyDown={(ev: KeyboardEvent<HTMLDivElement>) => {
								if (action && ev.keyCode === Keys.RED) {
									ev.preventDefault();
									ev.stopPropagation();
									action.onAction(item);
									return;
								}
								// Right at the end of a shelf stays put rather than diving into the row below.
								if (ev.keyCode === Keys.RIGHT && i === items.length - 1) {
									ev.preventDefault();
									ev.stopPropagation();
								}
							}}
						>
							<div className={'vf-grid__cover' + (item.round ? ' vf-grid__cover--round' : '')}>
								<TileArt item={item} size={240} />
								{item.finished && <span className="vf-badge vf-badge--done">Finished</span>}
								{!item.finished && item.badge && <span className="vf-badge">{item.badge}</span>}
								{item.percent !== null && !item.finished && (
									<div className="vf-bar vf-grid__bar"><div className="vf-bar__fill" style={{width: item.percent + '%'}} /></div>
								)}
							</div>
							<Marquee className="vf-book__title">{item.title}</Marquee>
							<div className="vf-book__meta">{item.subtitle}</div>
						</Tile>
					))}
				</div>
			</div>
		</section>
	);
}

/** A vertical stack of rows (data-vrow) that scrolls so the focused row sits near the top. */
export function VScroll ({className = '', onScrolled, children}: {className?: string; onScrolled?: (scrolled: boolean) => void; children: ReactNode}) {
	const [offset, setOffset] = useState(0);
	const onFocus = (ev: FocusEvent<HTMLDivElement>) => {
		const row = (ev.target as HTMLElement).closest('[data-vrow]') as HTMLElement | null;
		if (!row) return;
		const top = row.offsetTop;
		// The focused row sits at the top; the row before it goes fully out of view, not left as a sliver.
		const next = top < 200 ? 0 : top - 16;
		setOffset(next);
		if (onScrolled) onScrolled(next > 0);
	};
	// Up/Down always go to the adjacent row (to its closest item), never skipping a short row the way
	// Spotlight's nearest-element search can. At the first or last row the key goes on as usual.
	const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
		const dir = ev.keyCode === Keys.DOWN ? 1 : ev.keyCode === Keys.UP ? -1 : 0;
		if (!dir) return;
		const current = document.activeElement as HTMLElement | null;
		const row = current && current.closest('[data-vrow]');
		if (!current || !row) return;
		const rows = Array.prototype.slice.call(ev.currentTarget.querySelectorAll('[data-vrow]')) as HTMLElement[];
		const withItems = rows.filter((r) => r.querySelector('.spottable'));
		const at = withItems.indexOf(row as HTMLElement);
		const target = at === -1 ? null : withItems[at + dir];
		if (!target) {
			// Down from the last row goes nowhere (not across to the rail); Up from the first row
			// continues to whatever is above the rows (a search box, the top bar).
			if (dir === 1 && at !== -1) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			return;
		}
		const from = current.getBoundingClientRect();
		const cx = from.left + from.width / 2;
		const items = Array.prototype.slice.call(target.querySelectorAll('.spottable')) as HTMLElement[];
		let best: HTMLElement | null = null;
		let bestDist = Infinity;
		items.forEach((el) => {
			const r = el.getBoundingClientRect();
			const d = Math.abs(r.left + r.width / 2 - cx);
			if (d < bestDist) {
				bestDist = d;
				best = el;
			}
		});
		if (best && Spotlight.focus(best as unknown as string)) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	};

	return (
		<div className={'vf-vscroll ' + className} onScroll={pinScroll}>
			<div className="vf-vscroll__inner" style={{transform: 'translateY(' + -offset + 'px)'}} onFocus={onFocus} onKeyDown={onKeyDown}>
				{children}
			</div>
		</div>
	);
}
