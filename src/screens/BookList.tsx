import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {LibraryItem, MediaProgress} from '../abs/types';
import type {BookSource} from '../app/routes';
import {Icon} from '../components/controls';
import {CoverGrid} from '../components/CoverGrid';
import {ErrorPanel} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';
import {toGridItem} from './Library';

interface BookListProps {
	client: AbsClient;
	title: string;
	source: BookSource;
	restoreKey: string | null;
	onOpenTitle: (itemId: string, fromKey: string) => void;
}

function loadBooks (client: AbsClient, source: BookSource): Promise<LibraryItem[]> {
	if (source.kind === 'narrator') return client.narratorBooks(source.libraryId, source.name);
	if (source.kind === 'collection') return client.collection(source.id).then((c) => c.books || []);
	return client.playlist(source.id).then((p) => (p.items || []).map((i) => i.libraryItem).filter(Boolean) as LibraryItem[]);
}

const EYEBROW: Record<BookSource['kind'], string> = {narrator: 'Read by', collection: 'Collection', playlist: 'Playlist'};

/** A plain grid of books: a narrator's work, a collection or a playlist. */
export default function BookList ({client, title, source, restoreKey, onOpenTitle}: BookListProps) {
	const [books, setBooks] = useState<LibraryItem[] | null>(null);
	const [progress, setProgress] = useState<Record<string, MediaProgress>>({});
	const [error, setError] = useState<AbsError | null>(null);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		let cancelled = false;
		Promise.all([loadBooks(client, source), client.progressByItem()]).then(([b, p]) => {
			if (cancelled) return;
			setBooks(b.filter((i) => i.mediaType === 'book'));
			setProgress(p);
		}, (e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, source, reload]);

	return (
		<ScreenContainer id="books" className="vf-list" restoreKey={restoreKey} focusDeps={[books !== null, error]}>
			<div className="vf-hint vf-list__back"><Icon name="back" size={24} />Back</div>
			<header className="vf-list__head">
				<div className="vf-eyebrow">{EYEBROW[source.kind]}</div>
				<h1 className="vf-list__title">{title}</h1>
				{books && <span className="vf-muted vf-browse__count">{books.length + (books.length === 1 ? ' book' : ' books')}</span>}
			</header>
			{error ? (
				<ErrorPanel error={error} onRetry={() => {
					setError(null);
					setReload((n) => n + 1);
				}}
				/>
			) : (
				<CoverGrid items={(books || []).map((b) => toGridItem(client, b, progress[b.id]))} loading={books === null} onSelect={(g) => onOpenTitle(g.key.slice(5), g.key)} />
			)}
		</ScreenContainer>
	);
}
