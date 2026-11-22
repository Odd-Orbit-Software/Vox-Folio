# Changelog

Version numbers: a bug fix or tidy-up bumps the last number (0.2.0 → 0.2.1), a new feature bumps the
middle one (0.2.x → 0.3.0), and a large change of technology bumps the first.

## 0.6.0

**Choose your Home rows**
- New rows on Home: Discover (books you haven't started), Listen again, and New series. Listen again and New series start hidden.
- Settings has a Home rows section to show or hide each row. "Choose Home rows" at the bottom of Home goes straight there.
- New episodes now sits just below In progress.

**Settings**
- Book speed and Podcast speed ★ can be set in Settings, and a change applies at once.
- Left and Right step a value up or down (speeds, skip lengths, sleep timer). OK still steps forward.
- Settings is grouped into Playback, Home rows, and Screensaver and stats, and the list scrolls with soft edges. Switched-off rows are dimmed.

## 0.5.0

**Playlists play in order**
- A playlist's page has Play all (or Continue from where you are, or Play again from the start once all of it is finished). OK on any entry plays from there.
- Up Next and autoplay follow the playlist, skipping what you've finished. The player shows "Weekend queue · 2 of 3", and the end of the playlist is announced.
- The playlist is remembered across restarts. Playing one of its entries from Home keeps it going. Playing something else leaves it, and says so.
- Podcast playlists appear on the Podcasts tab.

## 0.4.0

**Library filters**
- Filter the Library by progress (not started, in progress, finished), genre, narrator, tag or language, from the Filter chip beside Sort.
- Genres that the server saved as one long list ("Adventure, Humorous, Space Exploration") appear as separate genres, and spellings of a language ("eng", "English") are merged.
- The title count says how much is showing ("7 of 181 titles"), and the chip shows the filter in force. Red on the chip, or in the panel, shows all books again.
- In long lists such as narrators, Channel up and down jump eight at a time.

## 0.3.1

- The player has an Autoplay switch beside Sleep, for books in a series and for podcast episodes.
- Take something off Continue listening without finishing it: Remove on Home's main card, or Red on a tile in In progress. Red again within a few seconds undoes it. Listening again brings it back.
- Mark a podcast episode played or unplayed from its show: Red on the episode, or the check beside it.
- The Autoplay setting now covers podcast episodes too.

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
