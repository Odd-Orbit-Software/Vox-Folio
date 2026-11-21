# Roadmap

The homebrew app in the [product plan](product.md) is complete: library, series, title details, series autoplay, playback speed and the listening screensaver all work on the TV. These features come next. Each group is a batch that can ship on its own, in the suggested order.

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
| Household profiles | Pick who's listening at launch, from the Audiobookshelf accounts added on this TV, each with their own progress, Continue Listening and settings. Switch profile from the rail. | Each profile keeps its own tokens. A title launch from Polaris opens for the profile that last listened to that book, or asks. The screensaver shows whose book is playing. |
| Bookmarks | Add a bookmark at the current moment with one press. List them in the player and jump to one. | Audiobookshelf's per-user bookmarks, so they also appear in Absorb. |

## 4. Polish

| Feature | What the listener can do | Notes |
| --- | --- | --- |
| Instant start | Home appears immediately from the last session's data, then refreshes. | Cache the Home and library first pages in localStorage. Never cache tokens beside them. |
| Screensaver night mode | Late at night the screensaver dims further and drifts more slowly. | Gentler on an OLED panel and in a dark room. Uses the TV's clock. |
| Listening stats | See time listened this week and this year, books finished and longest streak. | `GET /api/me/listening-stats`. Could have a seasonal summary in the Polaris style. |
| Podcasts | Play podcast episodes from Audiobookshelf podcast libraries, with the same resume and sync. | Polaris could then send podcast Continue cards to Vox Folio instead of Tonalo. Needs episode lists and a per-episode playback session. |

## Not planned

- **Playing in the background while another app or input is in use.** webOS suspends web apps when they're hidden. Playing in the background would need a separate background service that streams and syncs, which is a lot of work for little use.
- **Colours taken from the cover art.** Considered and deferred: the app keeps its fixed palette.
