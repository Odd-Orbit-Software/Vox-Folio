/* Vox Folio Premium (docs/plans/roadmap.md#premium): a one-time unlock to support development.
   Every premium check goes through isPremium(), so making a feature free later is a one-line change.

   The licence service and the unlock screen aren't built yet, so everything is unlocked for now. */

export function isPremium (): boolean {
	return true;
}

/** Premium features, for labels and the future unlock screen. */
export const PREMIUM_FEATURES = ['Household profiles', 'Listening stats', 'Podcasts', 'Screensaver extras'];
