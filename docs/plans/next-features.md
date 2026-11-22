# Next features (0.3.x → 0.8.0)

Working plan for the batch agreed on 2026-11-22. It is updated as work goes, so a fresh session can pick up from here. Branch: `features`, cut from `main` at 7e3e7cb (0.3.0).

## How each feature is done

1. Build it on the `features` branch.
2. Unit tests and lint pass, and the ES2019 check passes.
3. Test it on the TV using only the test accounts (claude-test, claude-test-2). The pmck account is read-only: use it for stats only.
4. Run a full UX/UI review of the feature with the `impeccable` skill (critique and audit), then fix what it finds.
5. Bump the version (see the versioning rule), update `CHANGELOG.md`, and commit to `features` locally.
6. Push and merge to `main` only when the user says yes.

Step through TV keys one at a time and log focus. Don't send long blind key sequences: earlier stray OK presses changed test progress.

## Features and status

| # | Feature | Version | Status |
| --- | --- | --- | --- |
| A | Autoplay toggle in the player; mark an episode played/unplayed; remove from Continue Listening | 0.3.1 | done (committed on `features`) |
| B | Library filters (progress, genre, tag, narrator, language) | 0.4.0 | done (committed on `features`) |
| C | Play a playlist in order (books and episodes), with Up Next | 0.5.0 | done (committed on `features`) |
| D | More Home shelves, each switchable in Settings; settings scan | 0.6.0 | done (committed on `features`) |
| E | Live progress from the server (socket) | 0.7.0 | done (committed on `features`) |
| F | Year in Review | 0.8.0 | done (committed on `features`) |

Not doing: e-books and comics, adding or downloading podcasts, metadata editing, RSS, single sign-on.

## A. Player autoplay, mark played, remove from Continue Listening

- The player gets an autoplay switch next to the other controls, not only in the sleep panel.
- Episodes: Mark played or unplayed from the show page, and from the player.
- Remove from Continue Listening: `GET /api/me/progress/{progressId}/remove-from-continue-listening`. Reachable from the Home hero, the In progress tiles and Details.
- Notes:
  - `/api/me/items-in-progress` ignores `hideFromContinueListening`, so Home filters on the progress map (fetches 25, then shows 13). The server clears the flag once `currentTime` changes, so listening again brings an item back.
  - Built:
    - The player transport has an Autoplay chip (`.vf-autoplay`) next to Sleep. The old top-bar hint is gone.
    - The show page has a check toggle on every row (`.vf-show__played`, `aria-busy`, never `disabled`, because disabling it drops Spotlight focus).
    - Home has a hero "Remove" button and Red on In progress tiles (the `CoverRow` `action` prop, with a hint that shows on `:focus-within`).
    - The setting is relabelled "Autoplay".
  - TV-tested on claude-test-2:
    - Removed The Infinite Extent from Continue Listening.
    - Toggled Part One unplayed, then played again.
    - Toggled Autoplay off, then on.
  - UX review (impeccable; the detector came back clean). Fixes applied:
    - Removal waits 4 s, and Red undoes it (the toast says so).
    - Red works on the hero too, and the hero's Remove button shows a red dot.
    - Autoplay "on" is a neutral paper tint; yellow stays Sleep's colour.
    - The played toggle is an empty ring when unplayed and a sage check when played. The show page has a Red "Mark played" hint.
  - Left alone:
    - Bulk mark-played.
    - The sliver of the hero card left at the top when Home scrolls.
  - Test lesson: a single Red press followed by a relaunch commits the removal. Heaven's River was restored on claude-test-2 by nudging its currentTime.

## B. Library filters

