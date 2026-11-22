import {useEffect, useState, useSyncExternalStore} from 'react';

import {formatClockTime, getClockFormat, subscribeClockFormat} from '../platform/clockFormat';

function pad (n: number): string {
	return n < 10 ? '0' + n : String(n);
}

/** 24-hour "HH:MM", as Polaris shows it. */
export function formatTime (d: Date): string {
	return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** The current time, re-rendered on each minute boundary. Empty until the first tick (reading the
    clock during render isn't pure). */
export function useClock (): string {
	const [text, setText] = useState('');
	// Re-render (and re-format) when the TV's 12/24-hour preference is read or changes.
	const format = useSyncExternalStore(subscribeClockFormat, getClockFormat);
	useEffect(() => {
		let timer = 0;
		const tick = () => {
			const now = new Date();
			setText(formatClockTime(now));
			timer = window.setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
		};
		timer = window.setTimeout(tick, 0);
		return () => window.clearTimeout(timer);
	}, [format]);
	return text;
}

/** The hour (0–23), refreshed with the clock; -1 until the first tick. */
export function useHour (): number {
	const text = useClock();
	// Read the hour from the clock itself (the text may be "1:42 am"), once it has ticked.
	return text ? new Date().getHours() : -1;
}

export function Clock ({className = ''}: {className?: string}) {
	const text = useClock();
	return <time className={'vf-clock ' + className}>{text}</time>;
}
