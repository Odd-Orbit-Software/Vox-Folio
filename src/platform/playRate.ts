/* Playback speed with sound on webOS.

   The TV's web app container mutes audio whenever a media element's `playbackRate` isn't 1, so on
   webOS we never set it. Instead we ask the TV's media service to change the rate of our element's
   pipeline with audio output kept on:

     luna://com.webos.media/setPlayRate {mediaId, playRate, audioOutput: true}

   Checked on the target TV: the element's pipeline is a managed "media" pipeline owned by our app ID,
   and the call keeps sound (pitch-corrected) at 1.15×. A new pipeline starts at 1×, so the rate is
   re-applied whenever a file loads or playback starts. In a desktop browser we use playbackRate. */

import appinfo from '../../webos-meta/appinfo.json';
import {canCallLuna, luna} from './luna';
import {isWebOS} from './webos';

interface Pipeline {
	id: string;
	appId?: string;
	type?: string;
	uri?: string;
	is_managed?: boolean;
}

/** The media pipeline ID behind our element. webOS Chromium exposes `mediaId` on media elements a
    moment after loading; failing that, find our app's managed pipeline playing the same file. */
async function findMediaId (el: HTMLMediaElement): Promise<string | null> {
	const direct = (el as unknown as {mediaId?: string}).mediaId;
	if (direct) return direct;
	const res = await luna<{pipelines?: Pipeline[]} | Pipeline[]>('luna://com.webos.media/getActivePipelines', {});
	const list = Array.isArray(res) ? res : (res.pipelines || []);
	const src = el.currentSrc || el.src;
	const path = src.split('?')[0];
	const ours = list.filter((p) => p.appId === appinfo.id && p.type === 'media');
	const match = ours.filter((p) => p.uri && p.uri.split('?')[0] === path);
	const pick = match[match.length - 1] || ours[ours.length - 1];
	return pick ? pick.id : null;
}

const RETRY_MS = 500;
const MAX_TRIES = 20;

/** Applies the playback rate to one media element, retrying until the pipeline exists. */
export class PlayRateController {
	private wanted = 1;
	private generation = 0;

	constructor (private readonly el: HTMLMediaElement) {}

	/** Ask for `rate`; call again after every load or play so a fresh pipeline gets it too. */
	apply (rate: number): void {
		this.wanted = rate;
		if (!isWebOS() || !canCallLuna()) {
			this.el.defaultPlaybackRate = rate;
			this.el.playbackRate = rate;
			return;
		}
		// Never set playbackRate on webOS: any value but 1 mutes the audio.
		if (this.el.playbackRate !== 1) this.el.playbackRate = 1;
		const generation = ++this.generation;
		const attempt = (tries: number) => {
			if (generation !== this.generation) return;
			findMediaId(this.el)
				.then((mediaId) => {
					if (generation !== this.generation) return undefined;
					if (!mediaId) throw new Error('no pipeline yet');
					return luna('luna://com.webos.media/setPlayRate', {mediaId, playRate: this.wanted, audioOutput: true});
				})
				.catch(() => {
					if (tries + 1 < MAX_TRIES) window.setTimeout(() => attempt(tries + 1), RETRY_MS);
				});
		};
		attempt(0);
	}

	get rate (): number {
		return this.wanted;
	}
}
