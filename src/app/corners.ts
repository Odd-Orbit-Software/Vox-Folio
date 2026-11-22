/* Easter egg, "Perfect corner": the drifting screensaver is the DVD logo's spiritual heir, so when the
   card lands exactly in a corner, celebrate. The card's position is worked out from the same timing the
   CSS animations use (two alternating linear drifts), so no layout reads are needed. */

export const DRIFT = {xRange: 1004, yRange: 668, xSeconds: 47, ySeconds: 31, xDelay: -19, yDelay: -11};

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** 0→1→0 over two durations: an `alternate` linear animation's progress at animation time `tau`. */
export function triangle (tau: number, seconds: number): number {
	const period = 2 * seconds;
	const p = ((tau % period) + period) % period;
	return p <= seconds ? p / seconds : 2 - p / seconds;
}

/** Card offset in px, `t` seconds after the drift started, for the given timing. */
export function driftAt (t: number, d: typeof DRIFT): {x: number; y: number} {
	return {
		x: triangle(t - d.xDelay, d.xSeconds) * d.xRange,
		y: triangle(t - d.yDelay, d.ySeconds) * d.yRange
	};
}

/** Which corner the card is in, within `tolerance` px on both axes, or null. */
export function cornerAt (pos: {x: number; y: number}, d: typeof DRIFT, tolerance = 6): Corner | null {
	const left = pos.x <= tolerance;
	const right = pos.x >= d.xRange - tolerance;
	const top = pos.y <= tolerance;
	const bottom = pos.y >= d.yRange - tolerance;
	if ((left || right) && (top || bottom)) return ((top ? 't' : 'b') + (left ? 'l' : 'r')) as Corner;
	return null;
}

const KEY = 'voxfolio.perfectCorners';

export function perfectCorners (): number {
	try {
		return Number(window.localStorage.getItem(KEY)) || 0;
	} catch {
		return 0;
	}
}

export function countPerfectCorner (): number {
	const n = perfectCorners() + 1;
	try {
		window.localStorage.setItem(KEY, String(n));
	} catch {
		// Not remembered this time.
	}
	return n;
}
