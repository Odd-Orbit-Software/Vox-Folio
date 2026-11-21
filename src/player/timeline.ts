/* Pure book-time arithmetic. "Book time" is seconds from the start of the whole book at 1×; it's what
   Audiobookshelf stores, so positions line up with the phone at any playback speed. */

import type {AudioTrack, Chapter} from '../abs/types';

export function clamp (n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

export interface TrackPosition {
	index: number;
	/** Seconds into that file. */
	offset: number;
}

/** Which file holds book time `t`, and where in it. Tracks must be sorted by startOffset. */
export function locate (tracks: AudioTrack[], t: number): TrackPosition {
	if (!tracks.length) return {index: 0, offset: 0};
	let index = 0;
	for (let i = 0; i < tracks.length; i++) {
		if (tracks[i].startOffset <= t) index = i;
		else break;
	}
	const track = tracks[index];
	return {index, offset: clamp(t - track.startOffset, 0, Math.max(0, track.duration))};
}

export function bookDuration (tracks: AudioTrack[]): number {
	if (!tracks.length) return 0;
	const last = tracks[tracks.length - 1];
	return last.startOffset + last.duration;
}

/** Index of the chapter containing `t`, or -1 when the book has no chapters. */
export function chapterIndexAt (chapters: Chapter[], t: number): number {
	if (!chapters.length) return -1;
	let index = 0;
	for (let i = 0; i < chapters.length; i++) {
		if (chapters[i].start <= t + 0.001) index = i;
		else break;
	}
	return index;
}

/** Previous-chapter press: restart this chapter, or go to the one before if we're within its first few seconds. */
export function previousChapterTarget (chapters: Chapter[], t: number, restartWindow = 3): number | null {
	const i = chapterIndexAt(chapters, t);
	if (i < 0) return null;
	if (t - chapters[i].start > restartWindow || i === 0) return chapters[i].start;
	return chapters[i - 1].start;
}

export function nextChapterTarget (chapters: Chapter[], t: number): number | null {
	const i = chapterIndexAt(chapters, t);
	if (i < 0 || i + 1 >= chapters.length) return null;
	return chapters[i + 1].start;
}

export const MIN_RATE = 0.5;
/** The TV's media service keeps sound (pitch-corrected) between these; we don't offer more. */
export const MAX_RATE = 2;
export const RATE_STEP = 0.05;
export const RATE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** One 0.05× step, within 0.5×–2.0×. */
export function stepRate (rate: number, direction: 1 | -1): number {
	const next = Math.round((rate + direction * RATE_STEP) * 100) / 100;
	return clamp(next, MIN_RATE, MAX_RATE);
}

export function formatRate (rate: number): string {
	// 1 → "1.0×", 1.25 → "1.25×", 1.3 → "1.3×"
	return (Math.round(rate * 100) / 100).toFixed(2).replace(/0$/, '') + '×';
}

/** Scrubber step while Left/Right is held: 10 s, then 1 min, then 5 min. */
export function seekStepForRepeat (repeat: number): number {
	if (repeat < 6) return 10;
	if (repeat < 18) return 60;
	return 300;
}

function pad (n: number): string {
	return n < 10 ? '0' + n : String(n);
}

/** 4:19:06, or 12:40 under an hour. */
export function formatClock (seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return h ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
}

/** 6h 12m, 48m, 14s. */
export function formatDuration (seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (h) return h + 'h ' + pad(m) + 'm';
	if (m) return m + 'm';
	return s + 's';
}
