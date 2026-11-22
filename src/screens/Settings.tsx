import {useState} from 'react';
import type {FocusEvent, KeyboardEvent} from 'react';

import type {Credentials} from '../abs/client';
import {loadPlaybackRate} from '../abs/store';
import type {SpeedKind} from '../abs/store';
import {isPremium} from '../app/premium';
import type {Route} from '../app/routes';
import {HOME_ROWS, homeRowShown, nextChoice, SKIP_CHOICES, SLEEP_CHOICES, sleepLabel, stepChoice, toggleHomeRow, updateSettings, useSettings} from '../app/settings';
import type {Settings as SettingsValues} from '../app/settings';
import {Button, Icon, Tile} from '../components/controls';
import {Rail} from '../components/Rail';
import {pinScroll, ScreenContainer} from '../components/ScreenContainer';
import {formatRate} from '../player/timeline';
import {Keys} from '../platform/webos';

interface SettingsProps {
	creds: Credentials | null;
	restoreKey: string | null;
	onTab: (name: Route['name']) => void;
	onSettings: () => void;
	onAbout: () => void;
	onSignOut: () => void;
	onStats: () => void;
	/** Save a default speed (and apply it now if that kind is playing). */
	onSpeed: (kind: SpeedKind, rate: number) => void;
}

interface RowProps {
	id: string;
	label: string;
	hint: string;
	value: string;
	onSelect: () => void;
	/** For a list of values: Left/Right step down/up, and return false at either end so focus can
	    move on (to the rail, or to Account). */
	onStep?: (dir: 1 | -1) => boolean;
	/** Dim a switched-off row so it can be spotted at a glance. */
	off?: boolean;
	first?: boolean;
}

/** One setting: OK steps to the next value, so it works with nothing but the D-pad. */
function Row ({id, label, hint, value, onSelect, onStep, off, first}: RowProps) {
	const onKeyDown = (ev: KeyboardEvent<HTMLElement>) => {
		if (!onStep || (ev.keyCode !== Keys.LEFT && ev.keyCode !== Keys.RIGHT)) return;
		if (onStep(ev.keyCode === Keys.RIGHT ? 1 : -1)) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	};
	return (
		<Tile className={'vf-setting' + (off ? ' is-off' : '')} data-focus-key={id} data-default-focus={first || undefined} onClick={onSelect} onKeyDown={onKeyDown} data-own-left={onStep ? true : undefined} aria-label={label + ': ' + value}>
			<span className="vf-setting__text">
				<span className="vf-setting__label">{label}</span>
				<span className="vf-setting__hint">{hint}</span>
			</span>
			<span className="vf-setting__value">
				{onStep && <Icon name="chevronLeft" size={24} />}
				{value}
				<Icon name="chevronRight" size={24} />
			</span>
		</Tile>
	);
}

const onOff = (on: boolean) => (on ? 'On' : 'Off');
const SPEEDS = [0.75, 0.9, 1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.75, 2];

/** Height of the visible settings column; must match .vf-settings__scroll. */
const VIEW_HEIGHT = 860;

function nearestSpeed (rate: number): number {
	return SPEEDS.reduce((best, s) => (Math.abs(s - rate) < Math.abs(best - rate) ? s : best), SPEEDS[0]);
}

/** The next preset speed after `rate` (a speed set in the player may sit between presets). */
function nextSpeed (rate: number): number {
	const above = SPEEDS.filter((s) => s > rate + 0.001);
	return above.length ? above[0] : SPEEDS[0];
}

