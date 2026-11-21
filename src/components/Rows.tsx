import Spotlight from '@enact/spotlight';
import {useState} from 'react';
import type {FocusEvent, KeyboardEvent, ReactNode} from 'react';

import {Keys} from '../platform/webos';

import {Cover, Tile} from './controls';
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
}

/** A titled horizontal shelf of covers that slides to keep the focused one in view. */
export function CoverRow ({title, items, onSelect, meta, defaultFocus}: CoverRowProps) {
	const [index, setIndex] = useState(0);
	const maxOffset = Math.max(0, items.length - VISIBLE) * ITEM_PITCH;
	const offset = Math.min(maxOffset, Math.max(0, index - (VISIBLE - 2)) * ITEM_PITCH);

	return (
		<section className="vf-crow" data-vrow aria-label={title}>
			<h2 className="vf-crow__title">
				{title}
				{meta && <span className="vf-crow__meta">{meta}</span>}
			</h2>
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
								// Right at the end of a shelf stays put rather than diving into the row below.
								if (ev.keyCode === Keys.RIGHT && i === items.length - 1) {
									ev.preventDefault();
									ev.stopPropagation();
								}
							}}
						>
							<div className={'vf-grid__cover' + (item.round ? ' vf-grid__cover--round' : '')}>
								<Cover url={item.coverUrl} title={item.title} author={item.author} size={240} round={item.round} />
								{item.finished && <span className="vf-badge vf-badge--done">Finished</span>}
								{!item.finished && item.badge && <span className="vf-badge">{item.badge}</span>}
								{item.percent !== null && !item.finished && (
									<div className="vf-bar vf-grid__bar"><div className="vf-bar__fill" style={{width: item.percent + '%'}} /></div>
								)}
							</div>
							<div className="vf-book__title">{item.title}</div>
							<div className="vf-book__meta">{item.subtitle}</div>
						</Tile>
					))}
				</div>
			</div>
		</section>
	);
}

/** A vertical stack of rows (data-vrow) that scrolls so the focused row sits near the top. */
export function VScroll ({className = '', children}: {className?: string; children: ReactNode}) {
	const [offset, setOffset] = useState(0);
	const onFocus = (ev: FocusEvent<HTMLDivElement>) => {
		const row = (ev.target as HTMLElement).closest('[data-vrow]') as HTMLElement | null;
		if (!row) return;
		const top = row.offsetTop;
		setOffset(top < 200 ? 0 : top - 40);
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
