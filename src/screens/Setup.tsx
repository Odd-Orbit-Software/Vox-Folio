import {useEffect, useState} from 'react';

import {AbsError, login, normaliseServerUrl, ping} from '../abs/client';
import mark from '../assets/vox-folio-mark.svg';
import type {Credentials} from '../abs/client';
import {Button, Icon, TextField} from '../components/controls';
import {focusWithin, ScreenContainer} from '../components/ScreenContainer';

interface SetupProps {
	initialServer: string;
	message: string;
	pendingItemId: string | null;
	onSignedIn: (creds: Credentials) => void;
}

type Step = 'server' | 'account';

function describe (e: unknown): string {
	if (e instanceof AbsError) return e.message;
	return 'Something went wrong. Try again.';
}

export default function Setup ({initialServer, message, pendingItemId, onSignedIn}: SetupProps) {
	const [step, setStep] = useState<Step>(initialServer ? 'account' : 'server');
	const [server, setServer] = useState(initialServer);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(message);

	// Move focus to the new step's first control when the step changes.
	useEffect(() => {
		const t = window.setTimeout(() => focusWithin('setup'), 0);
		return () => window.clearTimeout(t);
	}, [step]);

	const checkServer = async () => {
		const url = normaliseServerUrl(server);
		if (!url) {
			setError('Enter your Audiobookshelf address.');
			return;
		}
		setBusy(true);
		setError('');
		try {
			await ping(url);
			setServer(url);
			setStep('account');
		} catch (e) {
			setError(describe(e));
		} finally {
			setBusy(false);
		}
	};

	const signIn = async () => {
		if (!username) {
			setError('Enter your username.');
			return;
		}
		setBusy(true);
		setError('');
		try {
			onSignedIn(await login(server, username.trim(), password));
		} catch (e) {
			setError(describe(e));
			setBusy(false);
		}
	};

	return (
		<ScreenContainer id="setup" className="vf-setup">
			<div className="vf-setup__intro">
				<img className="vf-logo-mark" src={mark} alt="" aria-hidden="true" />
				<div className="vf-wordmark vf-wordmark--hero">Vox Folio</div>
				<p className="vf-setup__lede">Your Audiobookshelf library, from the sofa. Sign in once and your place follows you between phone and TV.</p>
				{pendingItemId && (
					<div className="vf-waiting">
						<div className="vf-eyebrow vf-eyebrow--brass">Waiting to open</div>
						<div className="vf-waiting__text">A book was sent to Vox Folio. It will start as soon as you&apos;re signed in.</div>
					</div>
				)}
			</div>

			<div className="vf-setup__form">
				<ol className="vf-steps">
					<li className={step === 'server' ? 'is-current' : 'is-done'}>
						{step === 'server' ? <span className="vf-steps__num">1</span> : <span className="vf-steps__check"><Icon name="check" size={26} /></span>}
						Server
					</li>
					<li className={step === 'account' ? 'is-current' : ''}>
						<span className="vf-steps__num">2</span>Account
					</li>
				</ol>

				{step === 'server' ? (
					<>
						<h1 className="vf-setup__title">Connect to Audiobookshelf</h1>
						<p className="vf-setup__hint">The address you use for Audiobookshelf in a browser.</p>
						<div className="vf-stack">
							<TextField
								label="SERVER ADDRESS"
								value={server}
								onChange={setServer}
								onSubmit={checkServer}
								type="url"
								placeholder="Press OK to type, e.g. abs.example.com"
								spotlightId="setup-server"
								defaultFocus={!server}
							/>
							<div className="vf-row">
								<Button variant="primary" data-default-focus={server ? true : undefined} onClick={checkServer} disabled={busy}>
									{busy ? 'Checking…' : 'Continue'}
								</Button>
							</div>
						</div>
					</>
				) : (
					<>
						<h1 className="vf-setup__title">Sign in to Audiobookshelf</h1>
						<p className="vf-setup__hint">Use the same account as your phone app so progress stays in sync.</p>
						<div className="vf-stack">
							<div className="vf-field vf-field--static">
								<span className="vf-field__label">SERVER</span>
								<span className="vf-field__value">{server}</span>
								<span className="vf-field__ok">Connected</span>
							</div>
							<TextField label="USERNAME" value={username} onChange={setUsername} spotlightId="setup-user" autoComplete="username" defaultFocus={!username} />
							<TextField label="PASSWORD" value={password} onChange={setPassword} onSubmit={signIn} type="password" placeholder="Press OK to type" spotlightId="setup-pass" autoComplete="current-password" />
							<div className="vf-row">
								<Button variant="primary" data-default-focus={username ? true : undefined} onClick={signIn} disabled={busy}>
									{busy ? 'Signing in…' : 'Sign in'}
								</Button>
								<Button onClick={() => setStep('server')} disabled={busy}>Change server</Button>
							</div>
						</div>
					</>
				)}

				<div className="vf-setup__error" role="alert">{error}</div>
				<div className="vf-setup__footer">OK opens the TV keyboard</div>
			</div>
		</ScreenContainer>
	);
}