export default function Settings ({creds, restoreKey, onTab, onSettings, onAbout, onSignOut, onStats, onSpeed}: SettingsProps) {
	const s = useSettings();
	const premium = isPremium();
	const [speeds, setSpeeds] = useState(() => ({book: loadPlaybackRate('book'), podcast: loadPlaybackRate('podcast')}));
	// The left column is longer than the screen: it slides to keep the focused row in view.
	const [offset, setOffset] = useState(0);
	const follow = (ev: FocusEvent<HTMLElement>) => {
		const row = (ev.target as HTMLElement).closest('.vf-setting') as HTMLElement | null;
		const column = ev.currentTarget as HTMLElement;
		if (!row) return;
		// Keep the focused row in the middle band, never sliding past the end of the list.
		const top = row.offsetTop;
		const max = Math.max(0, column.offsetHeight - VIEW_HEIGHT);
		setOffset(top < 520 ? 0 : Math.min(max, top - 360));
	};
	const setSpeed = (kind: SpeedKind, rate: number) => {
		setSpeeds((prev) => ({...prev, [kind]: rate}));
		onSpeed(kind, rate);
	};
	const stepSpeed = (kind: SpeedKind) => setSpeed(kind, nextSpeed(speeds[kind]));
	/** Left/Right on a row of values; false at the ends so focus can move on. */
	const stepper = <K extends keyof SettingsValues>(key: K, choices: SettingsValues[K][]) => (dir: 1 | -1) => {
		const v = stepChoice(choices, s[key], dir);
		if (v === null) return false;
		updateSettings({[key]: v} as Partial<SettingsValues>);
		return true;
	};
	const speedStepper = (kind: SpeedKind) => (dir: 1 | -1) => {
		const v = stepChoice(SPEEDS, nearestSpeed(speeds[kind]), dir);
		if (v === null) return false;
		setSpeed(kind, v);
		return true;
	};

	return (
		<ScreenContainer id="settings" className="vf-browse vf-settings" restoreKey={restoreKey}>
			<Rail active="settings" onTab={onTab} onSettings={onSettings} />
			<header className="vf-browse__head">
				<h1 className="vf-browse__h1">Settings</h1>
			</header>

			<div className="vf-settings__body">
				<div className="vf-settings__scroll" onScroll={pinScroll}>
					<div className="vf-settings__column" onFocus={follow} style={{transform: 'translateY(' + -offset + 'px)'}}>
						<section className="vf-settings__group" aria-label="Playback">
							<h2 className="vf-eyebrow">Playback</h2>
							<Row first id="bookSpeed" label="Book speed" hint="Also changed with the green button while listening" value={formatRate(speeds.book)} onSelect={() => stepSpeed('book')} onStep={speedStepper('book')} />
							{premium && <Row id="podcastSpeed" label="Podcast speed ★" hint="Podcasts keep their own speed" value={formatRate(speeds.podcast)} onSelect={() => stepSpeed('podcast')} onStep={speedStepper('podcast')} />}
							<Row id="skipBack" label="Skip back" hint="How far rewind jumps back" value={s.skipBack + ' seconds'} onSelect={() => updateSettings({skipBack: nextChoice(SKIP_CHOICES, s.skipBack)})} onStep={stepper('skipBack', SKIP_CHOICES)} />
							<Row id="skipForward" label="Skip forward" hint="How far fast-forward jumps ahead" value={s.skipForward + ' seconds'} onSelect={() => updateSettings({skipForward: nextChoice(SKIP_CHOICES, s.skipForward)})} onStep={stepper('skipForward', SKIP_CHOICES)} />
							<Row id="smartRewind" label="Smart rewind" hint="Replay a few seconds when you resume" value={onOff(s.smartRewind)} off={!s.smartRewind} onSelect={() => updateSettings({smartRewind: !s.smartRewind})} />
							<Row id="sleepDefault" label="Sleep timer" hint="Also started with the yellow button" value={sleepLabel(s.sleepDefault)} onSelect={() => updateSettings({sleepDefault: nextChoice(SLEEP_CHOICES, s.sleepDefault)})} onStep={stepper('sleepDefault', SLEEP_CHOICES)} />
							<Row id="autoplay" label="Autoplay" hint="Play what's next in a series, playlist or podcast" value={onOff(s.seriesAutoplay)} off={!s.seriesAutoplay} onSelect={() => updateSettings({seriesAutoplay: !s.seriesAutoplay})} />
						</section>

						<section className="vf-settings__group" aria-label="Home rows">
							<h2 className="vf-eyebrow">Home rows</h2>
							<p className="vf-settings__note">Continue listening always shows at the top.</p>
							{HOME_ROWS.filter((r) => premium || !r.premium).map((r) => (
								<Row
									key={r.id}
									id={'home:' + r.id}
									label={r.label}
									hint={r.hint}
									value={homeRowShown(s, r.id) ? 'Shown' : 'Hidden'}
									off={!homeRowShown(s, r.id)}
									onSelect={() => updateSettings({hiddenHomeRows: toggleHomeRow(s, r.id)})}
								/>
							))}
						</section>

						<section className="vf-settings__group" aria-label="Screensaver and stats">
							<h2 className="vf-eyebrow">Screensaver and stats</h2>
							<Row id="nightMode" label="Screensaver night mode ★" hint="Dimmer and slower from 10pm to 6am" value={premium ? onOff(s.nightMode) : '★ Premium'} off={premium && !s.nightMode} onSelect={() => premium && updateSettings({nightMode: !s.nightMode})} />
							<Row id="stats" label="Listening stats ★" hint="Time listened, streaks, and books finished" value={premium ? 'Open' : '★ Premium'} onSelect={() => premium && onStats()} />
						</section>
					</div>
				</div>

				<section className="vf-settings__group vf-settings__account" aria-label="Account">
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
