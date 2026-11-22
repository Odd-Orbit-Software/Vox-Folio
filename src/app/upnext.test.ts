import type {PodcastEpisode} from '../abs/types';

import {fromEpisode, nextEpisode} from './upnext';

const ep = (id: string, day: number): PodcastEpisode => ({id, libraryItemId: 'show', title: ' ' + id + ' ', publishedAt: Date.UTC(2026, 10, day)});
const episodes = [ep('part-two', 19), ep('part-one', 17), ep('older', 10)];

test('the next episode is the one published after this one', () => {
	expect(nextEpisode(episodes, 'part-one')!.id).toBe('part-two');
	expect(nextEpisode(episodes, 'older')!.id).toBe('part-one');
	expect(nextEpisode(episodes, 'part-two')).toBeNull();
	expect(nextEpisode(episodes, 'missing')).toBeNull();
	// Already played episodes are skipped.
	expect(nextEpisode(episodes, 'older', (id) => id === 'part-one')!.id).toBe('part-two');
	expect(nextEpisode(episodes, 'part-one', (id) => id === 'part-two')).toBeNull();
});

test('an episode as Up Next', () => {
	expect(fromEpisode(episodes[0], 'Behind the Bastards', true)).toEqual({
		key: 'show/part-two', itemId: 'show', episodeId: 'part-two', title: 'part-two', author: 'Behind the Bastards', sequence: null, date: '19 Nov 2026', hasCover: true
	});
});
