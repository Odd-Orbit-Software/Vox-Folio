import Spotlight from '@enact/spotlight';
import {useEffect, useRef} from 'react';

import type {Route} from '../app/routes';
import mark from '../assets/vox-folio-mark.svg';
import {Keys} from '../platform/webos';
import {initials} from '../app/profiles';
import {Button, Icon} from './controls';
import {useHasPodcasts} from './PodcastsContext';
import {useProfileInfo} from './ProfileContext';
import type {IconName} from './controls';

const TABS: {name: Route['name']; label: string; icon: IconName}[] = [
	{name: 'home', label: 'Home', icon: 'home'},
	{name: 'search', label: 'Search', icon: 'search'},
	{name: 'library', label: 'Library', icon: 'library'},
	{name: 'series', label: 'Series', icon: 'series'},
	{name: 'authors', label: 'Authors', icon: 'authors'},
	{name: 'podcasts', label: 'Podcasts', icon: 'podcast'}
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
	const profile = useProfileInfo();
	const hasPodcasts = useHasPodcasts();
	const tabs = TABS.filter((t) => t.name !== 'podcasts' || hasPodcasts || active === 'podcasts');

	// The last thing focused in the screen's content, so Right from the rail returns to it
	// instead of whatever happens to sit nearest.
	const lastContent = useRef<HTMLElement | null>(null);
	useEffect(() => {
		const onFocusIn = (ev: FocusEvent) => {
			const el = ev.target as HTMLElement | null;
			const screen = nav.current && nav.current.parentElement;
			if (el && screen && screen.contains(el) && !nav.current!.contains(el)) lastContent.current = el;
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.keyCode !== Keys.RIGHT || !nav.current || !nav.current.contains(document.activeElement)) return;
			const back = lastContent.current;
			if (back && back.isConnected && Spotlight.focus(back as unknown as string)) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		};
		document.addEventListener('focusin', onFocusIn);
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			document.removeEventListener('focusin', onFocusIn);
			window.removeEventListener('keydown', onKeyDown, true);
		};
	}, []);

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
			{profile && (
				<Button variant="icon" className="vf-rail__btn vf-rail__avatar" aria-label={'Listening as ' + profile.name + '. OK to switch'} data-focus-key="rail:profile" onClick={profile.onOpen}>
					<span>{initials(profile.name)}</span>
				</Button>
			)}
			<div className="vf-rail__tabs">
				{tabs.map((t) => (
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
