import {useEffect, useRef, useState} from 'react';

import type {AbsClient} from '../abs/client';
import type {FilterData, LibraryItem} from '../abs/types';
import {letterJump, letterOf, valuesFor} from '../app/filters';
import type {FilterValue} from '../app/filters';
import {Keys} from '../platform/webos';

import {CoverGrid} from './CoverGrid';
import type {GridItem} from './CoverGrid';
import {CoverRow, VScroll} from './Rows';

/** Books per genre shelf before the "All" tile. */
const SHELF_SIZE = 11;
/** Shelves kept in the page either side of the focused one (the rest are spacers of the same height). */
const SHELF_WINDOW = 3;
/** A shelf's height with its gap; must match .vf-crow (title, 240 px cover, two text lines, margins). */
const SHELF_HEIGHT = 418;

export interface GenreShelf {
	genre: FilterValue;
	books: LibraryItem[];
}

/** Genres with their books, busiest first. One pass over the books: each raw genre string maps to
    the tidied genres it stands for. */
export function genreShelves (items: LibraryItem[], data: FilterData | null): GenreShelf[] {
	const values = valuesFor('genres', data);
	const bySource: Record<string, number[]> = {};
	values.forEach((v, i) => v.sources.forEach((src) => {
		(bySource[src] = bySource[src] || []).push(i);
	}));
	const books: LibraryItem[][] = values.map(() => []);
	items.forEach((it) => {
		const seen: Record<number, boolean> = {};
		((it.media.metadata as {genres?: string[]}).genres || []).forEach((g) => (bySource[g] || []).forEach((i) => {
			if (!seen[i]) {
				seen[i] = true;
				books[i].push(it);
			}
		}));
	});
	return values
		.map((genre, i) => ({genre, books: books[i]}))
		.filter((s) => s.books.length > 0)
		.sort((a, b) => b.books.length - a.books.length || a.genre.label.localeCompare(b.genre.label));
}

interface GenreViewProps {
	client: AbsClient;
	shelves: GenreShelf[];
	toTile: (item: LibraryItem) => GridItem;
	onOpenTitle: (itemId: string, fromKey: string) => void;
	/** "All N" at the end of a shelf: the library filtered to that genre. */
	onOpenGenre: (genre: FilterValue) => void;
	/** Back from a book: the tile to return to ("g:<genre>:<id>"). */
	restoreKey?: string | null;
}

/** One shelf per genre, busiest first. Only shelves near focus are rendered, so 70 genres stay light. */
export function GenreView ({client, shelves, toTile, onOpenTitle, onOpenGenre, restoreKey}: GenreViewProps) {
	// Start at the shelf being returned to, so it's rendered (not a spacer) for focus to land on.
	const [at, setAt] = useState(() => {
		const m = restoreKey ? /^g(?:all)?:(.+?)(?::[^:]+)?$/.exec(restoreKey) : null;
		const i = m ? shelves.map((s) => s.genre.value).indexOf(m[1]) : -1;
		return Math.max(0, i);
	});
	return (
		<div onFocus={(ev) => {
			const row = (ev.target as HTMLElement).closest('[data-shelf]');
			if (row) setAt(Number(row.getAttribute('data-shelf')));
		}}
		>
			<VScroll className="vf-library__shelves">
				{shelves.map((s, i) => {
					if (Math.abs(i - at) > SHELF_WINDOW) return <div key={s.genre.value} data-vrow style={{height: SHELF_HEIGHT + 'px'}} />;
					const tiles: GridItem[] = s.books.slice(0, SHELF_SIZE).map((b) => ({...toTile(b), key: 'g:' + s.genre.value + ':' + b.id}));
					if (s.books.length > SHELF_SIZE) {
						const covers = s.books.filter((b) => b.media.coverPath).slice(0, 4).map((b) => client.coverUrl(b.id, 240));
						tiles.push({key: 'gall:' + s.genre.value, coverUrl: '', mosaic: covers, title: 'All ' + s.books.length, subtitle: s.genre.label, percent: null});
					}
					return (
						<div key={s.genre.value} data-shelf={i}>
							<CoverRow
								title={s.genre.label}
								meta={s.books.length + (s.books.length === 1 ? ' book' : ' books')}
								items={tiles}
								defaultFocus={i === 0}
								onSelect={(g) => {
									if (g.key.indexOf('gall:') === 0) onOpenGenre(s.genre);
									else onOpenTitle(g.key.slice(g.key.lastIndexOf(':') + 1), g.key);
								}}
							/>
						</div>
					);
				})}
			</VScroll>
		</div>
	);
}

