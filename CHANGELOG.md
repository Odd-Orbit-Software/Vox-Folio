# Changelog

Version numbers: a bug fix or tidy-up bumps the last number (0.2.0 → 0.2.1), a new feature bumps the
middle one (0.2.x → 0.3.0), and a large change of technology bumps the first.

## 0.3.0

**Podcasts ★**
- A Podcasts tab when your server has a podcast library: continue listening, the latest episodes, and every show.
- A show's page lists its episodes, newest first, with what you've played and what's new.
- Episodes play, sync, and resume like books, and are marked played at the end.
- Autoplay goes on to the next episode (in the order they came out), with the same Up Next card as books.
- Home shows episodes you're partway through alongside your books, and a New episodes row.
- Podcasts keep their own playback speed, separate from books (starting at 1×).
- Long titles scroll sideways while focused, so they can be read in full.
- A show's page describes the focused episode.
- Search finds shows and episodes too. When both books and podcasts match, chips choose All, Audiobooks, or Podcasts.
- Polaris (or any launcher) can open an episode with `{"abs": "<show>", "episode": "<episode>"}`.

## 0.2.1

- The blue button adds a bookmark in the player, and jumps back to the player from anywhere else.
- Autoplay for the next book in a series moves into the sleep timer panel.

## 0.2.0

**Listening**
- Listening time is now recorded in your Audiobookshelf history and stats.
- Sessions close when you leave the app, after ten minutes paused, and at the end of a book.
- Sleep timer with a gentle fade, and smart rewind after a pause.
- Bookmarks.

**Finding books**
- Search by title, author, narrator, or series.
- Authors, collections, and playlists; Home shelves for continuing a series and recently added books.

**Home and profiles**
- Household profiles, each with its own Audiobookshelf account.
- Home appears instantly with your last books, then refreshes.

**Premium previews ★**
- Listening stats: this week, this year, streaks, and books finished.
- Screensaver night mode from 10 pm to 6 am.

**Polish**
- Covers keep loading after the TV has been idle for an hour.
- A short "Can't reach your server" message with Retry on every screen; Home keeps your books and offers Retry.
- Placeholder tiles while grids load, and covers fade in.
- The clock follows the TV's 12- or 24-hour setting.
- Audio Guidance is switched on for the app.
- Smoother scrolling in large libraries.
- A launch splash.
- A small surprise in the screensaver.

## 0.1.0

- First version: sign in, Home, Library, series, title details, and the player.
