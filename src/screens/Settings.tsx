import {useState} from 'react';
import type {FocusEvent, KeyboardEvent} from 'react';

import type {Credentials} from '../abs/client';
import {loadPlaybackRate} from '../abs/store';
import type {SpeedKind} from '../abs/store';
import {isPremium} from '../app/premium';
import type {Route} from '../app/routes';
import {defaultHomeRows, HOME_ROWS, homeRowsAreDefault, homeRowShown, moveHomeRow, nextChoice, orderedHomeRows, SKIP_CHOICES, SLEEP_CHOICES, SLEEP_FADE_CHOICES, sleepLabel, stepChoice, toggleHomeRow, updateSettings, useSettings} from '../app/settings';
import type {HomeRowId} from '../app/settings';
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
	onYearReview: () => void;
	onDiagnostics: () => void;
	onRemoteHelp: () => void;
	onToast: (text: string) => void;
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
	/** Channel up/down move this row in a list (Home rows). */
	onMove?: (dir: 1 | -1) => void;
	/** Shown while focused, beside the hint: "CH ▲▼ to move · 3 of 7". */
	moveHint?: string;
	first?: boolean;
}

/** One setting: OK steps to the next value, so it works with nothing but the D-pad. */
function Row ({id, label, hint, value, onSelect, onStep, off, onMove, moveHint, first}: RowProps) {
	const onKeyDown = (ev: KeyboardEvent<HTMLElement>) => {
		if (onMove && (ev.keyCode === Keys.CH_UP || ev.keyCode === Keys.CH_DOWN)) {
			ev.preventDefault();
			ev.stopPropagation();
			onMove(ev.keyCode === Keys.CH_UP ? -1 : 1);
			return;
		}
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
				<span className="vf-setting__hint">{hint}{moveHint && <span className="vf-setting__move">{moveHint}</span>}</span>
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

export default function Settings ({creds, restoreKey, onTab, onSettings, onAbout, onSignOut, onStats, onYearReview, onDiagnostics, onRemoteHelp, onSpeed, onToast}: SettingsProps) {
	const s = useSettings();
	const premiumNow = isPremium();
	const homeRows = orderedHomeRows(s).map((id) => HOME_ROWS.filter((r) => r.id === id)[0]).filter((r) => premiumNow || !r.premium);
	const premium = isPremium();
	const [speeds, setSpeeds] = useState(() => ({book: loadPlaybackRate('book'), podcast: loadPlaybackRate('podcast')}));
	// The left column is longer than the screen: it slides to keep the focused row in view.
	const [offset, setOffset] = useState(0);
	const follow = (ev: FocusEvent<HTMLElement>) => followRow(ev.target as HTMLElement);
	const followRow = (target: HTMLElement) => {
		const row = target.closest('.vf-setting') as HTMLElement | null;
		const column = target.closest('.vf-settings__column') as HTMLElement | null;
		if (!row || !column) return;
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
	/** Down on the last setting stays put (rather than jumping to the rail). */
	const stayAtEnd = (ev: KeyboardEvent<HTMLElement>) => {
		if (ev.keyCode !== Keys.DOWN) return;
		const rows = ev.currentTarget.querySelectorAll('.vf-setting');
		if (rows.length && document.activeElement === rows[rows.length - 1]) {
			ev.preventDefault();
			ev.stopPropagation();
		}
	};

	/** Move a Home row, keeping it focused and in view as it goes. */
	const moveRow = (id: HomeRowId) => (dir: 1 | -1) => {
		const order = moveHomeRow(s, id, dir);
		if (!order) return;
		updateSettings({homeRowOrder: order});
		window.setTimeout(() => {
			const el = document.querySelector('[data-focus-key="home:' + id + '"]') as HTMLElement | null;
			if (el) followRow(el);
		}, 0);
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
					<div className="vf-settings__column" onFocus={follow} onKeyDown={stayAtEnd} style={{transform: 'translateY(' + -offset + 'px)'}}>
						<section className="vf-settings__group" aria-label="Playback">
							<h2 className="vf-eyebrow">Playback</h2>
							<Row first id="bookSpeed" label="Book speed" hint="Also changed with the green button while listening" value={formatRate(speeds.book)} onSelect={() => stepSpeed('book')} onStep={speedStepper('book')} />
							{premium && <Row id="podcastSpeed" label="Podcast speed ★" hint="Podcasts keep their own speed" value={formatRate(speeds.podcast)} onSelect={() => stepSpeed('podcast')} onStep={speedStepper('podcast')} />}
							<Row id="skipBack" label="Skip back" hint="How far rewind jumps back" value={s.skipBack + ' seconds'} onSelect={() => updateSettings({skipBack: nextChoice(SKIP_CHOICES, s.skipBack)})} onStep={stepper('skipBack', SKIP_CHOICES)} />
							<Row id="skipForward" label="Skip forward" hint="How far fast-forward jumps ahead" value={s.skipForward + ' seconds'} onSelect={() => updateSettings({skipForward: nextChoice(SKIP_CHOICES, s.skipForward)})} onStep={stepper('skipForward', SKIP_CHOICES)} />
							<Row id="smartRewind" label="Smart rewind" hint="Replay a few seconds when you resume" value={onOff(s.smartRewind)} off={!s.smartRewind} onSelect={() => updateSettings({smartRewind: !s.smartRewind})} />
							<Row id="sleepDefault" label="Sleep timer" hint="Also started with the yellow button" value={sleepLabel(s.sleepDefault)} onSelect={() => updateSettings({sleepDefault: nextChoice(SLEEP_CHOICES, s.sleepDefault)})} onStep={stepper('sleepDefault', SLEEP_CHOICES)} />
							<Row id="sleepFade" label="Sleep fade" hint="How gently the sleep timer turns the sound down" value={(s.sleepFade <= 10 ? 'Short' : s.sleepFade <= 30 ? 'Medium' : 'Long') + ' · ' + s.sleepFade + ' s'} onSelect={() => updateSettings({sleepFade: nextChoice(SLEEP_FADE_CHOICES, s.sleepFade)})} onStep={stepper('sleepFade', SLEEP_FADE_CHOICES)} />
							<Row id="autoplay" label="Autoplay" hint="Play what's next in a series, playlist or podcast" value={onOff(s.seriesAutoplay)} off={!s.seriesAutoplay} onSelect={() => updateSettings({seriesAutoplay: !s.seriesAutoplay})} />
						</section>

						<section className="vf-settings__group" aria-label="Home rows">
							<h2 className="vf-eyebrow">Home rows</h2>
							<p className="vf-settings__note">Continue listening always shows first. Channel up and down move a row.</p>
							{homeRows.map((r, i) => (
								<Row
									key={r.id}
									id={'home:' + r.id}
									label={r.label}
									hint={r.hint}
									onMove={moveRow(r.id)}
									moveHint={' · CH ▲▼ to move · ' + (i + 1) + ' of ' + homeRows.length}
									value={homeRowShown(s, r.id) ? 'Shown' : 'Hidden'}
									off={!homeRowShown(s, r.id)}
									onSelect={() => updateSettings({hiddenHomeRows: toggleHomeRow(s, r.id)})}
								/>
							))}
							{/* Always there (disabled when nothing's changed), so the list doesn't jump as rows move. */}
							<Row
								id="homeReset"
								label="Reset Home rows"
								hint={homeRowsAreDefault(s) ? 'Home rows are as they started' : 'Back to the original order and choice of rows'}
								value={homeRowsAreDefault(s) ? '' : 'Reset'}
								off={homeRowsAreDefault(s)}
								onSelect={() => {
									if (homeRowsAreDefault(s)) return;
									updateSettings(defaultHomeRows());
									onToast('Home rows reset');
								}}
							/>
						</section>


						<section className="vf-settings__group" aria-label="Screen">
							<h2 className="vf-eyebrow">Screen</h2>
							<Row id="screensaver" label="Screensaver" hint={s.screensaver === 'dark' ? 'A black screen while you listen: kindest to an OLED panel' : 'The time and your book, drifting slowly'} value={s.screensaver === 'dark' ? 'Screen off' : 'Moving cover'} onSelect={() => updateSettings({screensaver: s.screensaver === 'dark' ? 'cover' : 'dark'})} />
							{s.screensaver !== 'dark' && (
								<Row id="nightMode" label="Night mode ★" hint="A dimmer, slower screensaver from 10pm to 6am" value={premium ? onOff(s.nightMode) : '★ Premium'} off={premium && !s.nightMode} onSelect={() => premium && updateSettings({nightMode: !s.nightMode})} />
							)}
							<Row id="textSize" label="Text size" hint="Larger details, hints and labels for reading from further away" value={s.textSize === 'large' ? 'Large' : 'Standard'} onSelect={() => updateSettings({textSize: s.textSize === 'large' ? 'standard' : 'large'})} />
							<Row id="reduceMotion" label="Reduce motion" hint="No sliding or scrolling titles; the screensaver moves once a minute" value={onOff(s.reduceMotion)} off={!s.reduceMotion} onSelect={() => updateSettings({reduceMotion: !s.reduceMotion})} />
						</section>

						<section className="vf-settings__group" aria-label="Your listening">
							<h2 className="vf-eyebrow">Your listening</h2>
							<Row id="stats" label="Listening stats ★" hint="Time listened, streaks, and books finished" value={premium ? 'Open' : '★ Premium'} onSelect={() => premium && onStats()} />
							<Row id="yearReview" label="Year in review ★" hint="Your listening year: hours, books, favourite authors" value={premium ? 'Open' : '★ Premium'} onSelect={() => premium && onYearReview()} />
						</section>

						<section className="vf-settings__group" aria-label="Help">
							<h2 className="vf-eyebrow">Help</h2>
							<Row id="remoteHelp" label="Remote buttons" hint="What the coloured buttons and CH +/− do on each screen" value="Open" onSelect={onRemoteHelp} />
							<Row id="diagnostics" label="Diagnostics" hint="Versions, the connection to your server, live updates" value="Open" onSelect={onDiagnostics} />
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
