import {isPremium} from '../app/premium';
import {displayName, initials} from '../app/profiles';
import type {Profile} from '../app/profiles';
import {Tile} from '../components/controls';
import {ScreenContainer} from '../components/ScreenContainer';

interface ProfilesProps {
	profiles: Profile[];
	activeId: string | null;
	onPick: (id: string) => void;
	onAdd: () => void;
}

const TINTS = ['#1F4E5A', '#8A3B2A', '#4F5A2E', '#4A2F4F', '#2E3F66', '#7A5518'];

function host (url: string): string {
	return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

/** "Who's listening?": each Audiobookshelf account added on this TV, with its own progress and settings. */
export default function Profiles ({profiles, activeId, onPick, onAdd}: ProfilesProps) {
	const premium = isPremium();
	return (
		<ScreenContainer id="profiles" className="vf-profiles" restoreKey={activeId ? 'profile:' + activeId : null}>
			<h1 className="vf-profiles__title">Who&apos;s listening?</h1>
			<div className="vf-profiles__row">
				{profiles.map((p, i) => (
					<Tile
						key={p.id}
						className="vf-profile"
						data-focus-key={'profile:' + p.id}
						data-default-focus={i === 0 || undefined}
						aria-label={displayName(p)}
						onClick={() => onPick(p.id)}
					>
						<span className="vf-profile__avatar" style={{background: TINTS[i % TINTS.length]}}>{initials(displayName(p))}</span>
						<span className="vf-profile__name">{displayName(p)}</span>
						<span className="vf-profile__server">{host(p.creds.serverUrl)}</span>
					</Tile>
				))}
				<Tile className="vf-profile vf-profile--add" data-focus-key="profile:add" aria-label="Add someone" onClick={onAdd}>
					<span className="vf-profile__avatar vf-profile__avatar--add">+</span>
					<span className="vf-profile__name">Add someone</span>
					<span className="vf-profile__server">{premium ? 'Sign in with another account' : '★ Vox Folio Premium'}</span>
				</Tile>
			</div>
			<p className="vf-profiles__note">Choose a profile to continue.</p>
		</ScreenContainer>
	);
}
