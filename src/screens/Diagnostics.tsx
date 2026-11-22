import {useEffect, useState, useSyncExternalStore} from 'react';

import {AbsClient, AbsError, serverStatus, tokenExpiry} from '../abs/client';
import {deviceId} from '../abs/store';
import {getLiveStatus, subscribeLiveStatus} from '../app/live';
import {Button} from '../components/controls';
import {errorTitle} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';

interface DiagnosticsProps {
	client: AbsClient;
	version: string;
	onDone: () => void;
	onToast: (text: string) => void;
}

/** Saved copies of Home, kept per account so it opens instantly. Safe to drop: they refill. */
const CACHE_PREFIX = 'voxfolio.home.v1:';

function cacheInfo (): {count: number; bytes: number} {
	let count = 0;
	let bytes = 0;
	try {
		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (key && key.indexOf(CACHE_PREFIX) === 0) {
				count += 1;
				bytes += (window.localStorage.getItem(key) || '').length * 2;
			}
		}
	} catch {
		// Storage unavailable.
	}
	return {count, bytes};
}

function clearCache (): void {
	try {
		const keys: string[] = [];
		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (key && key.indexOf(CACHE_PREFIX) === 0) keys.push(key);
		}
		keys.forEach((k) => window.localStorage.removeItem(k));
	} catch {
		// Nothing to clear.
	}
}

function clock (at: number): string {
	try {
		return new Date(at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
	} catch {
		return '';
	}
}

const LIVE_TEXT = {connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting', off: 'Off'};

/** For when something's not right: versions, the connection, live updates and saved data. */
export default function Diagnostics ({client, version, onDone, onToast}: DiagnosticsProps) {
	const [status, setStatus] = useState<{version: string; ms: number} | AbsError | null>(null);
	const [check, setCheck] = useState(0);
	const [cache, setCache] = useState(cacheInfo);
	const [now] = useState(() => Date.now());
	const live = useSyncExternalStore(subscribeLiveStatus, getLiveStatus);

	useEffect(() => {
		let cancelled = false;
		serverStatus(client.credentials.serverUrl).then((st) => {
			if (!cancelled) setStatus(st);
		}, (e: unknown) => {
			if (!cancelled) setStatus(e instanceof AbsError ? e : new AbsError('network', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, check]);

	const creds = client.credentials;
	const expiry = tokenExpiry(creds.accessToken);
	const minutes = expiry === null ? null : Math.round((expiry - now) / 60000);
	const server = status === null ? 'Checking…' : status instanceof AbsError ? errorTitle(status) : (status.ms < 800 ? 'Reachable · quick' : 'Reachable · slow') + ' (' + status.ms + ' ms)';

	return (
		<ScreenContainer id="diagnostics" className="vf-stats vf-diag">
			<header className="vf-list__head">
				<div className="vf-eyebrow">Settings</div>
				<h1 className="vf-list__title">Diagnostics</h1>
			</header>

			<dl className="vf-facts vf-diag__facts">
				<dt>Server</dt>
				<dd className={status instanceof AbsError ? 'vf-diag__bad' : ''}>{server}</dd>
				<dt>Live updates</dt>
				<dd className={live.status === 'connected' ? '' : 'vf-diag__bad'}>
					{LIVE_TEXT[live.status] + (live.status === 'connected' && live.since ? ' since ' + clock(live.since) : '')}
				</dd>
				<dt>Signed in as</dt>
				<dd>{creds.username}</dd>
				<dt>Saved Home</dt>
				<dd>{cache.count ? 'Ready: Home opens instantly' : 'None yet'}</dd>
			</dl>

			<h2 className="vf-eyebrow vf-diag__support">For support</h2>
			<dl className="vf-facts vf-diag__facts vf-diag__facts--small">
				<dt>Vox Folio</dt>
				<dd>{version}</dd>
				<dt>Audiobookshelf</dt>
				<dd>{status && !(status instanceof AbsError) ? status.version + ' at ' + creds.serverUrl : creds.serverUrl}</dd>
				<dt>Device name</dt>
				<dd>{deviceId() + ' (as Audiobookshelf lists this TV)'}</dd>
				<dt>Sign-in</dt>
				<dd>{minutes !== null ? 'Renews itself in ' + Math.max(0, minutes) + ' min' : 'Unknown'}</dd>
				<dt>Saved Home size</dt>
				<dd>{cache.count ? Math.max(1, Math.round(cache.bytes / 1024)) + ' KB for ' + cache.count + (cache.count === 1 ? ' account' : ' accounts') : '0 KB'}</dd>
			</dl>

			<div className="vf-row vf-row--spaced vf-diag__actions">
				<Button variant="primary" data-default-focus onClick={onDone}>Done</Button>
				<Button data-focus-key="check" onClick={() => {
					setStatus(null);
					setCheck((n) => n + 1);
				}}
				>
					Check again
				</Button>
				<Button data-focus-key="clear" onClick={() => {
					clearCache();
					setCache(cacheInfo());
					onToast('Saved Home cleared. It refills next time Home opens.');
				}}
				>
					Clear saved Home
				</Button>
			</div>
			<p className="vf-stats__note">Your sign-in, settings, profiles and playlist place are kept. Only the saved copy of Home is cleared.</p>
		</ScreenContainer>
	);
}
