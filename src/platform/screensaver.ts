/* The TV's own screensaver. webOS asks registered apps before starting it; we answer "not now" while
   Vox Folio is showing, and put up our own listening screensaver instead. Polaris uses the same calls
   on this TV. */

import appinfo from '../../webos-meta/appinfo.json';
import {canCallLuna, luna, lunaSubscribe} from './luna';

interface ScreenSaverRequest {
	timestamp?: number | string;
	state?: string;
}

/** `decide()` → true blocks the TV screensaver for this request. Returns a cancel function. */
export function controlTvScreensaver (decide: () => boolean): () => void {
	if (!canCallLuna()) return () => undefined;
	return lunaSubscribe<ScreenSaverRequest>(
		'luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
		{clientName: appinfo.id},
		(msg) => {
			if (!msg.timestamp) return; // the first reply only confirms the registration
			const block = decide();
			luna('luna://com.webos.service.tvpower/power/responseScreenSaverRequest', {
				clientName: appinfo.id,
				ack: !block,
				timestamp: msg.timestamp
			}).catch(() => undefined);
		},
		() => undefined
	);
}
