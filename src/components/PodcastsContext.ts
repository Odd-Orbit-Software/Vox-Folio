import {createContext, useContext} from 'react';

/** True when the account has a podcast library (and Premium is on): the rail shows Podcasts. */
export const PodcastsContext = createContext(false);

export function useHasPodcasts (): boolean {
	return useContext(PodcastsContext);
}
