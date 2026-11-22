/* Titles too long for their tile scroll sideways while the tile has focus, so the whole title can be
   read. One document-wide focus listener drives every `.vf-marquee` (no per-tile state or re-renders);
   the scroll is a Web Animation on a small text layer, cheap on the TV. */

import type {ReactNode} from 'react';

/** Pixels per second, and the pause at each end. */
const SPEED = 70;
const HOLD_MS = 1200;

const running = new WeakMap<Element, Animation>();

function start (box: HTMLElement): void {
	const text = box.firstElementChild as HTMLElement | null;
	if (!text || running.has(box)) return;
	// Reduce motion (Settings): titles stay still.
	if (document.documentElement.classList.contains('vf-reduce-motion')) return;
	const distance = text.scrollWidth - box.clientWidth;
	if (distance < 4) return;
	box.classList.add('is-scrolling');
	const travel = (distance / SPEED) * 1000;
	const total = travel + HOLD_MS * 2;
	const anim = text.animate([
		{transform: 'translateX(0)', offset: 0},
		{transform: 'translateX(0)', offset: HOLD_MS / total},
		{transform: 'translateX(' + -distance + 'px)', offset: (HOLD_MS + travel) / total},
		{transform: 'translateX(' + -distance + 'px)', offset: 1}
	], {duration: total, iterations: Infinity, direction: 'alternate', easing: 'linear'});
	running.set(box, anim);
}

function stop (box: Element): void {
	const anim = running.get(box);
	if (anim) anim.cancel();
	running.delete(box);
	box.classList.remove('is-scrolling');
}

function each (root: EventTarget | null, fn: (el: HTMLElement) => void): void {
	if (!root || !(root as HTMLElement).querySelectorAll) return;
	const list = (root as HTMLElement).querySelectorAll('.vf-marquee');
	for (let i = 0; i < list.length; i++) fn(list[i] as HTMLElement);
}

/** Install once at start-up. */
export function installMarquee (): () => void {
	const onIn = (ev: FocusEvent) => each(ev.target, start);
	const onOut = (ev: FocusEvent) => each(ev.target, stop);
	document.addEventListener('focusin', onIn);
	document.addEventListener('focusout', onOut);
	return () => {
		document.removeEventListener('focusin', onIn);
		document.removeEventListener('focusout', onOut);
	};
}

/** A one-line title that scrolls when its focused tile is too narrow for it. */
export function Marquee ({className, children}: {className: string; children: ReactNode}) {
	return <div className={className + ' vf-marquee'}><span className="vf-marquee__text">{children}</span></div>;
}
