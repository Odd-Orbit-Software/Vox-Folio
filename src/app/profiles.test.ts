import type {Credentials} from '../abs/client';
import {activeProfile, addProfile, initials, loadProfiles, removeProfile, setActive, updateCreds} from './profiles';

const creds = (userId: string, username = userId): Credentials => ({
	serverUrl: 'https://abs.test', userId, username, accessToken: 'a-' + userId, refreshToken: 'r-' + userId
});

beforeEach(() => window.localStorage.clear());

test('migrates the sign-in saved before profiles existed', () => {
	window.localStorage.setItem('voxfolio.credentials.v1', JSON.stringify(creds('u1', 'peter')));
	const state = loadProfiles();
	expect(state.profiles).toHaveLength(1);
	expect(activeProfile(state)!.creds.username).toBe('peter');
	expect(window.localStorage.getItem('voxfolio.credentials.v1')).toBeNull();
	expect(loadProfiles()).toEqual(state);
});

test('adding the same account again refreshes it rather than duplicating it', () => {
	let {state} = addProfile({profiles: [], activeId: null}, creds('u1'));
	({state} = addProfile(state, creds('u2')));
	({state} = addProfile(state, {...creds('u1'), accessToken: 'new'}));
	expect(state.profiles).toHaveLength(2);
	expect(activeProfile(state)!.creds.accessToken).toBe('new');
});

test('switching, rotating tokens and removing', () => {
	let {state} = addProfile({profiles: [], activeId: null}, creds('u1'));
	const first = state.activeId!;
	({state} = addProfile(state, creds('u2')));
	state = setActive(state, first);
	expect(activeProfile(state)!.creds.userId).toBe('u1');
	state = updateCreds(state, first, {...creds('u1'), refreshToken: 'rotated'});
	expect(activeProfile(state)!.creds.refreshToken).toBe('rotated');
	state = removeProfile(state, first);
	expect(state.profiles).toHaveLength(1);
	expect(state.activeId).toBeNull();
});

test('initials', () => {
	expect(initials('peter')).toBe('PE');
	expect(initials('Peter McKinney')).toBe('PM');
	expect(initials('claude-test')).toBe('CT');
});
