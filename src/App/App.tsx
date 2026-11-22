import Spotlight from '@enact/spotlight';
import SpotlightRootDecorator from '@enact/spotlight/SpotlightRootDecorator';
import {useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';

import appinfo from '../../webos-meta/appinfo.json';
import {AbsClient, login, normaliseServerUrl, progressKey} from '../abs/client';
import type {Credentials} from '../abs/client';
import type {Bookmark} from '../abs/types';
import {deviceId} from '../abs/store';
import {IdleWatcher} from '../app/idle';
import {decideLaunch} from '../app/launch';
import {activeProfile, addProfile, displayName, loadProfiles, removeProfile, saveProfiles, setActive, updateCreds} from '../app/profiles';
import type {Profile, ProfileState} from '../app/profiles';
import {pop, push, reset, TABS} from '../app/routes';
import type {Entry, Route} from '../app/routes';
import {nextInSeries} from '../app/series';
import {podcastLibraryId} from '../app/podcasts';
import {isPremium} from '../app/premium';
import {getSettings, selectProfileSettings, updateSettings, useSettings} from '../app/settings';
import {findNextEpisode, fromSeries} from '../app/upnext';
import type {NextUp} from '../app/upnext';
import {PodcastsContext} from '../components/PodcastsContext';
import {installMarquee} from '../components/marquee';
import {ProfileContext} from '../components/ProfileContext';
import {Screensaver} from '../components/Screensaver';
import {Toasts} from '../components/Toasts';
import type {Toast} from '../components/Toasts';
import {devLogin, installErrorReporter, replayKeys, report, runProbe} from '../dev/probe';
import {idlePlayerState, PlayerEngine} from '../player/engine';
import {formatClock} from '../player/timeline';
import type {PlayerState} from '../player/engine';
import {refreshClockFormat} from '../platform/clockFormat';
import {controlTvScreensaver} from '../platform/screensaver';
import {activate, exitApp, isBackKey, Keys, onRelaunch, readLaunchParams, requestedItemId} from '../platform/webos';
import About from '../screens/About';
import Profiles from '../screens/Profiles';
import AuthorScreen from '../screens/Author';
import Authors from '../screens/Authors';
import BookList from '../screens/BookList';
import Collections from '../screens/Collections';
import {loadQueue, nextInQueue, queueIndex, saveQueue} from '../app/queue';
import type {Queue} from '../app/queue';
import Details from '../screens/Details';
import Home from '../screens/Home';
import Library from '../screens/Library';
import Player from '../screens/Player';
import PodcastShow from '../screens/PodcastShow';
import Podcasts from '../screens/Podcasts';
import SeriesDetail from '../screens/SeriesDetail';
import Search, {presetSearch} from '../screens/Search';
import Stats from '../screens/Stats';
import SeriesList from '../screens/SeriesList';
import SettingsScreen from '../screens/Settings';
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

/** Leave the app, closing the listening session first (briefly) so it's recorded. */
function leaveApp (engine: PlayerEngine | null): void {
	if (!engine) {
		exitApp();
		return;
	}
	let gone = false;
	const go = () => {
		if (!gone) {
			gone = true;
			exitApp();
		}
	};
	engine.suspend(true).then(go, go);
	window.setTimeout(go, 1500);
}
// Development: `perfectCorner` (with `probe`) starts the screensaver drift near a corner.
const devCornerSoon = typeof window !== 'undefined' && (() => {
	const p = readLaunchParams();
	return typeof p.probe === 'string' && Boolean(p.perfectCorner);
})();
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
	profileId: string;
	client: AbsClient;
	engine: PlayerEngine;
}

/* Household profiles (★ Premium): kept in one module-level store so token rotation from any client
   can update it, and mirrored into React with useSyncExternalStore. */
let profileState: ProfileState = typeof window !== 'undefined' ? loadProfiles() : {profiles: [], activeId: null};
const profileListeners = new Set<() => void>();

function commitProfiles (next: ProfileState): void {
	profileState = next;
	saveProfiles(next);
	profileListeners.forEach((fn) => fn());
}

const subscribeProfiles = (fn: () => void) => {
	profileListeners.add(fn);
	return () => {
		profileListeners.delete(fn);
	};
};
const getProfiles = () => profileState;

function clientFor (profile: Profile): AbsClient {
	return new AbsClient(profile.creds, (c) => commitProfiles(updateCreds(profileState, profile.id, c)));
}

