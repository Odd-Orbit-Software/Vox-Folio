import type {Credentials} from '../abs/client';
import logo from '../assets/odd-orbit-logo.webp';
import mark from '../assets/vox-folio-mark.svg';
import orbi from '../assets/orbi-sitting.webp';
import {Button, Icon} from '../components/controls';
import {ScreenContainer} from '../components/ScreenContainer';

interface AboutProps {
	version: string;
	creds: Credentials | null;
	onBack: () => void;
	onSignOut: () => void;
}

export default function About ({version, creds, onBack, onSignOut}: AboutProps) {
	return (
		<ScreenContainer id="about" className="vf-about">
			<div className="vf-about__app">
				<span className="vf-hint"><Icon name="back" size={24} />Back</span>
				<div className="vf-lockup">
					<img className="vf-logo-mark vf-logo-mark--inline" src={mark} alt="" aria-hidden="true" />
					<div className="vf-wordmark vf-wordmark--hero">Vox Folio</div>
				</div>
				<p className="vf-about__lede">An Audiobookshelf player for LG TVs.</p>
				<dl className="vf-facts">
					<dt>Version</dt>
					<dd>{version}</dd>
					{creds && (
						<>
							<dt>Server</dt>
							<dd>{creds.serverUrl}</dd>
							<dt>Signed in as</dt>
							<dd>{creds.username}</dd>
						</>
					)}
				</dl>
				<div className="vf-row vf-row--spaced">
					<Button variant="primary" data-default-focus onClick={onBack}>Done</Button>
					{creds && <Button onClick={onSignOut}>Sign out</Button>}
				</div>
			</div>

			<div className="vf-about__maker">
				<img className="vf-about__orbi" src={orbi} alt="Orbi, the Odd Orbit mascot, waving" />
				<img className="vf-about__logo" src={logo} alt="Odd Orbit Software" />
				<p className="vf-about__made">Made by Odd Orbit Software</p>
				<p className="vf-about__url">oddorbit.software</p>
			</div>
		</ScreenContainer>
	);
}
