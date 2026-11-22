import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';

import type {FilterData} from '../abs/types';
import {filterLabel, GROUPS, sameFilter, valuesFor} from '../app/filters';
import type {FilterGroup, LibraryFilter} from '../app/filters';
import {isBackKey, Keys} from '../platform/webos';

import {Button, Icon, Tile} from './controls';
import {focusWithin, PanelScope, pinScroll} from './ScreenContainer';

/** Value rows are 82 px with a 6 px gap; must match .vf-chapter. */
const ROW_PITCH = 88;
/** Channel up/down jump this many values. */
const PAGE = 8;

interface FilterPanelProps {
	data: FilterData | null;
	current: LibraryFilter | null;
	onPick: (f: LibraryFilter | null) => void;
	onClose: () => void;
}

/** Filter the library by one thing at a time: progress, genre, narrator, tag or language. */
export function FilterPanel ({data, current, onPick, onClose}: FilterPanelProps) {
	// Only offer groups that have values on this server.
	const groups = GROUPS.filter((g) => g.id === 'progress' || (data && data[g.id].length > 0));
	const [group, setGroup] = useState<FilterGroup>(current ? current.group : 'progress');
	const values = valuesFor(group, data);
	const selectedAt = current && current.group === group ? values.map((v) => v.value).indexOf(current.value) : -1;
	const [row, setRow] = useState(Math.max(0, selectedAt));
	const [inList, setInList] = useState(false);

	// Back closes the panel, before the app's Back handler leaves the screen.
	useEffect(() => {
		const onKey = (ev: KeyboardEvent) => {
			// Red anywhere in the panel clears the filter, as Red removes elsewhere.
			if (ev.keyCode === Keys.RED && current) {
				ev.preventDefault();
				ev.stopPropagation();
				onPick(null);
				return;
			}
			if (!isBackKey(ev.keyCode)) return;
			ev.preventDefault();
			ev.stopPropagation();
			onClose();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onClose, onPick, current]);

	// A new group starts at its top (or its selected value).
	const firstGroup = useRef(true);
	useEffect(() => {
		if (firstGroup.current) {
			firstGroup.current = false;
			return;
		}
		setRow(Math.max(0, selectedAt));
	}, [group]); // eslint-disable-line react-hooks/exhaustive-deps

	/* In the list: Up from the first value goes back to the tabs (landing on the current group), and
	   Channel up/down page through long lists (narrators) eight at a time. */
	const onValueKey = (i: number) => (ev: ReactKeyboardEvent<HTMLElement>) => {
		let target: string | null = null;
		if (ev.keyCode === Keys.UP && i === 0) target = 'group:' + group;
		else if (ev.keyCode === Keys.CH_DOWN) target = 'value:' + Math.min(values.length - 1, i + PAGE);
		else if (ev.keyCode === Keys.CH_UP) target = 'value:' + Math.max(0, i - PAGE);
		if (!target) return;
		ev.preventDefault();
		ev.stopPropagation();
		focusWithin('filter-panel', target);
	};

	return (
		<>
			<div className="vf-scrim" />
			<PanelScope id="filter-panel" className="vf-panel vf-filter">
				<div className="vf-panel__head">
					<h2 className="vf-panel__title">Filter</h2>
					<span className="vf-muted">Back to close</span>
				</div>
				{current && (
					<div className="vf-filter__current">
						<span className="vf-muted">{'Showing ' + filterLabel(current)}</span>
						<Button variant="chip" className="vf-filter__clear" data-focus-key="clear" onClick={() => onPick(null)}>
							<span className="vf-dot vf-dot--red" />Show all books
						</Button>
					</div>
				)}
				<div className="vf-tabs vf-filter__tabs" role="tablist">
					{groups.map((g) => (
						<Button
							key={g.id}
							variant="chip"
							role="tab"
							aria-selected={g.id === group}
							className={'vf-tab' + (g.id === group ? ' is-selected' : '')}
							data-focus-key={'group:' + g.id}
							data-default-focus={(!current && g.id === 'progress') || undefined}
							onFocus={() => setGroup(g.id)}
							onClick={() => setGroup(g.id)}
						>
							{g.label}
						</Button>
					))}
				</div>
				<div className="vf-filter__meta" aria-hidden="true">
					{!data && group !== 'progress' ? 'Loading…' : inList && values.length > PAGE ? (row + 1) + ' of ' + values.length + ' · CH +/− to jump' : ''}
				</div>
				{!data && <p className="vf-panel__note">Loading genres, narrators and more…</p>}
				<div className="vf-chapters vf-filter__values" onScroll={pinScroll} onFocus={() => setInList(true)} onBlur={() => setInList(false)}>
					<ol className="vf-chapters__list" style={{transform: 'translateY(' + -Math.max(0, row - 3) * ROW_PITCH + 'px)'}}>
						{values.map((v, i) => {
							const on = sameFilter(current, {group, value: v.value});
							return (
								<li key={v.value}>
									<Tile
										className={'vf-chapter vf-filter__value' + (on ? ' is-current' : '')}
										data-focus-key={'value:' + i}
										data-default-focus={on || undefined}
										aria-pressed={on}
										onFocus={() => setRow(i)}
										onKeyDown={onValueKey(i)}
										onClick={() => onPick(on ? null : {group, value: v.value, sources: v.sources})}
									>
										<span className="vf-chapter__title">{v.label}</span>
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
