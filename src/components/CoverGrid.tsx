import {useState} from 'react';

import {Cover, Tile} from './controls';
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
}

const COLUMNS = 6;
/** Tile height plus row gap; must match .vf-grid__tile and .vf-grid row-gap. */
const ROW_PITCH = 370;

interface CoverGridProps {
	items: GridItem[];
	onSelect: (item: GridItem) => void;
	/** Called when focus gets within two rows of the end, to load more. */
	onNearEnd?: () => void;
	/** Keeps scroll position across remounts (Back from a title). */
	initialRow?: number;
	onRowChange?: (row: number) => void;
}

/** Six columns of square covers. Rows slide up as focus moves down (a transform, cheap on the TV). */
export function CoverGrid ({items, onSelect, onNearEnd, initialRow = 0, onRowChange}: CoverGridProps) {
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

	const offset = Math.max(0, row - 1) * ROW_PITCH;

	return (
		<div className="vf-grid" onScroll={pinScroll}>
			<div className="vf-grid__rows" style={{transform: 'translateY(' + -offset + 'px)'}}>
				{items.map((item, i) => (
					<Tile
						key={item.key}
						className="vf-book vf-grid__tile"
						data-focus-key={item.key}
						data-default-focus={i === 0 || undefined}
						aria-label={item.title + ', ' + item.subtitle}
						onFocus={() => onFocusIndex(i)}
						onClick={() => onSelect(item)}
					>
						<div className="vf-grid__cover">
							<Cover url={item.coverUrl} title={item.title} author={item.author} size={240} />
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
	);
}
