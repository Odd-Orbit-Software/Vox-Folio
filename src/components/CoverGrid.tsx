import Spotlight from '@enact/spotlight';
import {memo, useEffect, useLayoutEffect, useRef, useState} from 'react';

import {Cover, Tile} from './controls';
import {Marquee} from './marquee';
import {pinScroll} from './ScreenContainer';

export interface GridItem {
	key: string;
	coverUrl: string;
	title: string;
	subtitle: string;
	author?: string;
	/** 0–100 for a progress bar, or null for none. */
	percent: number | null;
	finished?: boolean;
	badge?: string;
	/** Round crop, for author portraits. */
	round?: boolean;
	/** Four covers drawn as a 2×2 mosaic in place of coverUrl (playlists). */
	mosaic?: string[];
}

/** A tile's artwork: a 2×2 mosaic when it has four covers, else its one cover. */
export function TileArt ({item, size}: {item: GridItem; size: number}) {
	if (item.mosaic && item.mosaic.length >= 4) {
		return (
			<div className="vf-mosaic" style={{width: size + 'px', height: size + 'px'}}>
				{item.mosaic.slice(0, 4).map((url, i) => <img key={i} src={url} alt="" />)}
			</div>
		);
	}
	return <Cover url={item.coverUrl} title={item.title} author={item.author} size={size} round={item.round} />;
}

function sameItem (a: GridItem, b: GridItem): boolean {
	return a.key === b.key && a.coverUrl === b.coverUrl && a.title === b.title && a.subtitle === b.subtitle &&
		a.author === b.author && a.percent === b.percent && a.finished === b.finished && a.badge === b.badge && a.round === b.round &&
		(a.mosaic || []).join() === (b.mosaic || []).join();
}

interface GridTileProps {
	item: GridItem;
	index: number;
	isDefault: boolean;
	/** Stable handlers (read through refs) so unchanged tiles skip re-rendering when focus moves. */
	onFocusIndex: (i: number) => void;
	onSelect: (item: GridItem) => void;
}

const GridTile = memo(function GridTileView ({item, index, isDefault, onFocusIndex, onSelect}: GridTileProps) {
	return (
		<Tile
			className="vf-book vf-grid__tile"
			data-focus-key={item.key}
			data-default-focus={isDefault || undefined}
			aria-label={item.title + ', ' + item.subtitle}
			onFocus={() => onFocusIndex(index)}
			onClick={() => onSelect(item)}
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
	);
}, (a, b) => a.index === b.index && a.isDefault === b.isDefault && sameItem(a.item, b.item));

const COLUMNS = 6;
/** Tile height plus row gap; must match .vf-grid__tile and .vf-grid row-gap. */
const ROW_PITCH = 370;
/** Rows kept in the page around the focused row. */
const WINDOW_ABOVE = 3;
const WINDOW_BELOW = 6;

interface CoverGridProps {
	items: GridItem[];
	/** Show placeholder tiles while the first page loads. */
	loading?: boolean;
	/** Round placeholders (author portraits). */
	round?: boolean;
	onSelect: (item: GridItem) => void;
	/** Called when focus gets within two rows of the end, to load more. */
	onNearEnd?: () => void;
	/** Keeps scroll position across remounts (Back from a title). */
	initialRow?: number;
	onRowChange?: (row: number) => void;
	/** Move to and focus the item at `index` (each new `n` is a new jump), even outside the rendered window. */
	jumpTo?: {index: number; n: number} | null;
}

/** Six columns of square covers. Rows slide up as focus moves down (a transform, cheap on the TV). */
export function CoverGrid ({items, onSelect, onNearEnd, initialRow = 0, onRowChange, loading = false, round = false, jumpTo = null}: CoverGridProps) {
	const [row, setRow] = useState(initialRow);
	const rows = Math.ceil(items.length / COLUMNS);

	const onFocusIndex = (index: number) => {
		const r = Math.floor(index / COLUMNS);
		if (r !== row) {
			setRow(r);
			if (onRowChange) onRowChange(r);
		}
		if (onNearEnd && r >= rows - 2) onNearEnd();
	};

	// A jump: bring the row into the window during render (a new jump number is a changed prop), then
	// focus the tile once it's rendered.
	const [seenJump, setSeenJump] = useState(0);
	if (jumpTo && jumpTo.n !== seenJump && items[jumpTo.index]) {
		setSeenJump(jumpTo.n);
		setRow(Math.floor(jumpTo.index / COLUMNS));
	}
	const jumpN = jumpTo ? jumpTo.n : 0;
	useEffect(() => {
		if (!jumpTo || !items[jumpTo.index]) return undefined;
		if (onRowChange) onRowChange(Math.floor(jumpTo.index / COLUMNS));
		const key = items[jumpTo.index].key;
		const t = window.setTimeout(() => {
			const el = document.querySelector('.vf-grid [data-focus-key="' + key.replace(/"/g, '\\"') + '"]') as HTMLElement | null;
			if (el && !Spotlight.focus(el as unknown as string)) el.focus();
		}, 0);
		return () => window.clearTimeout(t);
	}, [jumpN]); // eslint-disable-line react-hooks/exhaustive-deps

	// Stable callbacks for the memoised tiles; they always call the latest handlers.
	const latest = useRef({onFocusIndex, onSelect});
	useLayoutEffect(() => {
		latest.current = {onFocusIndex, onSelect};
	});
	const [focusIndex] = useState(() => (i: number) => latest.current.onFocusIndex(i));
	const [select] = useState(() => (item: GridItem) => latest.current.onSelect(item));

	const offset = Math.max(0, row - 1) * ROW_PITCH;
	// Render only rows near the focus, so a library of thousands of books stays light on the TV.
	const firstRow = Math.max(0, row - WINDOW_ABOVE);
	const lastRow = row + WINDOW_BELOW;
	const visible = items.slice(firstRow * COLUMNS, (lastRow + 1) * COLUMNS);

	if (loading && !items.length) {
		return (
			<div className="vf-grid" aria-busy="true">
				<div className="vf-grid__rows">
					{Array.from({length: COLUMNS * 2}, (_, i) => (
						<div key={i} className="vf-grid__tile vf-grid__tile--skeleton" aria-hidden="true">
							<div className={'vf-skeleton vf-skeleton--tile' + (round ? ' vf-skeleton--round' : '')} />
							<div className="vf-skeleton vf-skeleton--text" />
							<div className="vf-skeleton vf-skeleton--text vf-skeleton--short" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="vf-grid" onScroll={pinScroll}>
			<div className="vf-grid__rows" style={{transform: 'translateY(' + (firstRow * ROW_PITCH - offset) + 'px)'}}>
				{visible.map((item, j) => (
					<GridTile
						key={item.key}
						item={item}
						index={firstRow * COLUMNS + j}
						isDefault={firstRow * COLUMNS + j === 0}
						onFocusIndex={focusIndex}
						onSelect={select}
					/>
				))}
			</div>
		</div>
	);
}
