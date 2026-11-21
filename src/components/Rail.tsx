import Spotlight from '@enact/spotlight';
import {useEffect, useRef} from 'react';

import type {Route} from '../app/routes';
import mark from '../assets/vox-folio-mark.svg';
import {Keys} from '../platform/webos';
import {Button, Icon} from './controls';
import type {IconName} from './controls';

const TABS: {name: Route['name']; label: string; icon: IconName}[] = [
	{name: 'home', label: 'Home', icon: 'home'},
	{name: 'library', label: 'Library', icon: 'library'},
	{name: 'series', label: 'Series', icon: 'series'}
];

/** True when no focusable element sits to the left of `el` in the same row (vertically overlapping). */
function isLeftmostInRow (el: Element, scope: Element): boolean {
	const r = el.getBoundingClientRect();
	const all = scope.querySelectorAll('.spottable');
	for (let i = 0; i < all.length; i++) {
		const other = all[i];
		if (other === el || other.closest('.vf-rail')) continue;
		const o = other.getBoundingClientRect();
		const overlaps = o.top < r.bottom - 4 && o.bottom > r.top + 4;
		if (overlaps && o.right <= r.left + 4) return false;
	}
	return true;
}

/** The side rail on the browse screens (design board 02). OK switches screen. Left from the leftmost
    item in any row comes here (Spotlight alone would pick the nearest thing down-left instead). */
export function Rail ({active, onTab, onSettings}: {active: Route['name']; onTab: (name: Route['name']) => void; onSettings: () => void}) {
	const nav = useRef<HTMLElement>(null);

	useEffect(() => {
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.keyCode !== Keys.LEFT || !nav.current) return;
			const current = document.activeElement;
			const screen = nav.current.parentElement;
			if (!current || !screen || nav.current.contains(current) || !screen.contains(current)) return;
			if (!isLeftmostInRow(current, screen)) return;
			const target = nav.current.querySelector('.vf-rail__btn.is-active') || nav.current.querySelector('.vf-rail__btn');
			if (target && Spotlight.focus(target as unknown as string)) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, []);

	return (
		<nav className="vf-rail" aria-label="Main" ref={nav}>
			<img className="vf-rail__mark" src={mark} alt="" aria-hidden="true" />
			<div className="vf-rail__tabs">
				{TABS.map((t) => (
					<Button
						key={t.name}
						variant="icon"
						className={'vf-rail__btn' + (t.name === active ? ' is-active' : '')}
						aria-label={t.label}
						aria-current={t.name === active ? 'page' : undefined}
						data-focus-key={'rail:' + t.name}
						onClick={() => onTab(t.name)}
					>
						<Icon name={t.icon} size={30} />
					</Button>
				))}
			</div>
			<Button
				variant="icon"
				className={'vf-rail__btn' + (active === 'settings' ? ' is-active' : '')}
				aria-label="Settings"
				aria-current={active === 'settings' ? 'page' : undefined}
				data-focus-key="rail:settings"
				onClick={onSettings}
			>
				<Icon name="settings" size={30} />
			</Button>
		</nav>
	);
}
