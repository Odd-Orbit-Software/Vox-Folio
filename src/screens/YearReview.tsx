import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import {monthsOfYear, normaliseYearStats, summariseYear} from '../app/yearReview';
import type {YearSummary} from '../app/yearReview';
import {Button, Cover, Icon, Tile} from '../components/controls';
import {errorTitle} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';

interface YearReviewProps {
	client: AbsClient;
	onDone: () => void;
	/** Open on this year (Home's prompt); this year otherwise. */
	initialYear?: number;
	/** OK on a cover opens that book. */
	onOpenTitle: (itemId: string, fromKey: string) => void;
	restoreKey?: string | null;
}

/* Kept while the app runs (per account), so Back from a book returns to the same year at once. */
const cache = new WeakMap<AbsClient, {year: number; years: Record<number, YearSummary>}>();

/** "A, B and C" for a short list. */
function listText (items: string[]): string {
	if (items.length < 2) return items.join('');
	return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function hoursLabel (seconds: number): string {
	return seconds >= 3600 ? Math.round(seconds / 3600) + 'h' : Math.round(seconds / 60) + 'm';
}

/** The year's rhythm: one bar per month, the busiest in brass with its total. Months still to come
    are left empty. Single series, so no legend; the label reads the values out. */
function MonthStrip ({months, upTo}: {months: number[]; upTo: number}) {
	const peak = Math.max(...months);
	if (peak <= 0) return null;
	const busiest = months.indexOf(peak);
	const label = 'Listening by month: ' + months.slice(0, upTo + 1).map((v, i) => MONTH_NAMES[i] + ' ' + hoursLabel(v)).join(', ');
	return (
		<figure className="vf-months" aria-label={label}>
			{months.map((v, i) => (
				<div key={i} className={'vf-months__col' + (i === busiest ? ' is-peak' : '') + (i > upTo ? ' is-future' : '')}>
					<span className="vf-months__value">{i === busiest ? hoursLabel(v) : ''}</span>
					<span className="vf-months__bar" style={{height: v > 0 ? Math.max(4, Math.round((v / peak) * 88)) + 'px' : '0px'}} />
					<span className="vf-months__label">{MONTH_INITIALS[i]}</span>
				</div>
			))}
		</figure>
	);
}

/** This year and the two before it. */
function yearsOffered (now: Date): number[] {
	const y = now.getFullYear();
	return [y, y - 1, y - 2];
}

/** ★ Year in Review: one page per year, from Audiobookshelf's own yearly stats. */
export default function YearReview ({client, onDone, initialYear, onOpenTitle, restoreKey}: YearReviewProps) {
	const [now] = useState(() => new Date());
	const [year, setYear] = useState(() => initialYear || (cache.get(client) ? cache.get(client)!.year : now.getFullYear()));
	// Each year is fetched once per visit, so flipping between them is instant.
	const [years, setYears] = useState<Record<number, YearSummary>>(() => (cache.get(client) ? cache.get(client)!.years : {}));
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

	useEffect(() => {
		cache.set(client, {year, years});
	}, [client, year, years]);

	// Seconds per day across all years, for the month strip (one fetch per visit).
	const [days, setDays] = useState<Record<string, number> | null>(null);
	useEffect(() => {
		let cancelled = false;
		client.listeningStats().then((st) => {
			if (!cancelled) setDays(st.days);
		}, () => undefined);
		return () => {
			cancelled = true;
		};
	}, [client]);

	const s = years[year] || null;
	const loading = !s && !error;
	const current = year === now.getFullYear();

	return (
		<ScreenContainer id="year-review" className="vf-year" restoreKey={restoreKey} focusDeps={[s !== null]}>
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
								<strong>{s.booksFinished + (s.booksFinished === 1 ? ' book' : ' books')}</strong>{s.booksListened > s.booksFinished ? ' finished, of ' + s.booksListened + ' you listened to' : ' finished'}
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

			{s && !s.empty && (
				<div className="vf-year__side">
					{s.covers.length > 0 && (
						<div className={'vf-year__covers vf-year__covers--' + Math.min(12, s.covers.length)} aria-label={'Covers of what you listened to in ' + year}>
							{s.covers.map((id) => (
								<Tile key={id} className="vf-year__cover" data-focus-key={'cover:' + id} aria-label="Open this book" onClick={() => onOpenTitle(id, 'cover:' + id)}>
									<Cover url={client.coverUrl(id, 360)} title="" size={s.covers.length > 4 ? 180 : 260} />
								</Tile>
							))}
						</div>
					)}
					{days && <MonthStrip months={monthsOfYear(year, days)} upTo={current ? now.getMonth() : 11} />}
				</div>
			)}
		</ScreenContainer>
	);
}