export interface Narrator {
	name: string;
	count: number;
}

/** Everyone who reads a book in the library, A to Z, with how many books each. */
export function narrators (items: LibraryItem[]): Narrator[] {
	const counts: Record<string, number> = {};
	items.forEach((it) => {
		const names = ((it.media.metadata as {narratorName?: string}).narratorName || '').split(/\s*,\s*/).filter(Boolean);
		names.forEach((n) => {
			counts[n] = (counts[n] || 0) + 1;
		});
	});
	return Object.keys(counts).sort((a, b) => a.localeCompare(b)).map((name) => ({name, count: counts[name]}));
}

interface NarratorViewProps {
	list: Narrator[];
	/** Back from a narrator's books: their portrait ("narr:<name>"). */
	restoreKey?: string | null;
	onOpenNarrator: (name: string, fromKey: string) => void;
}

/** A portrait grid of narrators. Channel up and down jump to the next or previous letter, shown on a rail. */
export function NarratorView ({list, onOpenNarrator, restoreKey}: NarratorViewProps) {
	const labels = list.map((n) => n.name);
	const startAt = restoreKey && restoreKey.indexOf('narr:') === 0 ? Math.max(0, labels.indexOf(restoreKey.slice(5))) : 0;
	const [at, setAt] = useState(startAt);
	const [jump, setJump] = useState<{index: number; n: number} | null>(null);
	const atRef = useRef(at);
	useEffect(() => {
		atRef.current = at;
	}, [at]);
	const letters = labels.map(letterOf).filter((l, i, all) => all.indexOf(l) === i);
	const current = letterOf(labels[at] || '');

	useEffect(() => {
		const onKey = (ev: KeyboardEvent) => {
			if (ev.keyCode !== Keys.CH_UP && ev.keyCode !== Keys.CH_DOWN) return;
			const el = document.activeElement as HTMLElement | null;
			if (!el || !el.closest('.vf-narrators')) return;
			const j = letterJump(labels, atRef.current, ev.keyCode === Keys.CH_DOWN ? 1 : -1);
			ev.preventDefault();
			ev.stopPropagation();
			if (j !== null) setJump((p) => ({index: j, n: (p ? p.n : 0) + 1}));
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [labels.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

	const items: GridItem[] = list.map((n) => ({
		key: 'narr:' + n.name,
		coverUrl: '',
		title: n.name,
		subtitle: n.count + (n.count === 1 ? ' book' : ' books'),
		percent: null,
		round: true
	}));

	return (
		<div className="vf-narrators" onFocus={(ev) => {
			const key = (ev.target as HTMLElement).getAttribute('data-focus-key');
			if (key && key.indexOf('narr:') === 0) setAt(labels.indexOf(key.slice(5)));
		}}
		>
			<CoverGrid items={items} round jumpTo={jump} initialRow={Math.floor(startAt / 6)} onSelect={(g) => onOpenNarrator(g.key.slice(5), g.key)} />
			<ol className="vf-letters" aria-hidden="true">
				{letters.map((l) => <li key={l} className={l === current ? 'is-current' : ''}>{l}</li>)}
				<li className="vf-letters__hint">CH ±</li>
			</ol>
		</div>
	);
}
