# Roadmap

The homebrew app in the [product plan](product.md) is complete: library, series, title details, series autoplay, playback speed and the listening screensaver all work on the TV. These features come next. Each group is a batch that can ship on its own, in the suggested order. Features marked ★ are part of [Vox Folio Premium](#premium).

## 1. Listening comfort

| Feature | What the listener can do | Notes |
| --- | --- | --- |
| Sleep timer | Set 15, 30, 45 or 60 minutes, or "end of chapter", from the player with Yellow or a button. The audio fades out over the last 10 s. Before stopping, "Still listening?" appears, and any key adds the same time again. | Yellow is already reserved for this in the [remote mapping](ux.md). Pausing at the end syncs as normal. The screensaver shows the time remaining. |
| Smart rewind | After a pause, playback resumes a little earlier, and further the longer the pause was: about 5 s after a minute, 15 s after ten minutes and 30 s after an hour, never before the start of the chapter. | Applies to resuming in the player, from Home and after another device's catch-up. It doesn't apply to seeks. |
| Settings | Change the skip lengths (10, 15, 30, 45 or 60 s), the default speed, series autoplay, the default sleep timer and smart rewind. Change server or account. | Reached from the rail. About moves here as a section. Stored the same way as the current speed and autoplay settings. |

## 2. Finding books

| Feature | What the listener can do | Notes |
| --- | --- | --- |
| Search | Find books by title, author, narrator or series with the TV keyboard, including the remote's voice input. Results appear in groups as you type. | `GET /api/libraries/{id}/search?q=`. Uses the existing text field pattern. A rail entry, as in the mockups. |
| Continue the series | A Home row with the next unstarted book of each series where you've finished a book and haven't started the next. | Reuses `nextInSeries`. |
| Authors | Browse authors, open one, and see their books grouped by series. | Audiobookshelf author endpoints. |
| Collections | Browse the server's collections and playlists. | Read-only on the TV. |

## 3. A shared TV

| Feature | What the listener can do | Notes |
| --- | --- | --- |
| Household profiles ★ | Pick who's listening at launch, from the Audiobookshelf accounts added on this TV, each with their own progress, Continue Listening and settings. Switch profile from the rail. | Each profile keeps its own tokens. A title launch from Polaris opens for the profile that last listened to that book, or asks. The screensaver shows whose book is playing. |
| Bookmarks | Add a bookmark at the current moment with one press. List them in the player and jump to one. | Audiobookshelf's per-user bookmarks, so they also appear in Absorb. |

## 4. Polish

| Feature | What the listener can do | Notes |
| --- | --- | --- |
| Instant start | Home appears immediately from the last session's data, then refreshes. | Cache the Home and library first pages in localStorage. Never cache tokens beside them. |
| Screensaver night mode ★ | Late at night the screensaver dims further and drifts more slowly. | Gentler on an OLED panel and in a dark room. Uses the TV's clock. |
| Listening stats ★ | See time listened this week and this year, books finished and longest streak. | `GET /api/me/listening-stats`. Could have a seasonal summary in the Polaris style. |
| Podcasts ★ | Play podcast episodes from Audiobookshelf podcast libraries, with the same resume and sync. | Polaris could then send podcast Continue cards to Vox Folio instead of Tonalo. Needs episode lists and a per-episode playback session. |

## Premium

A one-time unlock to support development. It's an honest-support model, not copy protection: a homebrew app can be patched, and that's accepted. Everything needed to play and sync your own books stays free.

| Free | Premium ★ |
| --- | --- |
| Sign-in, Home, Library, Series and title details | Household profiles |
| Playback, sync with other devices, chapters, 0.5–2× speed | Listening stats |
| Opening a book from Polaris | Podcasts |
| Series autoplay and Up Next | Screensaver extras: night mode, plus future clock and layout styles |
| The listening screensaver | Themes, if colours from cover art are ever revisited |
| Sleep timer, smart rewind, bookmarks, search, Settings | Early access to new features before they reach the free tier |

The sleep timer, bookmarks and search stay free: people expect them, and bookmarks are shared with Absorb.

### Unlocking on the homebrew app

1. **On the TV**, a Premium screen (from Settings) shows a QR code and a short code.
2. **On a phone**, the QR opens checkout at `oddorbit.software`. It uses a merchant-of-record provider (Lemon Squeezy, Paddle or similar), which handles EU VAT, receipts and refunds.
3. **A small licence service** (for example a Cloudflare Worker) receives the payment webhook and issues a licence signed with a private key that only the service holds. It contains the purchase ID, the date and a household limit.
4. **The TV** polls the service with its short code, receives the licence and stores it. The app checks the signature with a public key built into the app, so once activated it works offline and never contacts the service again.
5. **Restore**: the same QR flow, or the purchase email, returns the existing licence. One purchase covers a few TVs in a household.

The licence service only ever sees the short code and the purchase. It never sees the Audiobookshelf server, the books or listening data. Gate premium features in one place (`isPremium()`), so that turning a feature free later is a one-line change.

### The LG Content Store version

LG no longer runs its own in-app billing. Its developer guide recommends Paymentwall for paid content, and other third-party billing may need a separate contract with LG. In the Seller Lounge, billing is declared as webOS Pay, 3rd Party Billing or both. So the same signed-licence model should carry over, with the store build using LG-approved checkout instead of (or alongside) the website. Before submitting:

- Ask LG developer support whether a QR code to an external checkout is acceptable, or whether payment must go through Paymentwall or webOS Pay.
- Check that a store app may use `com.webos.media/setPlayRate` (speed with sound) and the screensaver hold (`tvpower/registerScreenSaverRequest`). Both work on the homebrew build. If either isn't available, the store build needs a fallback: speeds limited to what plays with sound, and the TV's own screensaver.
- Store review, the content rating and the seller registration under Odd Orbit Software.

### Before launch

- Check whether the webOS Homebrew Channel's repository lists paid or closed-source apps. If not, distribute the IPK from `oddorbit.software`, or open-source the free core and keep only the licence-signing key private.
- Settle on a price. One-time unlocks for this kind of app are typically €5–15.

## Not planned

- **Playing in the background while another app or input is in use.** webOS suspends web apps when they're hidden. Playing in the background would need a separate background service that streams and syncs, which is a lot of work for little use.
- **Colours taken from the cover art.** Considered and deferred: the app keeps its fixed palette.
