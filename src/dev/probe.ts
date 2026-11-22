/* Development self-test. Launch with params `{"probe": "http://<pc>:8766/", "server": "https://abs.example"}`
   and run `tools/probe_listener.py` on the PC. The app checks what the TV's web engine allows
   against the Audiobookshelf server and posts the results back. Nothing here runs without `probe`. */

import type {LaunchParams} from '../platform/webos';

interface Check {
	name: string;
	ok: boolean;
	detail: string;
}

function send (url: string, payload: unknown): void {
	const body = JSON.stringify(payload);
	try {
		// A no-cors text/plain POST is a "simple" request: no preflight, and we don't need the reply.
		fetch(url, {method: 'POST', mode: 'no-cors', headers: {'Content-Type': 'text/plain'}, body});
	} catch {
		const img = new Image();
		img.src = url + '?d=' + encodeURIComponent(body);
	}
}

async function attempt (name: string, run: () => Promise<string>): Promise<Check> {
	try {
		return {name, ok: true, detail: await run()};
	} catch (e) {
		const err = e as Error;
		return {name, ok: false, detail: (err && err.name ? err.name + ': ' : '') + String(err && err.message)};
	}
}

export async function runProbe (params: LaunchParams): Promise<void> {
	const target = typeof params.probe === 'string' ? params.probe : '';
	const server = typeof params.server === 'string' ? params.server.replace(/\/+$/, '') : '';
	if (!target || !server) return;

	const checks: Check[] = [];
	checks.push(await attempt('ping (simple GET)', async () => {
		const r = await fetch(server + '/ping');
		return 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 80);
	}));
	checks.push(await attempt('login (JSON POST, preflighted)', async () => {
		const r = await fetch(server + '/login', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({username: 'vox-folio-probe', password: 'not-a-real-password'})
		});
		return 'HTTP ' + r.status;
	}));
	checks.push(await attempt('api with Authorization header', async () => {
		const r = await fetch(server + '/api/libraries', {headers: {Authorization: 'Bearer probe'}});
		return 'HTTP ' + r.status;
	}));

	send(target, {
		app: 'vox-folio',
		userAgent: navigator.userAgent,
		origin: window.location.origin,
		href: window.location.href,
		params: Object.keys(params),
		checks
	});
}

let reporting = false;
let reportTarget = '';

/** Send a diagnostic event to the listener when the app was launched with `probe`. No-op otherwise. */
export function report (data: Record<string, unknown>): void {
	if (reportTarget) send(reportTarget, {app: 'vox-folio', ...data});
}

/** With a `probe` launch param, forward uncaught errors to the listener too. Development only. */
export function installErrorReporter (params: LaunchParams): void {
	const target = typeof params.probe === 'string' ? params.probe : '';
	if (!target || reporting) return;
	reporting = true;
	reportTarget = target;
	window.addEventListener('error', (ev) => {
		send(target, {app: 'vox-folio', kind: 'error', message: ev.message, source: ev.filename, line: ev.lineno, col: ev.colno, stack: ev.error && ev.error.stack});
	});
	window.addEventListener('unhandledrejection', (ev) => {
		const reason = ev.reason as Error | undefined;
		send(target, {app: 'vox-folio', kind: 'unhandledrejection', message: String(reason && reason.message || reason), stack: reason && reason.stack});
	});
	send(target, {app: 'vox-folio', kind: 'hello', userAgent: navigator.userAgent, innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio, screen: [window.screen.width, window.screen.height], rootTransform: (document.getElementById('root') || document.body).style.transform});
}

/** Counts animation frames until stopped. Development only (the `perf` launch param). */
function startFrameMeter (): () => {fps: number; worstFrameMs: number; stutters: number; seconds: number} {
	let frames = 0;
	let worst = 0;
	let stutters = 0;
	let last = performance.now();
	const start = last;
	let running = true;
	const tick = (t: number) => {
		if (!running) return;
		const dt = t - last;
		last = t;
		frames += 1;
		if (dt > worst) worst = dt;
		if (dt > 50) stutters += 1;
		window.requestAnimationFrame(tick);
	};
	window.requestAnimationFrame(tick);
	return () => {
		running = false;
		const seconds = (performance.now() - start) / 1000;
		return {fps: Math.round(frames / seconds), worstFrameMs: Math.round(worst), stutters, seconds: Math.round(seconds)};
	};
}

const KEY_NAMES: Record<string, number> = {
	up: 38, down: 40, left: 37, right: 39, ok: 13, back: 461,
	play: 415, pause: 19, stop: 413, ff: 417, rw: 412, chup: 33, chdown: 34,
	red: 403, green: 404, yellow: 405, blue: 406
};

function press (code: number): void {
	['keydown', 'keyup'].forEach((type) => {
		const ev = new KeyboardEvent(type, {bubbles: true, cancelable: true});
		Object.defineProperty(ev, 'keyCode', {get: () => code});
		Object.defineProperty(ev, 'which', {get: () => code});
		(document.activeElement || document.body).dispatchEvent(ev);
	});
}

/** Development: replay remote presses from a `keys` launch param ("down,down,ok,wait,back").
    Only runs alongside `probe`, so a normal launch can never trigger it. */
export function replayKeys (params: LaunchParams, onDone?: () => void): void {
	if (typeof params.probe !== 'string' || typeof params.keys !== 'string') return;
	const steps = params.keys.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
	// With `perf`, measure frames while the keys play: fps, worst frame and stutters (frames > 50 ms).
	const meter = params.perf ? startFrameMeter() : null;
	let i = 0;
	const next = () => {
		if (i >= steps.length) {
			if (meter) report({kind: 'perf', during: params.keys, ...meter()});
			if (onDone) onDone();
			return;
		}
		const step = steps[i++];
		if (step !== 'wait' && KEY_NAMES[step]) press(KEY_NAMES[step]);
		window.setTimeout(() => {
			// Where focus landed, so key-driven tests can be read without screenshots.
			const el = document.activeElement as HTMLElement | null;
			report({kind: 'key', key: step, focus: el ? (el.getAttribute('data-focus-key') || el.getAttribute('aria-label') || el.className) : null});
			next();
		}, step === 'wait' ? 2500 : 700);
	};
	window.setTimeout(next, 1500);
}

/** Development: `devLogin` = {server, username, password}, honoured only alongside `probe`. */
export function devLogin (params: LaunchParams): {server: string; username: string; password: string} | null {
	let d = params.devLogin as {server?: unknown; username?: unknown; password?: unknown} | string | undefined;
	if (typeof d === 'string') {
		// From a desktop browser's query string.
		try {
			d = JSON.parse(d) as {server?: unknown; username?: unknown; password?: unknown};
		} catch {
			return null;
		}
	}
	if (typeof params.probe !== 'string' || !d || typeof d === 'string' || typeof d.server !== 'string' || typeof d.username !== 'string' || typeof d.password !== 'string') return null;
	return {server: d.server, username: d.username, password: d.password};
}
