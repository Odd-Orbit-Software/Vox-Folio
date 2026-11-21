import type {Credentials} from '../abs/client';
import type {Route} from '../app/routes';
import {nextChoice, SKIP_CHOICES, SLEEP_CHOICES, sleepLabel, updateSettings, useSettings} from '../app/settings';
import {Button, Icon, Tile} from '../components/controls';
import {Rail} from '../components/Rail';
import {ScreenContainer} from '../components/ScreenContainer';

interface SettingsProps {
	creds: Credentials | null;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onAbout: () => void;
	onSignOut: () => void;
}

interface RowProps {
	id: string;
	label: string;
	hint: string;
	value: string;
	onSelect: () => void;
	first?: boolean;
}

/** One setting: OK steps to the next value, so it works with nothing but the D-pad. */
function Row ({id, label, hint, value, onSelect, first}: RowProps) {
	return (
		<Tile className="vf-setting" data-focus-key={id} data-default-focus={first || undefined} onClick={onSelect} aria-label={label + ': ' + value}>
			<span className="vf-setting__text">
				<span className="vf-setting__label">{label}</span>
				<span className="vf-setting__hint">{hint}</span>
			</span>
			<span className="vf-setting__value">{value}<Icon name="chevronRight" size={24} /></span>
		</Tile>
	);
}

const onOff = (on: boolean) => (on ? 'On' : 'Off');

export default function Settings ({creds, restoreKey, onTab, onSettings, onAbout, onSignOut}: SettingsProps) {
	const s = useSettings();

	return (
		<ScreenContainer id="settings" className="vf-browse vf-settings" restoreKey={restoreKey}>
			<Rail active="settings" onTab={onTab} onSettings={onSettings} />
			<header className="vf-browse__head">
				<h1 className="vf-browse__h1">Settings</h1>
			</header>

			<div className="vf-settings__body">
				<section className="vf-settings__group" aria-label="Playback">
					<h2 className="vf-eyebrow">Playback</h2>
					<Row first id="skipBack" label="Skip back" hint="◀◀ and the back button" value={s.skipBack + ' seconds'} onSelect={() => updateSettings({skipBack: nextChoice(SKIP_CHOICES, s.skipBack)})} />
					<Row id="skipForward" label="Skip forward" hint="▶▶ and the forward button" value={s.skipForward + ' seconds'} onSelect={() => updateSettings({skipForward: nextChoice(SKIP_CHOICES, s.skipForward)})} />
					<Row id="smartRewind" label="Smart rewind" hint="Step back a little after a pause, more after longer ones" value={onOff(s.smartRewind)} onSelect={() => updateSettings({smartRewind: !s.smartRewind})} />
					<Row id="sleepDefault" label="Sleep timer" hint="What Yellow starts in the player" value={sleepLabel(s.sleepDefault)} onSelect={() => updateSettings({sleepDefault: nextChoice(SLEEP_CHOICES, s.sleepDefault)})} />
					<Row id="autoplay" label="Series autoplay" hint="Start the next book in the series when one ends" value={onOff(s.seriesAutoplay)} onSelect={() => updateSettings({seriesAutoplay: !s.seriesAutoplay})} />
				</section>

				<section className="vf-settings__group" aria-label="Account">
					<h2 className="vf-eyebrow">Account</h2>
					<dl className="vf-facts vf-settings__facts">
						<dt>Server</dt>
						<dd>{creds ? creds.serverUrl : '—'}</dd>
						<dt>Signed in as</dt>
						<dd>{creds ? creds.username : '—'}</dd>
					</dl>
					<div className="vf-row vf-row--spaced">
						<Button data-focus-key="signOut" onClick={onSignOut}>Sign out</Button>
						<Button data-focus-key="about" onClick={onAbout}>About Vox Folio</Button>
					</div>
				</section>
			</div>
		</ScreenContainer>
	);
}
