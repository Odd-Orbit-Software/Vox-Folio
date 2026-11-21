import {decideLaunch} from './launch';
import {requestedItemId} from '../platform/webos';

describe('requestedItemId', () => {
	it('reads the Polaris payload', () => {
		expect(requestedItemId({abs: 'li_123'})).toBe('li_123');
		expect(requestedItemId({abs: '  li_123 '})).toBe('li_123');
	});

	it('ignores empty or missing IDs', () => {
		expect(requestedItemId({})).toBeNull();
		expect(requestedItemId({abs: ''})).toBeNull();
		expect(requestedItemId({abs: 42})).toBeNull();
	});
});

describe('decideLaunch', () => {
	it('does nothing without a request', () => {
		expect(decideLaunch(null, {signedIn: true, currentItemId: 'a'})).toEqual({type: 'none'});
	});

	it('keeps the request through sign-in', () => {
		expect(decideLaunch('a', {signedIn: false, currentItemId: null})).toEqual({type: 'defer', itemId: 'a'});
	});

	it('brings the current book forward instead of starting a second stream', () => {
		expect(decideLaunch('a', {signedIn: true, currentItemId: 'a'})).toEqual({type: 'showPlayer'});
	});

	it('opens a different book', () => {
		expect(decideLaunch('b', {signedIn: true, currentItemId: 'a'})).toEqual({type: 'open', itemId: 'b'});
		expect(decideLaunch('b', {signedIn: true, currentItemId: null})).toEqual({type: 'open', itemId: 'b'});
	});
});
