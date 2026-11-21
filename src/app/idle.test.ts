import {IdleWatcher} from './idle';

function key (type: 'keydown' | 'keyup', keyCode: number): KeyboardEvent {
	const ev = new KeyboardEvent(type, {bubbles: true, cancelable: true});
	Object.defineProperty(ev, 'keyCode', {get: () => keyCode});
	return ev;
}

beforeEach(() => {
	jest.useFakeTimers({now: 0});
});

afterEach(() => {
	jest.useRealTimers();
});

test('falls asleep after the timeout with no input', () => {
	const idle = new IdleWatcher(1000);
	const seen: boolean[] = [];
	idle.subscribe((a) => seen.push(a));
	jest.advanceTimersByTime(999);
	expect(idle.asleep).toBe(false);
	jest.advanceTimersByTime(1);
	expect(idle.asleep).toBe(true);
	expect(seen).toEqual([true]);
	idle.dispose();
});

test('key presses push the timeout back', () => {
	const idle = new IdleWatcher(1000);
	jest.advanceTimersByTime(800);
	window.dispatchEvent(key('keydown', 39));
	jest.advanceTimersByTime(800);
	expect(idle.asleep).toBe(false);
	jest.advanceTimersByTime(200);
	expect(idle.asleep).toBe(true);
	idle.dispose();
});

test('the waking press is swallowed, keydown and keyup', () => {
	const idle = new IdleWatcher(1000);
	const reached: string[] = [];
	const later = (ev: Event) => reached.push(ev.type);
	window.addEventListener('keydown', later);
	window.addEventListener('keyup', later);
	idle.sleep();

	const down = key('keydown', 415);
	document.body.dispatchEvent(down);
	document.body.dispatchEvent(key('keyup', 415));
	expect(idle.asleep).toBe(false);
	expect(down.defaultPrevented).toBe(true);
	expect(reached).toEqual([]);

	// The next press acts normally.
	document.body.dispatchEvent(key('keydown', 415));
	expect(reached).toEqual(['keydown']);

	window.removeEventListener('keydown', later);
	window.removeEventListener('keyup', later);
	idle.dispose();
});

test('sleep() shows it straight away and records when', () => {
	const idle = new IdleWatcher(60000);
	jest.setSystemTime(5000);
	idle.sleep();
	expect(idle.asleep).toBe(true);
	expect(idle.asleepSince).toBe(5000);
	idle.wake();
	expect(idle.asleepSince).toBe(0);
	idle.dispose();
});

test('a timeout of 0 never sleeps on its own', () => {
	const idle = new IdleWatcher(0);
	jest.advanceTimersByTime(24 * 60 * 60 * 1000);
	expect(idle.asleep).toBe(false);
	idle.sleep();
	expect(idle.asleep).toBe(true);
	idle.dispose();
});
