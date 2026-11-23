---
title: Problems and fixes
parent: Developer guide
nav_order: 4
---

# Problems and fixes

What the TV and the server taught us, with each cause and its fix.

## Audio muted at any speed other than 1×

**Symptom.** Changing the speed made the book go silent, while the position kept moving.

**Cause.** The webOS web app container mutes a media element whenever its `playbackRate` isn't 1.

**Fix.** Never set `playbackRate` on webOS. `PlayRateController` finds the element's media pipeline (`el.mediaId`, or `getActivePipelines` filtered to our app) and calls `luna://com.webos.media/setPlayRate` with `audioOutput: true`. Sound stays on and pitch-corrected. A new file gets a new pipeline at 1×, so the rate is applied again on every load and play, with retries until the pipeline exists. Confirmed by ear at 1.15× and 1.25×.

## Listening time wasn't recorded

**Symptom.** Positions saved and synced, but stats showed no listening.

**Cause.** The sync payload used `timeListening`. Audiobookshelf reads `timeListened`, still answers 200 to the wrong name, saves the position and records no time. A session with no time is never saved to history.

**Fix.** Send `timeListened`, the seconds listened since the last successful sync.

## Sessions didn't count until much later

**Cause.** Audiobookshelf only adds a session to history once it's closed.

**Fix.** Close the session when the app is hidden or exits, after 10 paused minutes, and at the end of a book. Play opens a new session at the same place.

## The layout rendered at two-thirds size

**Cause.** Enact converts px to rem by dividing by 24, against the browser's 16 px root.

**Fix.** `"ri": false` in `package.json` turns the conversion off. The CSS is written in real pixels for a 1920×1080 screen.

## Syntax errors on the TV only

**Cause.** The engine is Chromium 79. Enact transpiles only `@enact/*`, so syntax such as `?.` and `??` in other dependencies reaches the TV untouched.

**Fix.** `npm run build` parses the bundle as ES2019 (`tools/check-es.mjs`) and fails on anything newer. In CSS, flexbox `gap`, `inset`, `aspect-ratio` and `:focus-visible` are avoided; margins take the place of `gap`.

## Covers went missing after an hour

**Cause.** Access tokens last an hour, and images can't send headers, so they carry the token in the URL. Each refresh also rotates the refresh token and invalidates the old one.

**Fix.** Refreshes are serialised and every new token pair is saved. `keepFresh` refreshes five minutes before expiry, and `ensureFresh` runs when the TV wakes, because timers lag during standby.

## Session sync looked like a failure

**Cause.** `sync` and `close` answer with plain-text `OK`, and parsing it as JSON threw.

**Fix.** The client only parses JSON responses.

## Playback needed the element in the page

**Fix.** The `<audio>` element is created once and kept in the document. A detached element doesn't play on the TV.

## Focus vanished after pressing a button

**Cause.** Disabling a focused button makes Spotlight drop focus, leaving the remote with nothing to move.

**Fix.** Buttons that wait on the server use `aria-busy` and ignore repeat presses, and stay enabled. Chips that disappear on a timer (the live-jump undo, Rejoin) hand focus to Play if they had it.

## A blank Diagnostics page

**Cause.** `useSyncExternalStore` was given a snapshot function that returned a new object on every call, which loops React until it gives up.

**Fix.** The live status store replaces its snapshot object only when the status changes.

## Removed items came back on Home

**Cause.** `GET /api/me/items-in-progress` ignores the "remove from Continue listening" flag.

**Fix.** Home reads `hideFromContinueListening` from the user's progress records and filters those items out. The server clears the flag when listening moves on.

## Genres were whole sentences

**Cause.** Some metadata sources save every genre for a book as one comma-joined string, and a language can appear as `eng`, `English` and `english`.

**Fix.** The filter panel splits and merges them into clean choices. A choice that stands for several server values fetches each one and merges the results.

## The saved Home was 400 KB

**Cause.** Home cached whole items, with descriptions and file lists.

**Fix.** `src/app/slim.ts` keeps only what Home draws, about 50 KB per account. Series entries on shelves have no `media` field and are handled separately.

## Live updates stopped after standby

**Cause.** After standby a socket can look open while the connection is dead, and the token it signed in with may have expired.

**Fix.** A watchdog drops the socket after 70 s of silence (the server pings every 25 s). `auth_failed` triggers a token refresh and a fresh `auth`. Returning to the app refreshes the token if needed before reconnecting.

## Left on a setting jumped to the rail

**Cause.** The side rail listens for Left in the capture phase and moves focus to itself from the leftmost element.

**Fix.** Controls that use Left themselves carry `data-own-left`, and the rail leaves them alone. At the end of their range they let Left through.

## Sign-in tokens were stored in plain text

**Cause.** Profiles, with each account's access and refresh tokens, sat in `localStorage`, which webOS keeps as readable files on the TV.

**Fix.** `src/platform/vault.ts` keeps them in one AES-256-GCM encrypted entry. The key is generated on the TV with Web Crypto, created non-extractable, and stored in the app's IndexedDB. The vault is unlocked before the app renders, so reads stay synchronous, and writes are encrypted in the background, with a flush before the app exits. Existing plaintext entries move into the vault on first launch and are then deleted. LG's Keymanager3 would keep the key in secure hardware, but it needs webOS TV 24 or later. Without Web Crypto, the vault falls back to plain storage rather than signing everyone out, and Diagnostics says so.

## No cover for the longest book in Year in Review

**Cause.** `longestAudiobookFinished.id` is the book's media ID, not its library item ID, and covers are fetched by item.

**Fix.** The highlight shows the title and length without a cover.
