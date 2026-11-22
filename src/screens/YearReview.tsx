import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import {normaliseYearStats, summariseYear} from '../app/yearReview';
import type {YearSummary} from '../app/yearReview';
import {Button, Cover, Icon} from '../components/controls';
import {errorTitle} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';

interface YearReviewProps {
	client: AbsClient;
	onDone: () => void;
}

/** "A, B and C" for a short list. */
function listText (items: string[]): string {
	if (items.length < 2) return items.join('');
	return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/** This year and the two before it. */
function yearsOffered (now: Date): number[] {
	const y = now.getFullYear();
	return [y, y - 1, y - 2];
}

/** ★ Year in Review: one page per year, from Audiobookshelf's own yearly stats. */
export default function YearReview ({client, onDone}: YearReviewProps) {
	const [now] = useState(() => new Date());
	const [year, setYear] = useState(() => now.getFullYear());
	// Each year is fetched once per visit, so flipping between them is instant.
	const [years, setYears] = useState<Record<number, YearSummary>>({});
	const [error, setError] = useState<AbsError | null>(null);
	const [retry, setRetry] = useState(0);

	useEffect(() => {
		if (years[year]) return undefined;
		let cancelled = false;
		client.yearStats(year).then((raw) => {
			if (!cancelled) setYears((prev) => ({...prev, [year]: summariseYear(year, normaliseYearStats(raw), now)}));
		}, (e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client, year, now, years, retry]);

	const s = years[year] || null;
	const loading = !s && !error;
	const current = year === now.getFullYear();

	return (
		<ScreenContainer id="year-review" className="vf-year" focusDeps={[s !== null]}>
			<div className="vf-hint vf-year__back"><Icon name="back" size={24} />Back</div>

			<div className="vf-year__main">
				<div className="vf-eyebrow vf-eyebrow--brass">Your year in listening</div>
				<div className="vf-year__years" role="group" aria-label="Year">
					{yearsOffered(now).map((y) => (
						<Button
							key={y}
							variant="chip"
							className={'vf-year__chip' + (y === year ? ' is-selected' : '')}
							aria-pressed={y === year}
							data-focus-key={'year:' + y}
							onClick={() => {
								setError(null);
								setYear(y);
							}}
						>
							{String(y)}
						</Button>
					))}
				</div>

				{error && (
					<div className="vf-year__empty">
						<p className="vf-errorpanel__title">{errorTitle(error)}</p>
						<Button onClick={() => {
							setError(null);
							setRetry((n) => n + 1);
						}}
						>
							Retry
						</Button>
					</div>
				)}
				{loading && <div className="vf-skeleton vf-skeleton--title vf-year__loading" aria-busy="true" />}

				{s && s.empty && (
					<div className="vf-year__empty">
						<h1 className="vf-year__headline">{current ? 'Nothing yet in ' + year : 'No listening in ' + year}</h1>
						<p className="vf-message__body">{current ? 'Start a book and this page fills in as you listen.' : 'Audiobookshelf has no listening recorded for that year.'}</p>
					</div>
				)}

				{s && !s.empty && (
					<>
						<h1 className={'vf-year__headline' + (s.hours < 3 ? ' vf-year__headline--light' : '')}>{s.headline}</h1>
						<p className="vf-year__sub">{'of listening in ' + year + (current ? ' so far' : '') + (s.perWeek ? ' · about ' + s.perWeek : '')}</p>

						<div className="vf-year__story">
							{s.topAuthor && (
								<p>
									{'Mostly '}<strong>{s.topAuthor}</strong>
									{s.topNarrator ? <>{', mostly in the voice of '}<strong>{s.topNarrator}</strong></> : null}
									{'.'}
								</p>
							)}
							<p>
								<strong>{s.booksFinished + (s.booksFinished === 1 ? ' book' : ' books')}</strong>{' finished, of ' + s.booksListened + ' you listened to'}
								{s.busiestMonth ? <>{'. Your busiest month was '}<strong>{s.busiestMonth}</strong></> : null}
								{'.'}
							</p>
							{s.topGenres.length > 0 && <p>{'Plenty of '}<strong>{listText(s.topGenres)}</strong>{s.podcastShare >= 0.05 ? ', and ' + Math.round(s.podcastShare * 100) + '% podcasts.' : '.'}</p>}
						</div>

						{s.longest && (
							// The server names this book by its media ID, not its library item, so there's no cover to show.
							<div className="vf-year__hero">
								<div>
									<div className="vf-eyebrow vf-eyebrow--brass">Longest book you finished</div>
									<div className="vf-year__herotitle">{s.longest.title}</div>
									<div className="vf-muted">{s.longest.hours}</div>
								</div>
							</div>
						)}
					</>
				)}

				<div className="vf-year__done">
					<Button variant="primary" data-default-focus onClick={onDone}>Done</Button>
				</div>
			</div>

			{s && s.covers.length > 0 && (
				<div className={'vf-year__covers vf-year__covers--' + Math.min(12, s.covers.length)} aria-label={'Covers of what you listened to in ' + year}>
					{s.covers.map((id) => (
						<Cover key={id} url={client.coverUrl(id, 360)} title="" size={s.covers.length > 4 ? 180 : 260} className="vf-year__cover" />
					))}
				</div>
			)}
		</ScreenContainer>
	);
}
