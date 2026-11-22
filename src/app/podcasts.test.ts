import type {MediaProgress, PodcastEpisode} from '../abs/types';

import {episodeDate, episodeLength, episodeState, episodeTileDate, episodeTitle, plainText} from './podcasts';

const ep: PodcastEpisode = {id: 'e1', libraryItemId: 's1', title: '  Part One:  The  Start ', publishedAt: Date.UTC(2026, 10, 19, 10), duration: 3600};

function progress (p: Partial<MediaProgress>): Record<string, MediaProgress> {
	return {'s1/e1': {libraryItemId: 's1', episodeId: 'e1', currentTime: 0, duration: 3600, progress: 0, isFinished: false, lastUpdate: 0, ...p}};
}

test('tidies titles and dates', () => {
	expect(episodeTitle(ep)).toBe('Part One: The Start');
	expect(episodeDate(ep)).toBe('19 Nov 2026');
	expect(episodeDate({...ep, publishedAt: null})).toBe('');
	expect(episodeTileDate(ep, new Date(2026, 11, 1))).toBe('19 Nov');
	expect(episodeTileDate(ep, new Date(2027, 0, 5))).toBe('19 Nov 2026');
});

test('reads an episode\'s progress by show and episode', () => {
	expect(episodeState(ep, {})).toEqual({finished: false, percent: 0, left: null});
	expect(episodeState(ep, progress({currentTime: 900, progress: 0.25}))).toEqual({finished: false, percent: 25, left: 2700});
	expect(episodeState(ep, progress({isFinished: true}))).toEqual({finished: true, percent: 100, left: null});
	// A book's progress (no episode) never counts for an episode.
	expect(episodeState(ep, {s1: {libraryItemId: 's1', currentTime: 900, duration: 3600, progress: 0.25, isFinished: false, lastUpdate: 0}}).percent).toBe(0);
});

test('lengths and plain descriptions', () => {
	expect(episodeLength(ep, {finished: false, percent: 0, left: null})).toBe('1h 00m');
	expect(episodeLength(ep, {finished: false, percent: 25, left: 2700})).toBe('45m left');
	expect(plainText('<p>Robert <b>concludes</b></p><p>the story.</p>')).toBe('Robert concludes the story.');
});
