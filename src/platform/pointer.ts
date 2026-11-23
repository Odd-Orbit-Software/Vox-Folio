/* The Magic Remote's pointer and wheel.

   Hovering focuses (Spotlight) and OK clicks, so pointing already works. Lists here move with focus
   rather than scrolling, so the wheel moves focus too: each notch sends the same Up or Down press as
   the remote's arrows, through every screen's own key handling. While the pointer is in use the root
   carries `vf-pointer`, which shows controls that only make sense with a pointer (row arrows). */

import {Keys} from './webos';

/** Wheel travel that counts as one step, and the shortest time between steps. */
const STEP = 40;
const MIN_GAP_MS = 140;
/** After a wheel step, hover can't take focus back until the pointer really moves. */
const HOVER_HOLD_MS = 400;
const HOVER_MOVE_PX = 12;
/** The pointer counts as gone after this long without moving (webOS hides it too). */
const IDLE_MS = 5000;

function press (code: number): void {
	['keydown', 'keyup'].forEach((type) => {
		const ev = new KeyboardEvent(type, {bubbles: true, cancelable: true});
		Object.defineProperty(ev, 'keyCode', {get: () => code});
		Object.defineProperty(ev, 'which', {get: () => code});
		(document.activeElement || document.body).dispatchEvent(ev);
	});
}

/** Pure part, for tests: given accumulated travel and the time since the last step, the key to press. */
export function wheelStep (travel: number, sinceLastMs: number): number | null {
	if (Math.abs(travel) < STEP || sinceLastMs < MIN_GAP_MS) return null;
	return travel > 0 ? Keys.DOWN : Keys.UP;
}

export function installPointer (): () => void {
	const root = document.documentElement;
	let travel = 0;
	let last = 0;
	let idle: number | null = null;
	let wheelAt = 0;
	let wheelX = 0;
	let wheelY = 0;
	const off = () => root.classList.remove('vf-pointer');
	const onMove = (ev: MouseEvent) => {
		// Just after a wheel step a tiny jitter would hover the tile under the cursor and undo the step.
		if (Date.now() - wheelAt < HOVER_HOLD_MS && Math.abs(ev.clientX - wheelX) + Math.abs(ev.clientY - wheelY) < HOVER_MOVE_PX) {
			ev.stopPropagation();
			return;
		}
		root.classList.add('vf-pointer');
		if (idle !== null) window.clearTimeout(idle);
		idle = window.setTimeout(off, IDLE_MS);
	};
	// webOS tells the page when it hides the pointer.
	const onCursor = (ev: Event) => {
		const visible = (ev as CustomEvent<{visibility?: boolean}>).detail && (ev as CustomEvent<{visibility?: boolean}>).detail.visibility;
		if (visible === false) off();
	};
	// A real key press means the remote's buttons are in use; synthetic ones (from the wheel) don't count.
	const onKey = (ev: KeyboardEvent) => {
		if (ev.isTrusted) off();
	};
	const onWheel = (ev: WheelEvent) => {
		ev.preventDefault();
		travel += ev.deltaY;
		const now = Date.now();
		const key = wheelStep(travel, now - last);
		if (key === null) return;
		travel = 0;
		last = now;
		wheelAt = now;
		wheelX = ev.clientX;
		wheelY = ev.clientY;
		press(key);
	};
	window.addEventListener('mousemove', onMove, true);
	document.addEventListener('cursorStateChange', onCursor);
	window.addEventListener('keydown', onKey, true);
	window.addEventListener('wheel', onWheel, {passive: false});
	return () => {
		window.removeEventListener('mousemove', onMove, true);
		document.removeEventListener('cursorStateChange', onCursor);
		if (idle !== null) window.clearTimeout(idle);
		window.removeEventListener('keydown', onKey, true);
		window.removeEventListener('wheel', onWheel);
	};
}
