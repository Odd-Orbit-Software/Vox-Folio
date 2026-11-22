/* The parts of the Audiobookshelf API that Vox Folio reads. Checked against server 2.37.2. */

export interface AbsUser {
	id: string;
	username: string;
	accessToken: string;
	refreshToken?: string;
}

export interface LoginResponse {
	user: AbsUser;
	userDefaultLibraryId?: string;
	serverSettings?: {version?: string};
}

export interface Chapter {
	id: number;
	start: number;
	end: number;
	title: string;
}

export interface AudioTrack {
	index: number;
	/** Seconds from the start of the book where this file begins. */
	startOffset: number;
	duration: number;
	title: string;
	contentUrl: string;
	mimeType: string;
	codec?: string;
}

export interface SeriesRef {
	id: string;
	name: string;
	sequence?: string | null;
}

export interface BookMetadata {
	title: string;
	subtitle?: string | null;
	authorName?: string;
	/** Present on expanded items. */
	authors?: {id: string; name: string}[];
	narratorName?: string;
	/** "Series #seq", comma-separated when a book is in several series (minified listings). */
	seriesName?: string;
	publishedYear?: string | null;
	genres?: string[];
	series?: SeriesRef[];
	description?: string | null;
}

export interface Library {
	id: string;
	name: string;
	mediaType: 'book' | 'podcast';
	displayOrder?: number;
}

export interface Series {
	id: string;
	name: string;
	/** Present in library series listings, in series order. */
	books?: LibraryItem[];
}

export interface Page<T> {
	results: T[];
	total: number;
	limit: number;
	page: number;
}

export interface LibraryItem {
	id: string;
	libraryId: string;
	mediaType: 'book' | 'podcast';
	isMissing?: boolean;
	isInvalid?: boolean;
	addedAt?: number;
	updatedAt?: number;
	media: {
		coverPath?: string | null;
		duration?: number;
		numAudioFiles?: number;
		numChapters?: number;
		/** Podcasts: a show's title is metadata.title and its host metadata.author. */
		metadata: BookMetadata & {author?: string};
		/** Podcasts only. Expanded items carry the episodes; listings only the count. */
		numEpisodes?: number;
		episodes?: PodcastEpisode[];
	};
	/** Podcast items on progress shelves: the episode in progress. */
	recentEpisode?: PodcastEpisode;
}

export interface PodcastEpisode {
	id: string;
	libraryItemId: string;
	title: string;
	subtitle?: string;
	/** HTML from the feed. */
	description?: string;
	/** ms since epoch, or null when the feed gave no date. */
	publishedAt?: number | null;
	duration?: number;
	season?: string;
	episode?: string;
	episodeType?: string;
	/** On recent-episodes listings. */
	podcast?: {metadata: {title: string; author?: string}};
}

export interface MediaProgress {
	libraryItemId: string;
	/** Set for a podcast episode's progress. */
	episodeId?: string | null;
	currentTime: number;
	duration: number;
	progress: number;
	isFinished: boolean;
	lastUpdate: number;
	finishedAt?: number | null;
}

export interface PlaybackSession {
	id: string;
	libraryItemId: string;
	displayTitle: string;
	displayAuthor: string;
	duration: number;
	currentTime: number;
	chapters: Chapter[];
	audioTracks: AudioTrack[];
	/** 0 direct play, 1 direct stream, 2 transcode, 3 local. */
	playMethod: number;
	libraryItem?: LibraryItem;
	mediaMetadata?: BookMetadata;
}

export interface SyncPayload {
	/** Book position in seconds, at 1× regardless of playback speed. */
	currentTime: number;
	/** Seconds actually spent listening since the previous sync. The server reads this exact field name
	    (`timeListened`, not its stored total `timeListening`); with any other name it records nothing. */
	timeListened: number;
	duration: number;
}

export interface Author {
	id: string;
	name: string;
	numBooks?: number;
	imagePath?: string | null;
	description?: string | null;
}

export interface AuthorDetail extends Author {
	libraryItems?: LibraryItem[];
	series?: {id: string; name: string; items?: LibraryItem[]}[];
}

export interface SearchResults {
	book: {libraryItem: LibraryItem}[];
	series: {series: Series; books: LibraryItem[]}[];
	authors: Author[];
	narrators: {name: string; numBooks: number}[];
}

/** One of Audiobookshelf's personalised Home shelves. */
export interface Shelf {
	id: string;
	label?: string;
	type: 'book' | 'series' | 'authors' | 'podcast' | 'episode';
	entities: LibraryItem[];
}

export interface Collection {
	id: string;
	name: string;
	description?: string | null;
	books?: LibraryItem[];
}

export interface Playlist {
	id: string;
	name: string;
	items?: {libraryItemId: string; libraryItem?: LibraryItem}[];
}

export interface Bookmark {
	libraryItemId: string;
	/** Book time in seconds. */
	time: number;
	title: string;
	createdAt: number;
}

export interface ListeningStats {
	totalTime: number;
	/** Seconds listened per day, keyed YYYY-MM-DD. */
	days: Record<string, number>;
	today: number;
}
