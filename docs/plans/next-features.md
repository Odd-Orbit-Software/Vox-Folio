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
| C | Play a playlist in order (books and episodes), with Up Next | 0.5.0 | todo |
| D | More Home shelves, each switchable in Settings; settings scan | 0.6.0 | todo |
| E | Live progress from the server (socket) | 0.7.0 | todo |
| F | Year in Review | 0.8.0 | todo |

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

## D. Home shelves and settings

- Shelves to add: "Listen again", "Discover", "Recent series", each with a Settings switch.
- Settings scan: list anything that should be in Settings but isn't.
- Notes:

## E. Live progress

- Hand-rolled socket.io v4 over WebSocket: `/socket.io/?EIO=4&transport=websocket`, then `40`, then `42["auth", token]`. Answer each ping `2` with `3`.
- Events: `user_item_progress_updated` and others.
- Notes:

## F. Year in Review

- `GET /api/me/stats/year/{year}`.
- Notes:

## Log

- 2026-11-22: Plan written.
