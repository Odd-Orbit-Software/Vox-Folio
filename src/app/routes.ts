/* The app's screens as a stack, so Back returns to the previous screen with focus on what you left. */

export type Route =
	| {name: 'setup'; adding?: boolean}
	| {name: 'profiles'}
	| {name: 'home'}
	| {name: 'library'}
	| {name: 'series'}
	| {name: 'seriesDetail'; libraryId: string; seriesId: string; seriesName: string; focusItemId?: string}
	| {name: 'details'; itemId: string}
	| {name: 'player'}
	| {name: 'settings'}
	| {name: 'stats'}
	| {name: 'yearReview'; year?: number}
	| {name: 'diagnostics'}
	| {name: 'remoteHelp'}
	| {name: 'search'}
	| {name: 'authors'}
	| {name: 'author'; authorId: string; authorName: string}
	| {name: 'collections'; libraryId: string}
	| {name: 'books'; title: string; source: BookSource}
	| {name: 'about'}
	| {name: 'podcasts'}
	| {name: 'podcast'; itemId: string; title: string};

/** Where a plain list of books comes from. */
export type BookSource =
	| {kind: 'narrator'; libraryId: string; name: string}
	| {kind: 'collection'; id: string}
	| {kind: 'playlist'; id: string};

export interface Entry {
	route: Route;
	/** `data-focus-key` of the item that was selected here, restored when we come back. */
	focusKey: string | null;
}

/** Screens reachable from the side rail. Back from any of them goes Home (or to the player). */
export const TABS: Route['name'][] = ['home', 'search', 'library', 'series', 'authors', 'podcasts', 'settings'];

export function entry (route: Route): Entry {
	return {route, focusKey: null};
}

/** Push `route`, remembering `fromKey` as the focus to restore on the current screen. */
export function push (stack: Entry[], route: Route, fromKey?: string | null): Entry[] {
	const top = stack[stack.length - 1];
	const kept = fromKey !== undefined && top ? stack.slice(0, -1).concat({...top, focusKey: fromKey}) : stack;
	return kept.concat(entry(route));
}

export function pop (stack: Entry[]): Entry[] {
	return stack.length > 1 ? stack.slice(0, -1) : stack;
}

/** Make `route` the only screen (rail tabs, sign-in, sign-out). */
export function reset (route: Route): Entry[] {
	return [entry(route)];
}
