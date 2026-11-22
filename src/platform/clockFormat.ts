/* The TV's clock preference: Settings › General › Time can force 12- or 24-hour, or follow the region
   format ("locale"). Read from luna settingsservice localeInfo: {clock: "12" | "24" | "locale",
   locales: {FMT: "en-GB", UI: …}}. On this TV it's "locale" with en-GB, so 24-hour. */

import {canCallLuna, luna} from './luna';

export interface ClockFormat {
	locale: string;
	hour12: boolean;
}

interface LocaleInfo {
	clock?: string;
	locales?: {FMT?: string; UI?: string};
}

function localeHour12 (locale: string): boolean {
	try {
		return Boolean(new Intl.DateTimeFormat(locale, {hour: 'numeric'}).resolvedOptions().hour12);
	} catch {
		return false;
	}
}

/** Pure: the format for a TV's localeInfo (exported for tests). */
export function formatFor (info: LocaleInfo | null, fallbackLocale: string): ClockFormat {
	const locale = (info && info.locales && (info.locales.FMT || info.locales.UI)) || fallbackLocale;
	const clock = info && info.clock;
	if (clock === '12') return {locale, hour12: true};
	if (clock === '24') return {locale, hour12: false};
	return {locale, hour12: localeHour12(locale)};
}

let current: ClockFormat = formatFor(null, typeof navigator !== 'undefined' ? navigator.language || 'en-GB' : 'en-GB');
const listeners = new Set<() => void>();

export function getClockFormat (): ClockFormat {
	return current;
}

export function subscribeClockFormat (fn: () => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Ask the TV (call at start-up and when the app comes back to the foreground). */
export function refreshClockFormat (): void {
	if (!canCallLuna()) return;
	luna<{settings?: {localeInfo?: LocaleInfo}}>('luna://com.webos.settingsservice/getSystemSettings', {keys: ['localeInfo']}).then((res) => {
		const next = formatFor(res.settings && res.settings.localeInfo || null, current.locale);
		if (next.locale !== current.locale || next.hour12 !== current.hour12) {
			current = next;
			listeners.forEach((fn) => fn());
		}
	}, () => undefined);
}

/** "13:42" or "1:42 pm", as the TV's language writes times. */
export function formatClockTime (d: Date, f: ClockFormat = current): string {
	try {
		return new Intl.DateTimeFormat(f.locale, {hour: 'numeric', minute: '2-digit', hour12: f.hour12}).format(d);
	} catch {
		const h = d.getHours();
		const m = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
		return f.hour12 ? ((h % 12) || 12) + ':' + m + (h < 12 ? ' am' : ' pm') : (h < 10 ? '0' : '') + h + ':' + m;
	}
}