function makeSession (profile: Profile): Session {
	const client = clientFor(profile);
	client.keepFresh();
	return {profileId: profile.id, client, engine: new PlayerEngine(client, audio, device)};
}

/** The profile a book should open for: whoever saved progress in it most recently, else the active one. */
async function profileForItem (key: string): Promise<string | null> {
	const {profiles, activeId} = profileState;
	if (profiles.length < 2) return activeId || (profiles[0] ? profiles[0].id : null);
	const [itemId, episodeId] = key.split('/');
	const found = await Promise.all(profiles.map((p) => clientFor(p).getProgress(itemId, episodeId).catch(() => null)));
	let best: string | null = null;
	let bestAt = -1;
	found.forEach((progress, i) => {
		if (progress && progress.lastUpdate > bestAt) {
			bestAt = progress.lastUpdate;
			best = profiles[i].id;
		}
	});
	return best || activeId || profiles[0].id;
}

const startProfile = activeProfile(profileState) || (profileState.profiles.length === 1 ? profileState.profiles[0] : null);
selectProfileSettings(startProfile ? startProfile.id : null);

interface UpNext {
	/** progressKey of what's loaded. */
	forKey: string;
	next: NextUp | null;
}

function App () {
	const profiles = useSyncExternalStore(subscribeProfiles, getProfiles);
	const [session, setSession] = useState<Session | null>(() => (startProfile ? makeSession(startProfile) : null));
	const [stack, setStack] = useState<Entry[]>(() => reset(
		profileState.profiles.length > 1 ? {name: 'profiles'} : session ? {name: 'home'} : {name: 'setup'}
	));
	const [pendingItemId, setPendingItemId] = useState<string | null>(null);
	const [authMessage, setAuthMessage] = useState('');
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [upNext, setUpNext] = useState<UpNext | null>(null);
	// Books whose Up Next the listener turned down ("Not now"), so autoplay skips them.
	const [declined, setDeclined] = useState<string[]>([]);
	// The playlist being played in order, if any (Up Next and autoplay follow it).
	const [queue, setQueue] = useState<Queue | null>(null);
	const queueRef = useRef<Queue | null>(null);
	useEffect(() => {
		queueRef.current = queue;
	}, [queue]);
	const toastId = useRef(0);

	const client = session ? session.client : null;
	const engine = session ? session.engine : null;
	// ★ Podcasts appear in the rail when the account has a podcast library.
	const [hasPodcasts, setHasPodcasts] = useState(false);
	useEffect(() => {
		let cancelled = false;
		if (!client || !isPremium()) return undefined;
		podcastLibraryId(client).then((id) => {
			if (!cancelled) setHasPodcasts(Boolean(id));
		}, () => undefined);
		return () => {
			cancelled = true;
			setHasPodcasts(false);
		};
	}, [client]);
	const creds = client ? client.credentials : null;
	const currentProfile = session ? profiles.profiles.filter((p) => p.id === session.profileId)[0] || null : null;
	const player = usePlayer(engine);
	const asleep = useSyncExternalStore(subscribeIdle, getIdle);
	const settings = useSettings();
	const autoplay = settings.seriesAutoplay;
	const top = stack[stack.length - 1];
	const route = top.route;

	// Smart rewind follows the setting.
	useEffect(() => {
		if (engine) engine.setSmartRewind(settings.smartRewind);
	}, [engine, settings.smartRewind]);

	// "Still listening?": any key keeps listening, including the press that wakes the screensaver.
	useEffect(() => {
		if (!engine) return undefined;
		const prompting = () => {
			const s = engine.getState().sleep;
			return Boolean(s && s.prompt);
		};
		const onKey = (ev: KeyboardEvent) => {
			if (!prompting()) return;
			ev.preventDefault();
			ev.stopImmediatePropagation();
			engine.extendSleep();
		};
		window.addEventListener('keydown', onKey, true);
		const unsubscribe = idle.subscribe((isAsleep) => {
			if (!isAsleep && prompting()) engine.extendSleep();
		});
		return () => {
			window.removeEventListener('keydown', onKey, true);
			unsubscribe();
		};
	}, [engine]);

	// The engine shares the one <audio> element; detach the old one when the account changes.
	useEffect(() => () => {
		if (engine) engine.dispose();
		if (client) client.stopKeepingFresh();
	}, [engine, client]);

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

	/** Make a profile the active one: save and close the current book, then start its session. */
	const switchProfile = useCallback((id: string): Session | null => {
		const current = live.current.session;
		if (current && current.profileId === id) return current;
		const profile = profileState.profiles.filter((p) => p.id === id)[0];
		if (!profile) return current;
		if (current) current.engine.close();
		commitProfiles(setActive(profileState, id));
		selectProfileSettings(id);
		const next = makeSession(profile);
		live.current = {...live.current, session: next};
		setSession(next);
		setUpNext(null);
		setDeclined([]);
		return next;
	}, []);

	/** Sign the current profile out (or an expired one): it's removed from this TV. */
	const signOut = useCallback((message = '') => {
		const current = live.current.session;
		if (current) {
			current.engine.close();
			commitProfiles(removeProfile(profileState, current.profileId));
		}
		setSession(null);
		setAuthMessage(message);
		selectProfileSettings(null);
		setStack(reset(profileState.profiles.length && !message ? {name: 'profiles'} : {name: 'setup'}));
	}, []);

	/** Open a book, or a podcast episode when `key` is "<show>/<episode>" (see progressKey). */
	const openBook = useCallback((target: PlayerEngine, key: string, opts: {fromKey?: string | null; startAt?: number; keepQueue?: boolean} = {}) => {
		// Playing something from outside the playlist leaves it; one of its own entries keeps it.
		const q = queueRef.current;
		if (!opts.keepQueue && q && queueIndex(q, key) === -1) {
			setQueue(null);
			saveQueue(null);
			pushToast('Left ' + q.name);
		}
		const previous = target.getState();
		if (previous.itemId && progressKey(previous.itemId, previous.episodeId) !== key && previous.title) {
			pushToast('Saved your place in ' + previous.title);
		}
		showPlayer(opts.fromKey);
		const [itemId, episodeId] = key.split('/');
		target.open(itemId, true, opts.startAt, episodeId || null);
	}, [pushToast, showPlayer]);

	/** Every title request from outside (Polaris, a relaunch) comes through here. With several
	    profiles, the book opens for whoever listened to it last. */
	const handleRequest = useCallback((itemId: string | null) => {
		const run = (current: Session | null) => {
			const action = decideLaunch(itemId, {
				signedIn: Boolean(current),
				currentItemId: current && current.engine.getState().itemId ? progressKey(current.engine.getState().itemId as string, current.engine.getState().episodeId) : null
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
		};
		if (itemId && profileState.profiles.length > 1) {
			profileForItem(itemId).then((id) => run(id ? switchProfile(id) : live.current.session), () => run(live.current.session));
			return;
		}
		run(live.current.session);
	}, [openBook, showPlayer, switchProfile]);

	const onSignedIn = useCallback((c: Credentials) => {
		const {state, profile} = addProfile(profileState, c);
		const current = live.current.session;
		if (current && current.profileId !== profile.id) current.engine.close();
		commitProfiles(state);
		selectProfileSettings(profile.id);
		const next = makeSession(profile);
		live.current = {...live.current, session: next};
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
		if (typeof params.probe === 'string' && typeof params.searchText === 'string') presetSearch(params.searchText);
		// Development: sign in (or add a profile) without typing on the TV.
		const devSignIn = (p: typeof params, then: () => void) => {
			const dev = devLogin(p);
			if (!dev) {
				then();
				return;
			}
			login(normaliseServerUrl(dev.server), dev.username, dev.password).then((c) => {
				onSignedInRef.current(c);
				then();
			}, then);
		};
		devSignIn(params, () => replayKeys(params));
		handleRequest(requestedItemId(params));
		return onRelaunch((p) => {
			installErrorReporter(p);
			runProbe(p);
			devSignIn(p, () => {
				handleRequest(requestedItemId(p));
				replayKeys(p);
			});
			activate();
		});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// What comes next for what's loaded (the Up Next card and autoplay): the next book in the series,
	// or a podcast's next episode.
	useEffect(() => {
		const itemId = player.itemId;
		const episodeId = player.episodeId;
		const series = player.series;
		const libraryId = player.libraryId;
		if (!client || !itemId) return undefined;
		const forKey = progressKey(itemId, episodeId);
		let cancelled = false;
		const inQueue = queue && queueIndex(queue, forKey) !== -1 ? queue : null;
		const found = inQueue
			? client.progressByItem().catch(() => ({})).then((p) => nextInQueue(inQueue, forKey, p))
			: episodeId
			? findNextEpisode(client, itemId, episodeId)
			: series && libraryId
				? client.seriesBooks(libraryId, series.id).then((books) => {
					const next = nextInSeries(books, itemId, series.id, series.name);
					return next ? fromSeries(next) : null;
				})
				: null;
		if (!found) return undefined;
		found.then((next) => {
			if (!cancelled) setUpNext({forKey, next});
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, player.itemId, player.episodeId, player.series, player.libraryId, queue]);

	// Bookmarks in the book that's loaded (stored on the server, so other apps see them too).
	const [bookmarks, setBookmarks] = useState<{itemId: string; list: Bookmark[]} | null>(null);
	useEffect(() => {
		const itemId = player.itemId;
		if (!client || !itemId) return undefined;
		let cancelled = false;
		client.bookmarks(itemId).then((list) => {
			if (!cancelled) setBookmarks({itemId, list});
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client, player.itemId]);

	const addBookmark = useCallback(() => {
		const current = live.current.session;
		if (!current) return;
		const s = current.engine.getState();
		if (!s.itemId) return;
		const time = Math.floor(s.position);
		const chapter = s.chapterIndex >= 0 ? s.chapters[s.chapterIndex] : null;
		const title = (chapter ? chapter.title : s.title) + ' · ' + formatClock(time);
		const itemId = s.itemId;
		current.client.addBookmark(itemId, time, title).then((b) => {
			setBookmarks((prev) => {
				const list = (prev && prev.itemId === itemId ? prev.list : []).filter((x) => x.time !== b.time).concat(b);
				return {itemId, list: list.sort((x, y) => x.time - y.time)};
			});
			pushToast('Bookmarked ' + formatClock(time));
		}, () => pushToast("Couldn't save the bookmark"));
	}, [pushToast]);

	const removeBookmark = useCallback((b: Bookmark) => {
		const current = live.current.session;
		if (!current) return;
		current.client.removeBookmark(b.libraryItemId, b.time).then(() => {
			setBookmarks((prev) => (prev ? {...prev, list: prev.list.filter((x) => x.time !== b.time)} : prev));
		}, () => pushToast("Couldn't remove the bookmark"));
	}, [pushToast]);

	const playNext = useCallback(() => {
		const {session: current, upNext: un} = live.current;
		if (!current || !un || !un.next) return;
		const [finishedId, finishedEpisode] = un.forKey.split('/');
		current.client.setFinished(finishedId, true, finishedEpisode || null).catch(() => undefined);
		pushToast('Up next: ' + un.next.title);
		openBook(current.engine, un.next.key, {keepQueue: true});
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
					const key = progressKey(s.itemId, s.episodeId);
					const hasNext = Boolean(un && un.forKey === key && un.next);
					if (on && hasNext && no.indexOf(key) === -1) {
						playNext();
					} else if (current) {
						current.client.setFinished(s.itemId, true, s.episodeId).catch(() => undefined);
						const q = queueRef.current;
						const at = queueIndex(q, key);
						if (q && at === q.entries.length - 1) {
							pushToast('End of ' + q.name);
							setQueue(null);
							saveQueue(null);
						} else {
							pushToast('Finished ' + s.title);
						}
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

	/** Play a playlist in order from one of its entries. */
	const playQueue = useCallback((q: Queue, startKey: string, fromKey?: string | null) => {
		const current = live.current.session;
		if (!current) return;
		openBook(current.engine, startKey, {fromKey, keepQueue: true});
		setQueue({...q, userId: current.client.credentials.userId});
	}, [openBook]);

	// The playlist survives a relaunch (for the same account).
	useEffect(() => {
		if (queue) saveQueue(queue);
	}, [queue]);
	useEffect(() => {
		if (!client) return undefined;
		let cancelled = false;
		// After this render: picking up the saved queue isn't urgent.
		Promise.resolve().then(() => {
			if (!cancelled) setQueue(loadQueue(client.credentials.userId));
		});
		return () => {
			cancelled = true;
		};
	}, [client]);

	const toggleAutoplay = useCallback(() => {
		const on = !getSettings().seriesAutoplay;
		updateSettings({seriesAutoplay: on});
		pushToast(on ? 'Autoplay on' : 'Autoplay off');
	}, [pushToast]);

	// Save the position when the TV hides the app (Home button, input switch, power off).
	useEffect(() => {
		refreshClockFormat();
		const removeMarquee = installMarquee();
		const onVisibility = () => {
			if (!document.hidden) {
				idle.wake();
				refreshClockFormat();
			}
			const current = live.current.session;
			if (!current) return;
			// Hidden (Home button, input switch, standby): close the session so the listening is
			// recorded. Coming back, show a newer place from another device; Play opens a new session.
			if (document.hidden) current.engine.suspend(true);
			else current.client.ensureFresh().then(() => current.engine.catchUp());
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			removeMarquee();
		};
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
				if (stackDepth > 1) setStack(pop);
				else if (r.name === 'setup' || r.name === 'profiles') leaveApp(e);
				else if (r.name !== 'home') setStack(reset({name: 'home'}));
				else if (loaded) setStack((st) => push(st, {name: 'player'}));
				else leaveApp(e);
				return;
			}
			if (!e || !loaded) return;
			// Blue: back to what's playing from anywhere (the player itself uses Blue for a bookmark).
			if (code === Keys.BLUE && r.name !== 'player' && r.name !== 'setup' && r.name !== 'profiles') {
				ev.preventDefault();
				setStack((st) => push(st, {name: 'player'}));
				return;
			}
			if (code === Keys.PLAY) e.play();
			else if (code === Keys.PAUSE) e.toggle();
			else if (code === Keys.REWIND) e.skip(-getSettings().skipBack);
			else if (code === Keys.FAST_FORWARD) e.skip(getSettings().skipForward);
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
			if (current) current.engine.suspend(true);
		};
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	}, []);

	useEffect(() => {
		Spotlight.setPointerMode(false);
	}, [route]);

	const onTab = (name: Route['name']) => {
		if (TABS.indexOf(name) !== -1) setStack(reset({name} as Route));
	};
	const onSettings = () => onTab('settings');
	const openEpisode = (itemId: string, episodeId: string, fromKey: string) => {
		if (!engine) return;
		if (player.itemId === itemId && player.episodeId === episodeId && player.status !== 'error') showPlayer(fromKey);
		else openBook(engine, progressKey(itemId, episodeId), {fromKey});
	};
	const playerKey = player.itemId ? progressKey(player.itemId, player.episodeId) : null;
	const queueAt = queueIndex(queue, playerKey);
	const queueLabel = queue && queueAt !== -1 ? queue.name + ' · ' + (queueAt + 1) + ' of ' + queue.entries.length : null;
	const nextForPlayer = upNext && playerKey && upNext.forKey === playerKey && upNext.next && autoplay && declined.indexOf(playerKey) === -1 ? upNext.next : null;

	const profileInfo = currentProfile ? {
		name: displayName(currentProfile),
		shared: profiles.profiles.length > 1,
		onOpen: () => go({name: 'profiles'}, 'rail:profile')
	} : null;

	return (
		<ProfileContext.Provider value={profileInfo}>
		<PodcastsContext.Provider value={hasPodcasts}>
		<div className="vf-stage">
			{route.name === 'profiles' && (
				<Profiles
					profiles={profiles.profiles}
					activeId={session ? session.profileId : profiles.activeId}
					onPick={(id) => {
						if (switchProfile(id)) setStack(reset({name: 'home'}));
					}}
					onAdd={() => {
						if (isPremium()) go({name: 'setup', adding: true}, 'profile:add');
						else pushToast('Adding people is part of Vox Folio Premium');
					}}
				/>
			)}
			{route.name === 'setup' && (
				<Setup
					initialServer={creds ? creds.serverUrl : profiles.profiles[0] ? profiles.profiles[0].creds.serverUrl : ''}
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
					onPlayEpisode={openEpisode}
					onOpenShow={(itemId, title, fromKey) => go({name: 'podcast', itemId, title}, fromKey)}
					onShowPlayer={(fromKey) => showPlayer(fromKey)}
					onTab={onTab}
					onSettings={onSettings}
					onToast={pushToast}
				/>
			)}
			{route.name === 'library' && client && (
				<Library
					client={client}
					restoreKey={top.focusKey}
					onTab={onTab}
					onSettings={onSettings}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
					onOpenCollections={(libraryId) => go({name: 'collections', libraryId}, 'collections')}
				/>
			)}
			{route.name === 'search' && client && (
				<Search
					client={client}
					restoreKey={top.focusKey}
					onTab={onTab}
					onSettings={onSettings}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
					onOpenSeries={(libraryId, seriesId, seriesName, fromKey) => go({name: 'seriesDetail', libraryId, seriesId, seriesName}, fromKey)}
					onOpenAuthor={(authorId, authorName, fromKey) => go({name: 'author', authorId, authorName}, fromKey)}
					onOpenNarrator={(libraryId, name, fromKey) => go({name: 'books', title: name, source: {kind: 'narrator', libraryId, name}}, fromKey)}
					onOpenShow={(itemId, title, fromKey) => go({name: 'podcast', itemId, title}, fromKey)}
					onPlayEpisode={openEpisode}
				/>
			)}
			{route.name === 'podcasts' && client && engine && (
				<Podcasts
					client={client}
					restoreKey={top.focusKey}
					onTab={onTab}
					onSettings={onSettings}
					onPlayEpisode={openEpisode}
					onOpenShow={(itemId, title, fromKey) => go({name: 'podcast', itemId, title}, fromKey)}
					onOpenPlaylist={(id, name, fromKey) => go({name: 'books', title: name, source: {kind: 'playlist', id}}, fromKey)}
				/>
			)}
			{route.name === 'podcast' && client && engine && (
				<PodcastShow
					key={route.itemId}
					client={client}
					itemId={route.itemId}
					title={route.title}
					player={player}
					restoreKey={top.focusKey}
					onPlayEpisode={openEpisode}
					onToast={pushToast}
				/>
			)}
			{route.name === 'authors' && client && (
				<Authors
					client={client}
					restoreKey={top.focusKey}
					onTab={onTab}
					onSettings={onSettings}
					onOpenAuthor={(authorId, authorName, fromKey) => go({name: 'author', authorId, authorName}, fromKey)}
				/>
			)}
			{route.name === 'author' && client && (
				<AuthorScreen
					key={route.authorId}
					client={client}
					authorId={route.authorId}
					authorName={route.authorName}
					restoreKey={top.focusKey}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
				/>
			)}
			{route.name === 'collections' && client && (
				<Collections
					client={client}
					libraryId={route.libraryId}
					restoreKey={top.focusKey}
					onOpen={(title, source, fromKey) => go({name: 'books', title, source}, fromKey)}
				/>
			)}
			{route.name === 'books' && client && (
				<BookList
					key={JSON.stringify(route.source)}
					client={client}
					title={route.title}
					source={route.source}
					restoreKey={top.focusKey}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
					onPlayQueue={playQueue}
				/>
			)}
			{route.name === 'series' && client && (
				<SeriesList
					client={client}
					restoreKey={top.focusKey}
					onTab={onTab}
					onSettings={onSettings}
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
					onOpenAuthor={(authorId, authorName, fromKey) => go({name: 'author', authorId, authorName}, fromKey)}
					onOpenTitle={(itemId, fromKey) => go({name: 'details', itemId}, fromKey)}
				/>
			)}
			{route.name === 'player' && engine && client && (
				<Player
					engine={engine}
					player={player}
					autoplay={autoplay}
					queueLabel={queueLabel}
					next={nextForPlayer}
					nextCoverUrl={nextForPlayer && nextForPlayer.hasCover ? client.coverUrl(nextForPlayer.itemId, 520) : ''}
					onToggleAutoplay={toggleAutoplay}
					onPlayNext={playNext}
					onDeclineNext={() => {
						if (playerKey) setDeclined((d) => d.concat(playerKey));
					}}
					onHome={() => setStack(reset({name: 'home'}))}
					onRetry={() => player.itemId && openBook(engine, progressKey(player.itemId, player.episodeId))}
					skipBack={settings.skipBack}
					skipForward={settings.skipForward}
					sleepDefault={settings.sleepDefault}
					bookmarks={bookmarks && bookmarks.itemId === player.itemId && !player.episodeId ? bookmarks.list : []}
					onAddBookmark={addBookmark}
					onRemoveBookmark={removeBookmark}
				/>
			)}
			{route.name === 'settings' && (
				<SettingsScreen
					creds={creds}
					restoreKey={top.focusKey}
					onTab={onTab}
					onSettings={onSettings}
					onAbout={() => go({name: 'about'}, 'about')}
					onSignOut={() => signOut('')}
					onStats={() => go({name: 'stats'}, 'stats')}
				/>
			)}
			{route.name === 'stats' && client && <Stats client={client} onDone={() => setStack(pop)} />}
			{route.name === 'about' && (
				<About
					version={appinfo.version}
					creds={creds}
					onBack={() => setStack(pop)}
					onSignOut={() => signOut('')}
				/>
			)}
			<Toasts toasts={toasts} />
			{asleep && <Screensaver player={player} listener={profileInfo && profileInfo.shared ? profileInfo.name : ''} cornerSoon={devCornerSoon} />}
		</div>
		</PodcastsContext.Provider>
		</ProfileContext.Provider>
	);
}

export default SpotlightRootDecorator(App);
