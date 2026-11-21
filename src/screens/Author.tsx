import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import type {AuthorDetail, MediaProgress} from '../abs/types';
import {orderSeries} from '../app/series';
import {Button, Cover, Icon} from '../components/controls';
import type {GridItem} from '../components/CoverGrid';
import {CoverRow, VScroll} from '../components/Rows';
import {ScreenContainer} from '../components/ScreenContainer';
import {toGridItem} from './Library';

interface AuthorProps {
	client: AbsClient;
	authorId: string;
	authorName: string;
	restoreKey: string | null;
	onOpenTitle: (itemId: string, fromKey: string) => void;
}

type Load = {state: 'loading'} | {state: 'error'; error: AbsError} | {state: 'ready'; author: AuthorDetail; progress: Record<string, MediaProgress>};

/** An author's books, one row per series in series order, then everything else. */
export default function Author ({client, authorId, authorName, restoreKey, onOpenTitle}: AuthorProps) {
	const [load, setLoad] = useState<Load>({state: 'loading'});
	const [reload, setReload] = useState(0);

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.author(authorId), client.progressByItem()]).then(([author, progress]) => {
			if (!cancelled) setLoad({state: 'ready', author, progress});
		}, (e: unknown) => {
			if (!cancelled) setLoad({state: 'error', error: e instanceof AbsError ? e : new AbsError('server', String(e))});
		});
		return () => {
			cancelled = true;
		};
	}, [client, authorId, reload]);

	const author = load.state === 'ready' ? load.author : null;
	const progress = load.state === 'ready' ? load.progress : {};
	const inSeries = new Set<string>();
	const rows: {title: string; items: GridItem[]}[] = [];
	if (author) {
		(author.series || []).forEach((s) => {
			const ordered = orderSeries(s.items || [], s.id, s.name);
			ordered.forEach((e) => inSeries.add(e.item.id));
			rows.push({
				title: s.name,
				items: ordered.map((e) => {
					const g = toGridItem(client, e.item, progress[e.item.id]);
					return {...g, badge: e.sequence ? '#' + e.sequence : undefined};
				})
			});
		});
		const others = (author.libraryItems || []).filter((i) => !inSeries.has(i.id));
		if (others.length) {
			rows.push({title: rows.length ? 'Other books' : 'Books', items: others.map((i) => toGridItem(client, i, progress[i.id]))});
		}
	}
	const total = author ? (author.libraryItems || []).length : 0;

	return (
		<ScreenContainer id="author" className="vf-author" restoreKey={restoreKey} focusDeps={[load.state]}>
			<div className="vf-hint vf-author__back"><Icon name="back" size={24} />Back</div>
			<header className="vf-author__head">
				<Cover url={author && author.imagePath ? client.authorImageUrl(authorId, 300) : ''} title={authorName} size={160} className="vf-author__portrait" round />
				<div className="vf-author__text">
					<div className="vf-eyebrow">Author</div>
					<h1 className="vf-author__name">{authorName}</h1>
					{author && <div className="vf-author__meta">{total + (total === 1 ? ' book' : ' books') + (author.series && author.series.length ? ' · ' + author.series.length + ' series' : '')}</div>}
					{author && author.description && <p className="vf-author__desc">{author.description}</p>}
				</div>
			</header>
			{load.state === 'error' && (
				<div className="vf-author__message">
					<p className="vf-message__body">{load.error.message}</p>
					<Button variant="primary" data-default-focus onClick={() => {
						setLoad({state: 'loading'});
						setReload((n) => n + 1);
					}}
					>
						Retry
					</Button>
				</div>
			)}
			<VScroll className="vf-author__rows">
				{rows.map((r, i) => (
					<CoverRow
						key={r.title + i}
						title={r.title}
						meta={String(r.items.length)}
						items={r.items}
						defaultFocus={i === 0}
						onSelect={(g) => onOpenTitle(g.key.slice(5), g.key)}
					/>
				))}
			</VScroll>
		</ScreenContainer>
	);
}
