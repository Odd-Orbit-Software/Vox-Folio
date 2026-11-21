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
	narratorName?: string;
	seriesName?: string;
	series?: SeriesRef[];
	description?: string | null;
}

export interface LibraryItem {
	id: string;
	libraryId: string;
	mediaType: 'book' | 'podcast';
	isMissing?: boolean;
	isInvalid?: boolean;
	updatedAt?: number;
	media: {
		coverPath?: string | null;
		duration?: number;
		numAudioFiles?: number;
		numChapters?: number;
		metadata: BookMetadata;
	};
}

export interface MediaProgress {
	libraryItemId: string;
	currentTime: number;
	duration: number;
	progress: number;
	isFinished: boolean;
	lastUpdate: number;
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
	/** Seconds actually spent listening since the previous sync. */
	timeListening: number;
	duration: number;
}
