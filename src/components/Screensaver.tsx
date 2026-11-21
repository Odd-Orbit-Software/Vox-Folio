import type {PlayerState} from '../player/engine';
import {Clock} from './Clock';
import {Cover} from './controls';

/** The listening screensaver (design canvas board 10): the time and the current book drift slowly around
    a near-black screen, the percentage updating as the narration continues. Without a book, the time
    and the wordmark drift. */
export function Screensaver ({player}: {player: PlayerState}) {
	const book = player.itemId && player.status !== 'error' && player.title ? player : null;
	const percent = book && book.duration ? Math.floor((book.position / book.duration) * 100) : 0;
	const chapter = book && book.chapterIndex >= 0 ? book.chapters[book.chapterIndex] : null;

	return (
		<div className="vf-saver" aria-hidden="true">
			<div className="vf-saver__y">
				<div className="vf-saver__x">
					{book ? (
						<div className="vf-saver__card">
							<Cover url={book.coverUrl} title={book.title} author={book.author} size={280} className="vf-saver__cover" />
							<div className="vf-saver__text">
								<Clock className="vf-saver__clock" />
								<div className="vf-saver__title">{book.title}</div>
								<div className="vf-saver__chapter">
									{chapter ? chapter.title : book.author}
									{book.status === 'paused' ? ' · Paused' : ''}
								</div>
								<div className="vf-saver__progress">
									<div className="vf-bar vf-saver__bar"><div className="vf-bar__fill" style={{width: percent + '%'}} /></div>
									<span className="vf-saver__pct">{percent + '%'}</span>
								</div>
							</div>
						</div>
					) : (
						<div className="vf-saver__card vf-saver__card--idle">
							<Clock className="vf-saver__clock vf-saver__clock--big" />
							<div className="vf-wordmark">Vox Folio</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
