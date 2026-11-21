import Spotlight from '@enact/spotlight';
import SpotlightRootDecorator from '@enact/spotlight/SpotlightRootDecorator';
import {useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';

import appinfo from '../../webos-meta/appinfo.json';
import {AbsClient, login, normaliseServerUrl} from '../abs/client';
import type {Credentials} from '../abs/client';
import {deviceId, loadCredentials, saveCredentials} from '../abs/store';
import {IdleWatcher} from '../app/idle';
import {decideLaunch} from '../app/launch';
import {Screensaver} from '../components/Screensaver';
import {Toasts} from '../components/Toasts';
import type {Toast} from '../components/Toasts';
import {devLogin, installErrorReporter, replayKeys, report, runProbe} from '../dev/probe';
import {idlePlayerState, PlayerEngine} from '../player/engine';
import type {PlayerState} from '../player/engine';
import {controlTvScreensaver} from '../platform/screensaver';
import {activate, exitApp, isBackKey, Keys, onRelaunch, readLaunchParams, requestedItemId} from '../platform/webos';
import About from '../screens/About';
import Home from '../screens/Home';
import Player from '../screens/Player';
import Setup from '../screens/Setup';

export type Screen = 'setup' | 'home' | 'player' | 'about';

/* One <audio> element for the app's lifetime. It must be in the document: on webOS a detached media
   element decodes and reports progress but its sound never reaches the TV's speakers. */
function createAudio (): HTMLAudioElement {
	const el = document.createElement('audio');
	el.setAttribute('aria-hidden', 'true');
	el.style.display = 'none';
	document.body.appendChild(el);
	return el;
}

const audio = typeof window !== 'undefined' ? createAudio() : (null as unknown as HTMLAudioElement);

/** After this long on our screensaver with nothing playing, let the TV's own power-saving take over. */
const HAND_BACK_AFTER_MS = 60 * 60 * 1000;

/** The screensaver starts when the TV asks for its own. Development: `idle` (seconds) alongside
    `probe` adds a timer of our own so it can be tested without waiting for the TV. */
function idleTimeoutMs (): number {
	const params = readLaunchParams();
	const override = typeof params.probe === 'string' ? Number(params.idle) : NaN;
	return override > 0 ? override * 1000 : 0;
}

// Created before React and Spotlight attach their key handlers, so it sees every press first.
const idle = typeof window !== 'undefined' ? new IdleWatcher(idleTimeoutMs()) : (null as unknown as IdleWatcher);
const subscribeIdle = (fn: () => void) => idle.subscribe(fn);
const getIdle = () => idle.asleep;

const device = {
	deviceId: deviceId(),
	clientName: 'Vox Folio',
	clientVersion: appinfo.version,
	manufacturer: 'LG',
	model: 'webOS TV'
};

function usePlayer (engine: PlayerEngine | null): PlayerState {
	const subscribe = useCallback((fn: () => void) => (engine ? engine.subscribe(fn) : () => undefined), [engine]);
	const get = useCallback(() => (engine ? engine.getState() : idlePlayerState), [engine]);
	return useSyncExternalStore(subscribe, get);
}

interface Session {
	creds: Credentials;
	client: AbsClient;
	engine: PlayerEngine;
}

function makeSession (creds: Credentials): Session {
	const client = new AbsClient(creds, saveCredentials);
	return {creds, client, engine: new PlayerEngine(client, audio, device)};
}

function App () {
	const [session, setSession] = useState<Session | null>(() => {
		const saved = loadCredentials();
		return saved ? makeSession(saved) : null;
	});
	const [screen, setScreen] = useState<Screen>(() => (session ? 'home' : 'setup'));
	const [pendingItemId, setPendingItemId] = useState<string | null>(null);
	const [authMessage, setAuthMessage] = useState('');
	const [toasts, setToasts] = useState<Toast[]>([]);
	const toastId = useRef(0);

	const client = session ? session.client : null;
	const engine = session ? session.engine : null;
	const creds = session ? session.creds : null;
	const player = usePlayer(engine);
	const asleep = useSyncExternalStore(subscribeIdle, getIdle);

	// The engine shares the one <audio> element; detach the old one when the account changes.
	useEffect(() => () => {
		if (engine) engine.dispose();
	}, [engine]);

	// Latest values for event handlers that are registered once.
	const live = useRef<{session: Session | null; screen: Screen}>({session, screen});
	useLayoutEffect(() => {
		live.current = {session, screen};
	});

	const pushToast = useCallback((text: string) => {
		toastId.current += 1;
		const id = toastId.current;
		setToasts((t) => t.concat({id, text}));
		window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
	}, []);

	const signOut = useCallback((message = '') => {
		const current = live.current.session;
		if (current) current.engine.close();
		saveCredentials(null);
		setSession(null);
		setAuthMessage(message);
		setScreen('setup');
	}, []);

	const openBook = useCallback((target: PlayerEngine, itemId: string) => {
		const previous = target.getState();
		if (previous.itemId && previous.itemId !== itemId && previous.title) {
			pushToast('Saved your place in ' + previous.title);
		}
		setScreen('player');
		target.open(itemId);
	}, [pushToast]);

	/** Every title request, cold or warm, comes through here. */
	const handleRequest = useCallback((itemId: string | null) => {
		const current = live.current.session;
		const action = decideLaunch(itemId, {
			signedIn: Boolean(current),
			currentItemId: current ? current.engine.getState().itemId : null
		});
		switch (action.type) {
			case 'defer':
				setPendingItemId(action.itemId);
				setScreen('setup');
				break;
			case 'showPlayer':
				setScreen('player');
				if (current) current.engine.catchUp();
				break;
			case 'open':
				if (current) openBook(current.engine, action.itemId);
				break;
			default:
				break;
		}
	}, [openBook]);

	const onSignedIn = useCallback((c: Credentials) => {
		saveCredentials(c);
		const next = makeSession(c);
		setSession(next);
		setAuthMessage('');
		if (pendingItemId) {
			setPendingItemId(null);
			openBook(next.engine, pendingItemId);
		} else {
			setScreen('home');
		}
	}, [pendingItemId, openBook]);
	const onSignedInRef = useRef(onSignedIn);
	useLayoutEffect(() => {
		onSignedInRef.current = onSignedIn;
	});

	// Cold launch and relaunches.
	useEffect(() => {
		const params = readLaunchParams();
		installErrorReporter(params);
		runProbe(params);
		const dev = devLogin(params);
		if (dev && !live.current.session) {
			login(normaliseServerUrl(dev.server), dev.username, dev.password).then((c) => {
				onSignedInRef.current(c);
				replayKeys(params);
			}, () => undefined);
		} else {
			replayKeys(params);
		}
		handleRequest(requestedItemId(params));
		return onRelaunch((p) => {
			installErrorReporter(p);
			runProbe(p);
			handleRequest(requestedItemId(p));
			replayKeys(p);
			activate();
		});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Engine notices become toasts; an expired sign-in goes back to setup, keeping the book.
	useEffect(() => {
		if (!engine) return undefined;
		let lastNotice = 0;
		let lastSyncError: string | null = null;
		let lastStatus = '';
		return engine.subscribe((s) => {
			if (s.status !== lastStatus) {
				lastStatus = s.status;
				report({kind: 'audio', status: s.status, muted: audio.muted, volume: audio.volume, paused: audio.paused, readyState: audio.readyState, networkState: audio.networkState, rate: audio.playbackRate, inDocument: document.body.contains(audio), mediaError: audio.error ? audio.error.code : null, mediaId: (audio as unknown as {mediaId?: string}).mediaId || null});
			}
			if (s.syncError !== lastSyncError) {
				lastSyncError = s.syncError;
				if (s.syncError) report({kind: 'syncError', detail: s.syncError, position: s.position});
			}
			if (s.notice && s.notice.id !== lastNotice) {
				lastNotice = s.notice.id;
				pushToast(s.notice.text);
			}
			if (s.status === 'error' && s.error && s.error.kind === 'auth' && s.itemId) {
				setPendingItemId(s.itemId);
				signOut('Your sign-in expired. Sign in again to keep listening.');
			}
		});
	}, [engine, pushToast, signOut]);

	// Save the position when the TV hides the app (Home button, input switch, power off).
	useEffect(() => {
		const onVisibility = () => {
			if (!document.hidden) idle.wake();
			const current = live.current.session;
			if (!current) return;
			if (document.hidden) current.engine.flush();
			else current.engine.catchUp();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, []);

	// The TV asks before starting its own screensaver. While we're showing, say no and put up ours;
	// after a long stretch on ours with nothing playing, let the TV's power-saving take over.
	useEffect(() => controlTvScreensaver(() => {
		if (document.hidden) return false;
		const current = live.current.session;
		const playing = Boolean(current && current.engine.getState().status === 'playing');
		if (idle.asleep && !playing && Date.now() - idle.asleepSince > HAND_BACK_AFTER_MS) {
			report({kind: 'tvScreensaver', decision: 'allow'});
			return false;
		}
		report({kind: 'tvScreensaver', decision: 'block', ownAlreadyShowing: idle.asleep});
		idle.sleep();
		return true;
	}), []);

	// Back and the remote's media keys. Screens handle their own panels and stop propagation first.
	useEffect(() => {
		const onKeyDown = (ev: KeyboardEvent) => {
			const {session: current, screen: s} = live.current;
			const e = current ? current.engine : null;
			const code = ev.keyCode;
			const loaded = Boolean(e && e.getState().itemId && e.getState().status !== 'error');
			if (isBackKey(code)) {
				ev.preventDefault();
				if (s === 'player' || s === 'about') setScreen(current ? 'home' : 'setup');
				else if (s === 'home' && loaded) setScreen('player');
				else exitApp();
				return;
			}
			if (!e || !loaded) return;
			if (code === Keys.PLAY) e.play();
			else if (code === Keys.PAUSE) e.toggle();
			else if (code === Keys.REWIND) e.skip(-30);
			else if (code === Keys.FAST_FORWARD) e.skip(30);
			else if (code === Keys.STOP) e.pause();
			else return;
			ev.preventDefault();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	// Close the session cleanly if the page is torn down.
	useEffect(() => {
		const onUnload = () => {
			const current = live.current.session;
			if (current) current.engine.close();
		};
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	}, []);

	useEffect(() => {
		Spotlight.setPointerMode(false);
	}, [screen]);


	return (
		<div className="vf-stage">
			{screen === 'setup' && (
				<Setup
					initialServer={creds ? creds.serverUrl : ''}
					message={authMessage}
					pendingItemId={pendingItemId}
					onSignedIn={onSignedIn}
				/>
			)}
			{screen === 'home' && client && (
				<Home
					client={client}
					player={player}
					onOpen={handleRequest}
					onShowPlayer={() => setScreen('player')}
					onAbout={() => setScreen('about')}
				/>
			)}
			{screen === 'player' && engine && client && (
				<Player
					engine={engine}
					player={player}
					onHome={() => setScreen('home')}
					onRetry={() => player.itemId && openBook(engine, player.itemId)}
				/>
			)}
			{screen === 'about' && (
				<About
					version={appinfo.version}
					creds={creds}
					onBack={() => setScreen(client ? 'home' : 'setup')}
					onSignOut={() => signOut('')}
				/>
			)}
			<Toasts toasts={toasts} />
			{asleep && <Screensaver player={player} />}
		</div>
	);
}

export default SpotlightRootDecorator(App);
