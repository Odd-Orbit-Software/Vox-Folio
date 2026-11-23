import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';

import type {FilterData, LibraryItem, MediaProgress} from '../abs/types';
import {countValues, filtersLabel, GROUPS, hasFilters, letterJump, letterOf, NO_FILTERS, sameFilter, valuesFor} from '../app/filters';
import type {FilterGroup, Filters} from '../app/filters';
import {isBackKey, Keys} from '../platform/webos';

import {Button, Icon, Tile} from './controls';
import {focusWithin, PanelScope, pinScroll} from './ScreenContainer';

/** Value rows are 82 px with a 6 px gap; must match .vf-chapter. */
const ROW_PITCH = 88;
/** Channel up/down jump this many values. */
const PAGE = 8;

interface FilterPanelProps {
	data: FilterData | null;
	filters: Filters;
	/** Every book in the library, for counts. Null while loading, or in a very large library. */
	allItems: LibraryItem[] | null;
	progress: Record<string, MediaProgress>;
	onChange: (f: Filters) => void;
	onClose: () => void;
}

/** Filter the library by a progress state, and by one genre, narrator, tag or language, together or
    apart. Changes apply as they're picked; Back closes the panel. */
export function FilterPanel ({data, filters, allItems, progress, onChange, onClose}: FilterPanelProps) {
	// Only offer groups that have values on this server.
	const groups = GROUPS.filter((g) => g.id === 'progress' || (data && data[g.id].length > 0));
	const [group, setGroup] = useState<FilterGroup>(filters.meta ? filters.meta.group : 'progress');
	const allValues = valuesFor(group, data);
	const counts = allItems ? countValues(allItems, group, allValues, filters, progress) : null;
	// Values that would show nothing stay in the list, dimmed with "0", so nothing seems to vanish.
	const values = allValues;
	const isOn = (value: string) => (group === 'progress' ? filters.progress === value : sameFilter(filters.meta, {group, value}));
	const selectedAt = values.map((v) => isOn(v.value)).indexOf(true);
	const [row, setRow] = useState(Math.max(0, selectedAt));
	const [inList, setInList] = useState(false);

	// Back closes the panel, before the app's Back handler leaves the screen. Red clears everything.
	useEffect(() => {
		const onKey = (ev: KeyboardEvent) => {
			if (ev.keyCode === Keys.RED && hasFilters(filters)) {
				ev.preventDefault();
				ev.stopPropagation();
				onChange(NO_FILTERS);
				return;
			}
			if (!isBackKey(ev.keyCode)) return;
			ev.preventDefault();
			ev.stopPropagation();
			onClose();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onClose, onChange, filters]);

	// A new group starts at its top (or its selected value).
	const firstGroup = useRef(true);
	useEffect(() => {
		if (firstGroup.current) {
			firstGroup.current = false;
			return;
		}
		setRow(Math.max(0, selectedAt));
	}, [group]); // eslint-disable-line react-hooks/exhaustive-deps

	const pick = (v: {value: string; sources: string[]}, i: number) => {
		if (group === 'progress') onChange({...filters, progress: isOn(v.value) ? null : v.value});
		else onChange({...filters, meta: isOn(v.value) ? null : {group, value: v.value, sources: v.sources}});
		// The "Showing" line can appear or go, which shifts the list: keep focus on the value just picked.
		window.setTimeout(() => focusWithin('filter-panel', 'value:' + i), 0);
	};

	/* In the list: Up from the first value goes back to the tabs, Channel up/down page eight at a time,
	   and in long lists Left/Right jump to the previous or next letter. */
	const long = group !== 'progress' && values.length > PAGE;
	const labels = values.map((v) => v.label);
	const onValueKey = (i: number) => (ev: ReactKeyboardEvent<HTMLElement>) => {
		let target: string | null = null;
		if (ev.keyCode === Keys.UP && i === 0) target = 'group:' + group;
		else if (ev.keyCode === Keys.CH_DOWN) target = 'value:' + Math.min(values.length - 1, i + PAGE);
		else if (ev.keyCode === Keys.CH_UP) target = 'value:' + Math.max(0, i - PAGE);
		else if (long && (ev.keyCode === Keys.RIGHT || ev.keyCode === Keys.LEFT)) {
			const j = letterJump(labels, i, ev.keyCode === Keys.RIGHT ? 1 : -1);
			if (j === null) {
				// At either end: stay put rather than leave the panel.
				ev.preventDefault();
				ev.stopPropagation();
				return;
			}
			target = 'value:' + j;
		}
		if (!target) return;
		ev.preventDefault();
		ev.stopPropagation();
		focusWithin('filter-panel', target);
	};

	const meta = !data && group !== 'progress'
		? 'Loading…'
		: inList && long
			? letterOf(labels[row] || '') + ' · ' + (row + 1) + ' of ' + values.length + ' · ◀ ▶ letters · CH +/− page'
			: inList && !allItems && data && (data.bookCount || 0) > 2000 ? 'Counts aren\u2019t shown in libraries this large' : '';

	return (
		<>
			<div className="vf-scrim" />
			<PanelScope id="filter-panel" className="vf-panel vf-filter">
				<div className="vf-panel__head">
					<h2 className="vf-panel__title">Filter</h2>
					<span className="vf-muted">Back to close</span>
				</div>
				{hasFilters(filters) && (
					<div className="vf-filter__current">
						<span className="vf-filter__showing">{'Showing ' + filtersLabel(filters)}</span>
						<Button variant="chip" className="vf-filter__clear" data-focus-key="clear" onClick={() => {
							onChange(NO_FILTERS);
							window.setTimeout(() => focusWithin('filter-panel', 'group:' + group), 0);
						}}
						>
							<span className="vf-dot vf-dot--red" />Show all
						</Button>
					</div>
				)}
				<div className="vf-tabs vf-filter__tabs" role="tablist">
					{groups.map((g) => {
						const set = g.id === 'progress' ? Boolean(filters.progress) : Boolean(filters.meta && filters.meta.group === g.id);
						return (
							<Button
								key={g.id}
								variant="chip"
								role="tab"
								aria-selected={g.id === group}
								className={'vf-tab' + (g.id === group ? ' is-selected' : '') + (set ? ' has-value' : '')}
								data-focus-key={'group:' + g.id}
								data-default-focus={(g.id === (filters.meta ? filters.meta.group : 'progress')) || undefined}
								onFocus={() => setGroup(g.id)}
								onClick={() => setGroup(g.id)}
							>
								{g.label}
							</Button>
						);
					})}
				</div>
				<div className="vf-filter__meta" aria-hidden="true">{meta}</div>
				{!data && <p className="vf-panel__note">Loading genres, narrators and more…</p>}
				<div className="vf-chapters vf-filter__values" onScroll={pinScroll} onFocus={() => setInList(true)} onBlur={() => setInList(false)}>
					<ol className="vf-chapters__list" style={{transform: 'translateY(' + -Math.max(0, row - 3) * ROW_PITCH + 'px)'}}>
						{values.map((v, i) => {
							const on = isOn(v.value);
							const n = counts ? counts[v.value] : null;
							return (
								<li key={v.value}>
									<Tile
										className={'vf-chapter vf-filter__value' + (on ? ' is-current' : '') + (n === 0 && !on ? ' is-empty' : '')}
										data-focus-key={'value:' + i}
										data-default-focus={on || undefined}
										aria-pressed={on}
										aria-label={v.label + (n !== null ? ', ' + n + (n === 1 ? ' book' : ' books') : '')}
										onFocus={() => setRow(i)}
										onKeyDown={onValueKey(i)}
										onClick={() => pick(v, i)}
									>
										<span className="vf-chapter__title">{v.label}</span>
										{n !== null && <span className="vf-filter__count">{n}</span>}
										{on && <Icon name="check" size={26} />}
									</Tile>
								</li>
							);
						})}
					</ol>
				</div>
			</PanelScope>
		</>
	);
}
