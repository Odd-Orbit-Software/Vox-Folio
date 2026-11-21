/* The listening screensaver's on/off state. It normally starts when the TV asks to start its own
   (see platform/screensaver.ts); a timeout of 0 means no timer of our own. A positive timeout is a
   development aid.

   Its listeners are installed when this module loads, before React and Spotlight add theirs, and in the
   capture phase, so the press that wakes the screensaver is swallowed: it doesn't also pause, skip or
   move focus (docs/plans/ux.md: "Any key wakes it without acting on that key"). */

type Listener = (asleep: boolean) => void;

export class IdleWatcher {
	private asleepFlag = false;
	private sleptAt = 0;
	private lastActivity = Date.now();
	private swallowKeyUp = false;
	private timer: number | null = null;
	private listeners = new Set<Listener>();

	constructor (private timeoutMs: number, private readonly target: Window = window) {
		target.addEventListener('keydown', this.onKeyDown, true);
		target.addEventListener('keyup', this.onKeyUp, true);
		target.addEventListener('mousemove', this.onPointer, true);
		target.addEventListener('mousedown', this.onPointer, true);
		target.addEventListener('wheel', this.onPointer, true);
		this.schedule();
	}

	get asleep (): boolean {
		return this.asleepFlag;
	}

	/** When the screensaver started, or 0 while awake. */
	get asleepSince (): number {
		return this.asleepFlag ? this.sleptAt : 0;
	}

	subscribe (fn: Listener): () => void {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	setTimeout (ms: number): void {
		this.timeoutMs = ms;
		this.schedule();
	}

	/** Show the screensaver now (e.g. when the TV asks to start its own). */
	sleep (): void {
		if (this.asleepFlag) return;
		this.asleepFlag = true;
		this.sleptAt = Date.now();
		this.clear();
		this.listeners.forEach((fn) => fn(true));
	}

	wake (): void {
		this.lastActivity = Date.now();
		if (this.asleepFlag) {
			this.asleepFlag = false;
			this.sleptAt = 0;
			this.listeners.forEach((fn) => fn(false));
		}
		this.schedule();
	}

	dispose (): void {
		this.clear();
		this.target.removeEventListener('keydown', this.onKeyDown, true);
		this.target.removeEventListener('keyup', this.onKeyUp, true);
		this.target.removeEventListener('mousemove', this.onPointer, true);
		this.target.removeEventListener('mousedown', this.onPointer, true);
		this.target.removeEventListener('wheel', this.onPointer, true);
		this.listeners.clear();
	}

	private clear (): void {
		if (this.timer !== null) {
			this.target.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private schedule (): void {
		this.clear();
		if (this.asleepFlag || this.timeoutMs <= 0) return;
		const due = Math.max(0, this.lastActivity + this.timeoutMs - Date.now());
		this.timer = this.target.setTimeout(() => this.sleep(), due);
	}

	private onKeyDown = (ev: KeyboardEvent): void => {
		if (this.asleepFlag) {
			ev.preventDefault();
			ev.stopImmediatePropagation();
			this.swallowKeyUp = true;
			this.wake();
			return;
		}
		this.lastActivity = Date.now();
		this.schedule();
	};

	private onKeyUp = (ev: KeyboardEvent): void => {
		if (this.swallowKeyUp) {
			this.swallowKeyUp = false;
			ev.preventDefault();
			ev.stopImmediatePropagation();
		}
	};

	private onPointer = (ev: Event): void => {
		if (this.asleepFlag && ev.type !== 'mousemove') {
			ev.preventDefault();
			ev.stopImmediatePropagation();
		}
		this.wake();
	};
}
