import Spotlight from '@enact/spotlight';
import SpotlightRootDecorator from '@enact/spotlight/SpotlightRootDecorator';
import {useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';

import appinfo from '../../webos-meta/appinfo.json';
import {AbsClient, login, normaliseServerUrl} from '../abs/client';
import type {Credentials} from '../abs/client';
import {deviceId, loadAutoplay, loadCredentials, saveAutoplay, saveCredentials} from '../abs/store';
import {IdleWatcher} from '../app/idle';
import {decideLaunch} from '../app/launch';
import {pop, push, reset} from '../app/routes';
import type {Entry, Route} from '../app/routes';
import {nextInSeries} from '../app/series';
import type {SeriesEntry} from '../app/series';
import {Screensaver} from '../components/Screensaver';
import {Toasts} from '../components/Toasts';
import type {Toast} from '../components/Toasts';
import {devLogin, installErrorReporter, replayKeys, report, runProbe} from '../dev/probe';
import {idlePlayerState, PlayerEngine} from '../player/engine';
import type {PlayerState} from '../player/engine';
import {controlTvScreensaver} from '../platform/screensaver';
import {activate, exitApp, isBackKey, Keys, onRelaunch, readLaunchParams, requestedItemId} from '../platform/webos';
import About from '../screens/About';
import Details from '../screens/Details';
import Home from '../screens/Home';
import Library from '../screens/Library';
import Player from '../screens/Player';
import SeriesDetail from '../screens/SeriesDetail';
import SeriesList from '../screens/SeriesList';
import Setup from '../screens/Setup';

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

interface UpNext {
	forItemId: string;
	next: SeriesEntry | null;
}

function App () {
	const [session, setSession] = useState<Session | null>(() => {
		const saved = loadCredentials();
		return saved ? makeSession(saved) : null;
	});
	const [stack, setStack] = useState<Entry[]>(() => reset(session ? {name: 'home'} : {name: 'setup'}));
	const [pendingItemId, setPendingItemId] = useState<string | null>(null);
	const [authMessage, setAuthMessage] = useState('');
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [autoplay, setAutoplay] = useState(loadAutoplay);
	const [upNext, setUpNext] = useState<UpNext | null>(null);
	// Books whose Up Next the listener turned down ("Not now"), so autoplay skips them.
	const [declined, setDeclined] = useState<string[]>([]);
	const toastId = useRef(0);

	const client = session ? session.client : null;
	const engine = session ? session.engine : null;
	const creds = session ? session.creds : null;
	const player = usePlayer(engine);
	const asleep = useSyncExternalStore(subscribeIdle, getIdle);
	const top = stack[stack.length - 1];
	const route = top.route;

	// The engine shares the one <audio> element; detach the old one when the account changes.
	useEffect(() => () => {
		if (engine) engine.dispose();
	}, [engine]);

	// Latest values for event handlers that are registered once.
	const live = useRef({session, route, stackDepth: stack.length, autoplay, upNext, declined});
	useLayoutEffect(() => {
		live.current = {session, route, stackDepth: stack.length, autoplay, upNext, declined};
	});

	const pushToast = useCallback((text: string) => {
		toastId.current += 1;
		const id = toastId.current;
		setToasts((t) => t.concat({id, text}));
		window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
	}, []);

	const go = useCallback((next: Route, fromKey?: string | null) => setStack((st) => push(st, next, fromKey)), []);

	const showPlayer = useCallback((fromKey?: string | null) => {
		setStack((st) => (st[st.length - 1].route.name === 'player' ? st : push(st, {name: 'player'}, fromKey)));
	}, []);

	const signOut = useCallback((message = '') => {
		const current = live.current.session;
		if (current) current.engine.close();
		saveCredentials(null);
		setSession(null);
		setAuthMessage(message);
		setStack(reset({name: 'setup'}));
	}, []);

	const openBook = useCallback((target: PlayerEngine, itemId: string, opts: {fromKey?: string | null; startAt?: number} = {}) => {
		const previous = target.getState();
		if (previous.itemId && previous.itemId !== itemId && previous.title) {
			pushToast('Saved your place in ' + previous.title);
		}
		showPlayer(opts.fromKey);
		target.open(itemId, true, opts.startAt);
	}, [pushToast, showPlayer]);

	/** Every title request from outside (Polaris, a relaunch) comes through here. */
	const handleRequest = useCallback((itemId: string | null) => {
		const current = live.current.session;
		const action = decideLaunch(itemId, {
			signedIn: Boolean(current),
			currentItemId: current ? current.engine.getState().itemId : null
		});
		switch (action.type) {
			case 'defer':
				setPendingItemId(action.itemId);
				setStack(reset({name: 'setup'}));
				break;
			case 'showPlayer':
				showPlayer();
				if (current) current.engine.catchUp();
				break;
			case 'open':
				if (current) {
					// Back from a launched book goes Home, whatever was open before.
					setStack(push(reset({name: 'home'}), {name: 'player'}));
					openBook(current.engine, action.itemId);
				}
				break;
			default:
				break;
		}
	}, [openBook, showPlayer]);

	const onSignedIn = useCallback((c: Credentials) => {
		saveCredentials(c);
		const next = makeSession(c);
		setSession(next);
		setAuthMessage('');
		setStack(reset({name: 'home'}));
		if (pendingItemId) {
			setPendingItemId(null);
			openBook(next.engine, pendingItemId);
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

	// What comes next in the series for the book that's loaded (the Up Next card and autoplay).
	useEffect(() => {
		const itemId = player.itemId;
		const series = player.series;
		const libraryId = player.libraryId;
		if (!client || !itemId || !series || !libraryId) return undefined;
		let cancelled = false;
		client.seriesBooks(libraryId, series.id).then((books) => {
			if (!cancelled) setUpNext({forItemId: itemId, next: nextInSeries(books, itemId, series.id, series.name)});
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, player.itemId, player.series, player.libraryId]);

	const playNext = useCallback(() => {
		const {session: current, upNext: un} = live.current;
		if (!current || !un || !un.next) return;
		const finishedId = un.forItemId;
		current.client.setFinished(finishedId, true).catch(() => undefined);
		pushToast('Up next: ' + un.next.item.media.metadata.title);
		openBook(current.engine, un.next.item.id);
	}, [openBook, pushToast]);

	// Engine events: notices become toasts, the end of a book is saved as finished and (with autoplay)
	// starts the next one, and an expired sign-in goes back to setup keeping the book.
	useEffect(() => {
		if (!engine) return undefined;
		let lastNotice = 0;
		let lastSyncError: string | null = null;
		let lastStatus = '';
		return engine.subscribe((s) => {
			if (s.status !== lastStatus) {
				const was = lastStatus;
				lastStatus = s.status;
				report({kind: 'audio', status: s.status, muted: audio.muted, volume: audio.volume, paused: audio.paused, readyState: audio.readyState, networkState: audio.networkState, rate: audio.playbackRate, inDocument: document.body.contains(audio), mediaError: audio.error ? audio.error.code : null, mediaId: (audio as unknown as {mediaId?: string}).mediaId || null});
				if (s.status === 'ended' && was !== 'ended' && s.itemId) {
					const {session: current, autoplay: on, upNext: un, declined: no} = live.current;
					const hasNext = Boolean(un && un.forItemId === s.itemId && un.next);
					if (on && hasNext && no.indexOf(s.itemId) === -1) {
						playNext();
					} else if (current) {
						current.client.setFinished(s.itemId, true).catch(() => undefined);
						pushToast('Finished ' + s.title);
					}
				}
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
	}, [engine, pushToast, signOut, playNext]);

	const toggleAutoplay = useCallback(() => {
		setAutoplay((on) => {
			saveAutoplay(!on);
			pushToast(on ? 'Series autoplay off' : 'Series autoplay on');
			return !on;
		});
	}, [pushToast]);

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
			const {session: current, route: r, stackDepth} = live.current;
			const e = current ? current.engine : null;
			const code = ev.keyCode;
			const loaded = Boolean(e && e.getState().itemId && e.getState().status !== 'error');
			if (isBackKey(code)) {
				ev.preventDefault();
				if (r.name === 'setup') exitApp();
				else if (stackDepth > 1) setStack(pop);
				else if (r.name !== 'home') setStack(reset({name: 'home'}));
				else if (loaded) setStack((st) => push(st, {name: 'player'}));
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
	}, [route]);

	const onTab = (name: Route['name']) => {
		if (name === 'home' || name === 'library' || name === 'series') setStack(reset({name} as Route));
	};
	const onAbout = () => go({name: 'about'}, 'rail:about');
	const nextForPlayer = upNext && upNext.forItemId === player.itemId && upNext.next && autoplay && player.itemId && declined.indexOf(player.itemId) === -1 ? upNext.next : null;

	return (
		<div className="vf-stage">
			{route.name === 'setup' && (
				<Setup
					initialServer={creds ? creds.serverUrl : ''}
					message={authMessage}
					pendingItemId={pendingItemId}
					onSignedIn={onSignedIn}
				/>
			)}
			{route.name === 'home' && client && engine && (
				<Home
					client={client}
					player={player}
					restoreKey={top.focusKey}
					onPlay={(itemId, fromKey) => {
						if (player.itemId === itemId && player.status !== 'error') showPlayer(fromKey);
						else openBook(engine, itemId, {fromKey});
					}}
					onDetails={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
					onShowPlayer={(fromKey) => showPlayer(fromKey)}
					onTab={onTab}
					onAbout={onAbout}
				/>
			)}
			{route.name === 'library' && client && (
				<Library
					client={client}
					restoreKey={top.focusKey}
					onTab={onTab}
					onAbout={onAbout}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
				/>
			)}
			{route.name === 'series' && client && (
				<SeriesList
					client={client}
					restoreKey={top.focusKey}
					onTab={onTab}
					onAbout={onAbout}
					onOpenSeries={(libraryId, series, fromKey) => go({name: 'seriesDetail', libraryId, seriesId: series.id, seriesName: series.name}, fromKey)}
				/>
			)}
			{route.name === 'seriesDetail' && client && (
				<SeriesDetail
					key={route.seriesId}
					client={client}
					libraryId={route.libraryId}
					seriesId={route.seriesId}
					seriesName={route.seriesName}
					focusItemId={route.focusItemId}
					restoreKey={top.focusKey}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
				/>
			)}
			{route.name === 'details' && client && engine && (
				<Details
					key={route.itemId}
					client={client}
					itemId={route.itemId}
					player={player}
					autoplay={autoplay}
					restoreKey={top.focusKey}
					onToggleAutoplay={toggleAutoplay}
					onPlay={(itemId, startAt) => openBook(engine, itemId, {fromKey: 'play', startAt})}
					onShowPlayer={() => showPlayer('play')}
					onOpenSeries={(libraryId, series, fromKey) => go({name: 'seriesDetail', libraryId, seriesId: series.id, seriesName: series.name, focusItemId: route.itemId}, fromKey)}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
				/>
			)}
			{route.name === 'player' && engine && client && (
				<Player
					engine={engine}
					player={player}
					autoplay={autoplay}
					next={nextForPlayer}
					nextCoverUrl={nextForPlayer && nextForPlayer.item.media.coverPath ? client.coverUrl(nextForPlayer.item.id, 520) : ''}
					onToggleAutoplay={toggleAutoplay}
					onPlayNext={playNext}
					onDeclineNext={() => {
						if (player.itemId) setDeclined((d) => d.concat(player.itemId as string));
					}}
					onHome={() => setStack(reset({name: 'home'}))}
					onRetry={() => player.itemId && openBook(engine, player.itemId)}
				/>
			)}
			{route.name === 'about' && (
				<About
					version={appinfo.version}
					creds={creds}
					onBack={() => setStack(pop)}
					onSignOut={() => signOut('')}
				/>
			)}
			<Toasts toasts={toasts} />
			{asleep && <Screensaver player={player} />}
		</div>
	);
}

export default SpotlightRootDecorator(App);