- `filterdata`: `GET /api/libraries/{id}/filterdata` (or `?include=filterdata`).
- Filter strings: `progress.<b64>` with the values finished, not-started, in-progress and not-finished; `genres.<b64>`, `tags.<b64>`, `narrators.<b64>` and `languages.<b64>`.
- UI: a "Filter" chip next to Sort opens a panel.
- Notes:
  - Built:
    - `src/app/filters.ts` (+ test).
    - `src/components/FilterPanel.tsx`: tabs for Progress, Genre, Narrator, Tag and Language, each list with its values. Back closes the panel and focus returns to the chip.
    - `Library.tsx` keeps the filter in its cache. It shows "No books match" with a Show all books button.
  - This server saves genres as comma-joined strings ("Adventure, Humorous"), and languages as "eng", "English" and "english". The values are tidied into single choices with `sources`. A choice with several sources fetches each one (limit 500), merges them, and sorts on the client (`sortItems`). "Audiobook" is dropped from genres.
  - TV-tested on claude-test-2: the Adventure genre returned 7 titles, the In progress filter returned 2, and Back closes the panel.
  - UX review (impeccable; the detector came back clean). Fixes applied:
    - The active filter chip uses a paper fill like the selected sort, and the count reads "N of M titles" (from filterdata's bookCount, now loaded with the library).
    - CH+/− page by 8, with an "17 of 141" readout.
    - Red clears the filter from the chip or the panel. The panel shows "Showing X · ● Show all books".
    - "Not finished" is dropped.
    - The empty-state copy depends on the filter.
    - The icon is now a funnel, and the label is truncated with an ellipsis.
  - Left for later:
    - Combining filters.
    - Counts per value.
    - An A–Z jump.
    - Genres and narrators as cover shelves.

## C. Playlist playback

- Playlist items are `{libraryItemId, episodeId?, libraryItem, episode?}`.
- Playlist page: a Play button, then items in order. Up Next follows the playlist after the current item.
- Notes:
  - Built:
    - `src/app/queue.ts` (+ test): `queueFromPlaylist`, `nextInQueue` (skips finished items), `queueStart`.
    - App has `queue` state and `playQueue`. `openBook` clears the queue unless `keepQueue` is set, so playing anything by hand leaves the playlist.
    - The Up Next effect checks the queue first, before the series or episode.
    - `NextUp.label` holds "Weekend queue · 2 of 3".
    - The player top bar shows the queue label, and the Autoplay chip appears for queued items too.
  - `BookList.tsx` handles playlists:
    - A "Play all" (or "Continue playlist") button.
    - Numbered tiles keyed `q:<key>`; OK on a tile plays from there.
    - Episodes are included.
  - The Podcasts tab has a Playlists row (playlists from the podcast library).
  - Test data on claude-test-2: "Weekend queue" (book library: Tales from the Folly, The Martian, Project Hail Mary) and "Commute" (podcast library: Sword and Scale Ep 377, then BtB Part Two).
  - TV-tested:
    - Folly's progress was set to 17380/17410 and Play all pressed. The Up Next card read "Weekend queue · 2 of 3". Folly was marked finished and The Martian started as 2 of 3.
    - Stopped by a cold relaunch. The Martian is at 36 s on claude-test-2.
  - UX review (impeccable; the detector came back clean). Fixes applied:
    - The queue is saved to localStorage under `voxfolio.queue.v1` with its userId, and restored per account.
    - Playing one of the queue's own entries by hand keeps the queue. Anything else leaves it with a "Left X" toast.
    - "End of X" toast at the end of the queue.
    - When every entry is finished, the button reads "Play again from the start" (`replay`, which ignores finished). Otherwise it reads "Continue · <title>".
    - Tile badges come from the queue index.
    - A play mark on the focused playlist tile.
    - Brass queue label in the player.
    - Episode tiles drop the repeated show name.
    - TV-verified: the playlist page, and restart then Home Resume keeping "Weekend queue · 2 of 3".
  - Left for later:
    - A queue sheet in the player (see upcoming, stop after this one, leave).
    - Details from a playlist tile.
    - A cover mosaic for playlist tiles.

## D. Home shelves and settings

- Shelves to add: "Listen again", "Discover", "Recent series", each with a Settings switch.
- Settings scan: list anything that should be in Settings but isn't.
- Notes:
  - Built:
    - `settings.hiddenHomeRows` and `HOME_ROWS` (in progress, continue series, recently added, listen again, discover, recent series, new episodes ★). All are shown by default.
    - Home adds the Listen again, Discover and Recent series shelves. Recent series tiles open the series page.
    - The Settings left column scrolls (`.vf-settings__scroll` / `__column`) and is split into Playback, Home rows and Extras sections, with Account on the right.
  - Settings scan, added:
    - Book speed and Podcast speed ★ (the speeds were stored but not settable; the roadmap promised a default speed). Changing one applies straight away if that kind is playing.
    - Home rows.
    - The Autoplay hint now covers playlists.
  - Settings scan, considered and not added:
    - A screensaver delay: the TV decides when the screensaver starts.
    - A clock format setting: it follows the TV.
    - A library choice: that's the Library chip.
    - A separate podcast autoplay: one switch is simpler.
    - Sync interval and Up Next countdown: not useful for listeners.
  - TV-tested: Settings scrolls through all sections, Home shows the new rows, and Recent series opens Bobiverse.
  - UX review (impeccable; detector clean). Fixes applied:
    - A mask fade on the clipped column, with the offset clamped.
    - Speed comes first in Playback.
    - Left/Right step values (`onStep` and `stepChoice`; `data-own-left` lets the Rail's Left handler skip). At the end of the range, focus moves on.
    - Off rows are dimmed.
    - Defaults hide Listen again and New series, and New episodes moves up.
    - "Recent series" is renamed "New series", and one-book series are filtered out.
    - A "Choose Home rows" chip at the bottom of Home opens Settings focused on the Home rows section.
    - The "Extras" group is renamed "Screensaver and stats".
    - TV-verified, then claude-test-2's book speed was put back to 1.25×. The speed key is per TV, not per profile.
  - Further settings the review suggested (for the user to decide; not built):
    - Turn the screen off while listening (webOS screen-off, OLED care).
    - Text size.
    - Reduce motion.
    - Reorder or reset Home rows.
    - Sleep fade length.
    - Time left at the current speed versus real time.
    - Diagnostics (server version, clear cache).

## E. Live progress

- Hand-rolled socket.io v4 over WebSocket: `/socket.io/?EIO=4&transport=websocket`, then `40`, then `42["auth", token]`. Answer each ping `2` with `3`.
- Events: `user_item_progress_updated` and others.
- Notes:
  - Built:
    - `src/abs/socket.ts` (`LiveSocket`, `parsePacket`, `socketUrl`, + test). Backoff is 2/5/15/30/60 s, with `wake()` on visibility.
    - `src/app/live.ts` fans updates out.
    - `engine.applyRemoteProgress`, which runs only while paused and ignores events from our own session, finished items, and changes of 5 s or less (+ 3 tests).
    - App creates the socket per session. Home patches progress in place and reloads (debounced 3 s) for unknown or finished keys.
  - Server facts:
    - `/api/me/items-in-progress` does not filter hidden items.
    - The socket authenticates once with `42["auth", token]`.
    - The event payload is `{id, sessionId, deviceDescription, data: MediaProgress}`.
  - TV-tested on claude-test-2 with `scratchpad/phone2.py <item> <secs>` (claude-test-2's "phone"):
    - The Martian, paused at 0:27, jumped to 10:00 with a toast within about 3 s.
    - Home made Project Hail Mary the hero after the phone saved 300 s on it.
  - Probe log tip: the file gets null bytes after truncation, so run `tr -d '\000'` before grep.
  - UX review (impeccable; the detector came back clean). Fixes applied:
    - `auth_failed` leads to `client.refresh()`, then `reauth()`. On becoming visible, the app runs `ensureFresh()`, then `wake()`.
    - A silence watchdog (70 s) drops half-open sockets.
    - The live jump applies smart rewind like the other catch-ups.
    - While playing, an event from another session gives one "Also playing on <device>" notice per session.
    - Home postpones a structural reload while focus is on the hero, and refocuses the same tile key after a reload.
  - Left for later:
    - Undo for a live jump.
    - Connection status in a diagnostics view.
  - Heaven's River on claude-test-2 is now at 6000 s (it was 5713) after the retest.

## F. Year in Review

- `GET /api/me/stats/year/{year}`.
- Notes:
  - Built:
    - `src/app/yearReview.ts` (`normaliseYearStats`, `summariseYear`, `tidyGenres`, + test).
    - `src/screens/YearReview.tsx`, route `yearReview`. Year chips for this year and the two before.
    - The page shows the total in large type, the weekly average, stat tiles, facts (top author, top narrator, top genres, longest finished), and a cover mosaic with finished books first.
    - Opened from Settings ("Year in review ★") and from the Stats page.
  - TV-tested:
    - claude-test-2: 20 minutes of listening, 4 covers.
    - pmck, view only (the picker defaults to pmck now; there's no "right" before OK): 193 hours, 16 finished, July, Matt Dinniman / Jeff Hays, 12 covers.
    - On an earlier run, a stray "right" opened Add someone. Nothing was saved.
  - UX review (impeccable; detector clean). Fixes applied:
    - The facts are written as sentences in the serif face ("Mostly X, mostly in the voice of Y").
    - A "Longest book you finished" highlight with a brass rule. There's no cover, because the server gives the media ID, not the library item.
    - The current year reads "so far".
    - Separate empty copy for the current year and past years.
    - The chosen year chip is underlined in brass rather than filled, so it can't be mistaken for focus.
    - Light years (under 3 h) get a smaller headline.
    - Each year is cached per visit.
    - Retry on error.
    - Cover shadows have a smaller blur.
  - Left for later:
    - Focusable covers.
    - A month bar strip (the API only gives the busiest month).
    - A seasonal prompt on Home.

## Batch 2 (agreed 2026-11-22, after 0.8.1 was pushed to main)

The user is using the TV: **ask before any TV test**, and batch the tests so you ask as rarely as possible. After each step, run the impeccable UX/UI review (the design agent, plus the detector run directly), apply the fixes, then commit.

| # | Item | Version | Status |
| --- | --- | --- | --- |
| G1 | Screen off while listening: the screensaver can be a black screen (OLED care) | 0.9.0 (G1–G6 are separate commits under one bump) | done (0.9.0) |
| G2 | Text size: Standard / Large (the small text gets bigger) | 0.9.0 | done (0.9.0) |
| G3 | Reduce motion: no scrolling titles, slides or fades, and the screensaver hops instead of drifting | 0.9.0 | done (0.9.0) |
| G4 | Reorder Home rows (Channel +/− on a Home row setting) and Reset Home rows | 0.9.0 | done (0.9.0) |
| G5 | Sleep timer fade length: 10 s / 30 s / 60 s | 0.9.0 | done (0.9.0) |
| G6 | Diagnostics page: app and server versions, connection, live updates state, clear cached data | 0.9.0 | done (0.9.0) |
| H1 | Undo for a live jump ("Picked up from another device", then Red to go back) | 0.9.1 (H1–H3 share one bump) | done (0.9.1) |
| H2 | Year in Review prompt on Home in December and early January | 0.9.1 | done (0.9.1) |
| H3 | Clickable covers on Year in Review (OK opens the book) | 0.9.1 | done (0.9.1) |
| I1 | Playlist queue panel in the player: the entries with the current one marked, jump to an entry, stop after this one, leave the playlist | 0.10.0 | done (0.10.0) |

### Batch 2 notes
- **Shared settings code:** `settings.ts` adds `homeRowOrder`, `screensaver` ('cover' | 'dark'), `textSize`, `reduceMotion` and `sleepFade`, plus `orderedHomeRows`, `moveHomeRow`, `homeRowsAreDefault`, `defaultHomeRows` and `stepChoice` (+ `settings.test.ts`).
- **G1 Screen off:** App renders `.vf-screenoff` (pure black) in place of the Screensaver.
- **G2 Large text:** the root class `vf-text-large` overrides the small reading text.
- **G3 Reduce motion:** the root class `vf-reduce-motion`:
  - turns off transitions and animations;
  - stops marquee titles;
  - makes the screensaver hop to a random spot each minute, with no corner bursts.
- **G4 Home row order:** CH+/− on a Home rows setting moves the row, with "Reset Home rows" once changed. Home renders rows through `rowsInOrder`.
- **G5 Sleep fade:** `engine.sleepFadeMs` comes from settings. "Still listening?" appears when the fade starts, if that's earlier than 30 s (+ test).
- **G6 Diagnostics:** the `diagnostics` route and `Diagnostics.tsx`. It uses `serverStatus()` (`/status`, no auth) and the live status store in `live.ts`, and has "Clear saved Home" (the `voxfolio.home.v1:*` keys).
- **Avatar fix:** `.vf-cover--initials > span` gets a 0.19em top nudge. The user asked for this; it covers author circles.
- **H1 Live jump undo:**
  - The engine keeps `remoteJump {from, to}` for 60 s; it clears on play. `undoRemoteJump()` (+ test).
  - The player shows "Moved to X by another device · [Back to Y]". It's a chip rather than a colour key, because all four colour keys are taken in the player.
- **H2 Home prompt:** `yearToPrompt` covers 1 Dec – 15 Jan, and is dismissed per year (`voxfolio.yearPrompt.dismissed`).
  - The Home band reads "Your 2026 in listening is ready", with See your year / Not now.
  - The dev launch param `yearPrompt` (with `probe`) forces it.
  - The yearReview route takes `year`.
- **H3 Clickable covers:** covers are Tiles; OK opens Details, and focus is restored on return. A module cache keeps the chosen year and summaries for the visit.
- **Desktop testing:** the user wasn't free for the TV, so screens were checked in headless Chromium:
  - `scratchpad/shoot.js <png> '<params>' [ms] [localStorage json]` against `dist` served by `python3 -m http.server 8899`.
  - It uses `--disable-web-security` (CORS) and devLogin as claude-test-2.
  - `qseed.json` seeds the Weekend queue.
  - It is not Chromium 79, so the TV check is still needed before committing.
- **Review fixes applied (impeccable; detector clean after removing a side-tab border on the Year hero):**
  - **G:**
    - Screen off shows "Screen off · press any key" for about 4 s, and a dim "Still listening?" when the sleep prompt is up.
    - Focused Home row settings show "CH ▲▼ to move · n of 7".
    - Reset Home rows is always inside its section (inert when unchanged) and shows a toast.
    - Off rows dim only the value.
    - Large text also scales setting labels, facts, row titles, bylines, chapter titles and toasts.
    - Sleep fade reads "Short · 10 s" and so on.
    - Diagnostics uses plain words ("Reachable · quick"), with a "For support" section for versions, device name, sign-in and cache size. The Back hint is gone because Done is enough.
    - The live status snapshot is cached; a fresh object every read had caused an infinite render loop and a blank page.
  - **H:**
    - Focus goes back to Play if the undo chip expires while focused.
    - A new undo icon.
    - The toast and chip show where the book actually landed (after smart rewind).
    - The prompt says "Later" (a 7-day snooze); opening the review dismisses it for the year. It's stored per user under `voxfolio.yearPrompt.v2:<userId>`.
  - **I:**
    - "Up next" uses the real next key, and Finished comes from progress, not position.
    - Episode rows show their date.
    - OK on the playing row closes the panel.
    - Stop-after shows a tick.
    - Leave playlist is quieter and needs two presses.
    - Autoplay off in a playlist says "Play X to carry on with Q".
    - If the remaining entries are all finished, the end of the playlist is announced.
  - Left for later:
    - A Playlist tab inside the Red panel.
    - An undo toast for Leave.
    - Trimming the Home cache (~410 KB).
    - A remote-buttons legend under Help.
- **I1 Queue panel:** the player shows a "≡ 2 of 3" chip after Autoplay, which opens QueuePanel:
  - the entries, with Playing / Up next;
  - OK jumps to an entry (and clears stop-after);
  - Stop after this one (`queue.stopAfter`, which makes Up Next null and shows a toast at the end);
  - Leave playlist.

### Batch 2: TV test (user said yes, 2026-11-22)
- Verified on the TV with claude-test-2:
  - CH▼/▲ moves Home rows, with the hint "CH ▲▼ to move · 2 of 7".
  - Screen off shows its cue, then goes fully black.
  - The queue panel shows Finished / Playing / Up next.
  - Live-jump undo: Up from Play goes to the scrubber, then the chip; OK goes back and focus returns to Play.
  - The Year prompt on Home works (dev param).
  - Diagnostics works.
- Fixed during the test: Down on the last Settings row jumped to the rail; it now stays put.
- Test slips: an extra OK turned Autoplay off and another turned Night mode off for claude-test-2. Both were put back. These are TV-only settings, with no ABS data involved.
- The Martian on claude-test-2 is at about 20:00. The Weekend queue is active there.
- Home cache on the TV is about 890 KB for 3 accounts. Trimming it is a follow-up.
- Commits:
  - `c78772a`: author initials.
  - `ca9545e`: 0.9.0 settings. It also carries the Year in Review code its shared hunks needed.
  - `0415b7d`: 0.9.1.
  - Next: 0.10.0 queue panel.
  - Each commit was typechecked on its own with `scratchpad/checkstaged.sh`.

## Batch 3 (agreed 2026-11-22, after 0.10.0 was pushed)

**Ask before any TV test.** For each item: build it, check it in the desktop browser, run the impeccable review, and fix what it finds. Then do one TV session with the user's OK, and commit each item separately under a single bump to 0.10.1.

| # | Item | Status |
| --- | --- | --- |
| J1 | Slim the saved Home: keep only the fields Home draws (it was about 400 KB per account) | done (0.10.1) |
| J2 | Undo after Leave playlist: a "Rejoin <playlist>" chip in the player for 30 s | done (0.10.1) |
| J3 | Playlist tab in the Red panel (Chapters · Bookmarks · Playlist) while a playlist plays | done (0.10.1) |
| J4 | Remote buttons guide under Settings → Help | done (0.10.1) |

### Batch 3 notes
- **J1:** `src/app/slim.ts` (+ test). Home saves slim items, episodes and series. The size went from 408 KB to 53 KB. Series entities have no `media`, and the test caught a crash on them.
- **J2:** App `leftQueue` (60 s). There is one chip element for both "2 of 3" and Rejoin, so focus stays on it. After Leave, focus goes to Play. The toast says "Rejoined X".
- **J3:** NavPanel tabs (chapters / bookmarks unless episode / playlist when queue), plus `QueueList`, which the playlist panel shares.
  - Left/Right on rows switch tabs.
  - CH+/− page by 8 in chapter and playlist lists (`pageBy`).
  - With 3 tabs, "Back to close" moves to a footer.
  - Red works for episodes in a playlist, and the chip says "Playlist".
- **J4:** `RemoteHelp.tsx`, route `remoteHelp`, under Settings → Help → Remote buttons. Reviewed and corrected: Blue bookmark applies to books only; Back from Home opens the player; Stop pauses; play/pause shows as an icon.
- Review: impeccable, with the detector clean.

### Batch 3: TV test (with the user's OK)
- On claude-test-2: the Playlist tab with its footer, Leave then focus to Play, Rejoin keeping focus on "2 of 3", the Remote guide, and Diagnostics. Every check passed.
- The Weekend queue is active again on claude-test-2.
- The other two accounts' saved Homes shrink the next time they open Home (537 KB for 3 at test time).

## Log

- 2026-11-22: The user asked to centre the round profile avatars' initials vertically (Newsreader caps sit high). Fixed in 0.8.1.

- 2026-11-22: Plan written.
