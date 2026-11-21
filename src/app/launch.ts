/* What to do with an incoming title request (cold launch or relaunch). See docs/plans/playback-and-launch.md. */

export type LaunchAction =
	/** Nothing was requested. */
	| {type: 'none'}
	/** Not signed in yet: keep the ID and open it once setup finishes. */
	| {type: 'defer'; itemId: string}
	/** The requested book is already loaded: bring the player forward, keep position and play state. */
	| {type: 'showPlayer'}
	/** Open this book, saving and closing any other session first. */
	| {type: 'open'; itemId: string};

export interface LaunchContext {
	signedIn: boolean;
	/** The book loaded in the player (playing or paused), if any. */
	currentItemId: string | null;
}

export function decideLaunch (itemId: string | null, ctx: LaunchContext): LaunchAction {
	if (!itemId) return {type: 'none'};
	if (!ctx.signedIn) return {type: 'defer', itemId};
	if (ctx.currentItemId === itemId) return {type: 'showPlayer'};
	return {type: 'open', itemId};
}
