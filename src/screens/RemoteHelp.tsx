import {Button, Icon} from '../components/controls';
import {ScreenContainer} from '../components/ScreenContainer';

interface RemoteHelpProps {
	onDone: () => void;
}

type Key = 'red' | 'green' | 'yellow' | 'blue' | 'ok' | 'back' | 'play' | 'skip' | 'ch' | 'lr';

const KEY_LABEL: Record<Key, string> = {
	red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue', ok: 'OK', back: 'Back', play: '▶ ❚❚', skip: '◀◀  ▶▶', ch: 'CH + / −', lr: '◀ ▶'
};

const GROUPS: {title: string; rows: [Key, string][]}[] = [
	{title: 'While listening', rows: [
		['red', 'Chapters, bookmarks and the playlist'],
		['green', 'Playback speed'],
		['yellow', 'Sleep timer'],
		['blue', 'Bookmark this moment (books)'],
		['ch', 'Next or previous chapter'],
		['lr', 'On the progress bar: move through the book, OK to jump, Back to cancel']
	]},
	{title: 'Anywhere', rows: [
		['ok', 'Choose'],
		['back', 'Go back. From the player: back to browsing; from Home: back to the player'],
		['play', 'Play or pause what\u2019s loaded (Stop pauses too)'],
		['skip', 'Skip back or forward, by the lengths in Settings'],
		['blue', 'Back to the player']
	]},
	{title: 'On these screens', rows: [
		['red', 'Home, In progress: remove from Continue listening. Red again soon after undoes it'],
		['red', 'A podcast\u2019s episodes: mark played or unplayed'],
		['red', 'Library filter: show all books again'],
		['green', 'A playlist: the focused entry\u2019s details'],
		['ch', 'Chapters, playlists and filter lists: jump eight at a time'],
		['ch', 'Library, by narrator: next or previous letter'],
		['ch', 'Settings, Home rows: move a row up or down']
	]}
];

function KeyCap ({k}: {k: Key}) {
	const coloured = k === 'red' || k === 'green' || k === 'yellow' || k === 'blue';
	return (
		<span className={'vf-keycap' + (coloured ? ' vf-keycap--colour' : '')}>
			{coloured && <span className={'vf-dot vf-dot--' + k} />}
			{k === 'play' ? <><Icon name="play" size={18} /><Icon name="pause" size={18} /></> : KEY_LABEL[k]}
		</span>
	);
}

/** What each remote button does, for anyone who wonders what the coloured dots mean. */
export default function RemoteHelp ({onDone}: RemoteHelpProps) {
	return (
		<ScreenContainer id="remote-help" className="vf-stats vf-remote">
			<header className="vf-list__head">
				<div className="vf-eyebrow">Settings · Help</div>
				<h1 className="vf-list__title">Remote buttons</h1>
			</header>
			<div className="vf-remote__groups">
				{GROUPS.map((g) => (
					<section key={g.title} className="vf-remote__group" aria-label={g.title}>
						<h2 className="vf-eyebrow">{g.title}</h2>
						<dl className="vf-remote__list">
							{g.rows.map(([k, text], i) => (
								<div key={i} className="vf-remote__row">
									<dt><KeyCap k={k} /></dt>
									<dd>{text}</dd>
								</div>
							))}
						</dl>
					</section>
				))}
			</div>
			<div className="vf-stats__done">
				<Button variant="primary" data-default-focus onClick={onDone}>Done</Button>
			</div>
		</ScreenContainer>
	);
}
