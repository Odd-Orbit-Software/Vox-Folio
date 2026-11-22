# Changelog

Version numbers: a bug fix or tidy-up bumps the last number (0.2.0 → 0.2.1), a new feature bumps the
middle one (0.2.x → 0.3.0), and a large change of technology bumps the first.

## 0.10.1

- **Smaller saved copy of Home.** It now keeps only what Home shows, about 50 KB instead of 400 KB per account, which is easier on the TV's storage.
- **Rejoin after leaving.** For a minute after Leave playlist, the player offers "Rejoin playlist".
- **Playlist tab.** While a playlist plays, Red opens a Playlist tab beside Chapters and Bookmarks. Left and Right switch tabs, and Channel up and down jump eight at a time through long chapter lists and playlists.
- **Remote buttons guide** (Settings → Help) explains what each button does, screen by screen.

## 0.10.0

**The playlist in the player**
- While you're playing a playlist, a "2 of 3" chip in the player opens it. It shows what's playing, what's up next and what's finished. OK on any entry jumps to it.
- **Stop after this one** pauses the playlist at the end of the current entry and keeps your place in it.
- **Leave playlist** asks for a second OK, so a stray press doesn't lose your place.
- When Autoplay is off, a playlist now says what to play next to carry on. If everything left is already finished, the end of the playlist is announced.

## 0.9.1

- **Undo for live jumps.** When another device moves a book that's paused on the TV, the player offers "Back to …" for a minute.
- **Year in Review on Home.** From December to mid-January, Home offers your year in listening. "Later" asks again in a week, and each person on the TV gets their own reminder.
- **Clickable covers in Year in Review.** OK on a cover opens that book. Back returns to the same year and cover.

## 0.9.0

**More settings**
- **Screen off.** The screensaver can be a black screen, which is kindest to an OLED panel. "Screen off · press any key" shows for a moment first, and the sleep timer's "Still listening?" still appears.
- **Text size.** Large makes details, hints, labels and titles easier to read from the sofa.
- **Reduce motion.** Nothing slides or scrolls, and the screensaver moves to a new spot once a minute instead of drifting.
- **Home rows can be put in your own order.** In Settings, Channel up and down move the focused row. Reset Home rows puts them back.
- **Sleep fade.** Choose how gently the sleep timer turns the sound down: 10, 30 or 60 seconds.
- **Diagnostics** (Settings → Help) shows whether your server and live updates are working, has a support section, and can clear the saved copy of Home.
- The initials in round author covers are centred.

## 0.8.1

- The initials in the round profile pictures ("Who's listening?") are now vertically centred.

## 0.8.0

**Year in Review ★**
- A page for your year in listening: total hours (and a weekly average), the author and narrator you listened to most, top genres, books finished, your busiest month, the longest book you finished, and the covers of the year.
- Look back at the two previous years too. Open it from Settings or from Listening stats.

## 0.7.0

**Live progress**
- Vox Folio now hears straight away when another app (Audiobookshelf on your phone, Absorb) saves your place. A book paused on the TV moves to the new spot with "Picked up from another device", and Home updates its cards and progress while you look at it.
- If the same book is playing on the TV and somewhere else at once, a note says so, since the last one to stop keeps the place.
- Home never swaps the main card while it has focus. After a refresh, focus returns to the tile you were on.
- The connection comes back on its own after standby or a dropped network, and signs in again if the TV was away long enough for the sign-in to expire.

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
