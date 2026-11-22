import {useEffect, useState} from 'react';

import {AbsClient, AbsError} from '../abs/client';
import {perfectCorners} from '../app/corners';
import {summarise} from '../app/stats';
import type {StatsSummary} from '../app/stats';
import {Button, Icon} from '../components/controls';
import {errorTitle} from '../components/ErrorPanel';
import {ScreenContainer} from '../components/ScreenContainer';
import {formatDuration} from '../player/timeline';

interface StatsProps {
	client: AbsClient;
	onDone: () => void;
	onYearReview: () => void;
}

function hours (seconds: number): string {
	if (seconds < 60) return '0m';
	return formatDuration(seconds);
}

function days (n: number): string {
	return n + (n === 1 ? ' day' : ' days');
}

/** Listening stats (★): time listened, streaks and books finished. */
export default function Stats ({client, onDone, onYearReview}: StatsProps) {
	const [summary, setSummary] = useState<StatsSummary | null>(null);
	const [error, setError] = useState<AbsError | null>(null);
	// The secret count only appears once you've seen one.
	const [corners] = useState(perfectCorners);
	const [thisYear] = useState(() => new Date().getFullYear());

	useEffect(() => {
		let cancelled = false;
		Promise.all([client.listeningStats(), client.progressByItem()]).then(([stats, progress]) => {
			if (!cancelled) setSummary(summarise(stats, Object.keys(progress).map((k) => progress[k]), new Date()));
		}, (e: unknown) => {
			if (!cancelled) setError(e instanceof AbsError ? e : new AbsError('server', String(e)));
		});
		return () => {
			cancelled = true;
		};
	}, [client]);

	const s = summary;
	const peak = s ? Math.max(1, ...s.lastSevenDays.map((d) => d.seconds)) : 1;
	const noHistory = s && s.totalSeconds === 0 && s.yearSeconds === 0;

	return (
		<ScreenContainer id="stats" className="vf-stats" focusDeps={[summary !== null]}>
			<div className="vf-hint vf-list__back"><Icon name="back" size={24} />Back</div>
			<header className="vf-list__head">
				<div className="vf-eyebrow">Settings</div>
				<h1 className="vf-list__title">Listening stats</h1>
			</header>
			{error && <p className="vf-errorpanel__title">{errorTitle(error)}</p>}
			{s && (
				<>
					<div className="vf-stats__figures">
						<div className="vf-stat"><span className="vf-stat__value">{hours(s.weekSeconds)}</span><span className="vf-stat__label">This week</span></div>
						<div className="vf-stat"><span className="vf-stat__value">{hours(s.yearSeconds)}</span><span className="vf-stat__label">This year</span></div>
						<div className="vf-stat"><span className="vf-stat__value">{hours(s.totalSeconds)}</span><span className="vf-stat__label">All time</span></div>
						<div className="vf-stat"><span className="vf-stat__value">{days(s.currentStreak)}</span><span className="vf-stat__label">{'Streak · best ' + days(s.longestStreak)}</span></div>
					</div>
					<div className="vf-stats__lower">
						<section className="vf-stats__chart" aria-label="Last seven days">
							<h2 className="vf-eyebrow">Last seven days</h2>
							<div className="vf-bars">
								{s.lastSevenDays.map((d) => (
									<div key={d.key} className="vf-bars__col">
										<span className="vf-bars__value">{d.seconds >= 60 ? formatDuration(d.seconds) : ''}</span>
										<span className="vf-bars__bar" style={{height: Math.round((d.seconds / peak) * 220) + 'px'}} />
										<span className="vf-bars__label">{d.label}</span>
									</div>
								))}
							</div>
						</section>
						<section className="vf-stats__books" aria-label="Books">
							<h2 className="vf-eyebrow">Books</h2>
							<dl className="vf-facts">
								<dt>Finished this year</dt>
								<dd>{s.finishedThisYear}</dd>
								<dt>Finished in total</dt>
								<dd>{s.finishedTotal}</dd>
								<dt>In progress</dt>
								<dd>{s.inProgress}</dd>
							</dl>
							{corners > 0 && <p className="vf-stats__corners">{'Perfect corners: ' + corners}</p>}
						</section>
					</div>
					{noHistory && <p className="vf-stats__note">No listening time recorded for this account yet.</p>}
				</>
			)}
			<div className="vf-stats__done">
				<Button variant="primary" data-default-focus onClick={onDone}>Done</Button>
				<Button data-focus-key="year" onClick={onYearReview}>{'Your ' + thisYear + ' in review'}</Button>
			</div>
		</ScreenContainer>
	);
}
