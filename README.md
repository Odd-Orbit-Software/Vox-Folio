# Vox Folio

An Audiobookshelf player for LG webOS TVs, by [Odd Orbit Software](https://oddorbit.software). Built with Enact (core, spotlight and ui only, without a theme) and TypeScript. The plans are in [`docs/plans/`](docs/plans/).

## Develop

```sh
npm install
npm test          # unit tests (engine, client, launch handling, timeline)
npm run typecheck
npm run build     # production build into dist/, then the Chromium 79 syntax check
npm run serve     # desktop browser; launch params come from the query string, e.g. ?abs=<item id>
                  # (a desktop browser needs --disable-web-security: the server sends no CORS headers)
```

## Deploy to the rooted TV

`TV_HOST` and `TV_KEY` come from `./tv.conf`, or from `../polaris/tv.conf` if that's missing. Both files are git-ignored.

```sh
tools/deploy.sh [--no-build] ['<launch params json>']   # build, copy over SSH, install, launch
tools/tv-launch.sh [--cold] '{"abs":"<item id>"}'        # launch or relaunch like Polaris does
tools/tv-screenshot.sh out.png                          # capture the TV screen
```

The scripts below exercise and check the real server with the test account in `.abs-test.env` (git-ignored: `VOX_ABS_URL`, `VOX_ABS_USER`, `VOX_ABS_PASS`). Avoid naming that file `.env.local`, because Enact's build loads it.

```sh
tools/abs-progress.sh <item id>              # what the server has saved
tools/abs-simulate-phone.sh <item id> <secs> # act as another device saving a position
```

### Development launch params

These are honoured only when `probe` is also present, so a normal launch never triggers them. Run `tools/probe_listener.py` (port 8766) to receive the reports.

| Param | Effect |
| --- | --- |
| `probe` | URL to post diagnostics to: uncaught errors, sync failures, audio element state |
| `server` | With `probe`, checks what the TV's engine allows against that server (CORS and so on) |
| `devLogin` | `{server, username, password}`: signs in without typing on the TV |
| `keys` | Replays remote presses, e.g. `"down,ok,wait,green,ok,back"` |
| `searchText` | Pre-fills the Search box, since replayed keys can't type |
| `idle` | Seconds of no input before the screensaver appears, for testing. Normally it appears only when the TV asks |

## Things this TV taught us

- **The engine is Chromium 79** (`Chrome/79.0.3945.79`). Enact transpiles only `@enact/*`, so `npm run build` parses the bundle as ES2019 and fails on `?.` or `??` from dependencies. Avoid flexbox `gap`, `inset`, `aspect-ratio` and `:focus-visible` in CSS.
- **Enact's px-to-rem conversion is off** (`"ri": false` in package.json). Left on, it divides every px value by 24 against the browser's 16px root, so the 1920×1080 layout rendered at two-thirds size.
- **CORS doesn't apply.** The app runs from `file://` and talks to Audiobookshelf directly, even though the server sends no CORS headers.
- **Playback speed must go through the TV's media service.** Any `playbackRate` other than 1 mutes the audio. `src/platform/playRate.ts` calls `luna://com.webos.media/setPlayRate` with `audioOutput: true` on the element's pipeline (`el.mediaId`). Sound stays on, pitch-corrected.
- **The `<audio>` element has to be in the document**, and it is.
- **Screensaver:** webOS asks registered apps before starting its own (`tvpower/power/registerScreenSaverRequest`). Vox Folio says no while it's visible and shows its own drifting screensaver (with the time) instead. After an hour on ours with nothing playing, it lets the TV's power-saving take over. The press that wakes it is swallowed.
- **Audiobookshelf 2.37 auth:** log in with `x-return-tokens: true` to get a refresh token. Each refresh rotates it, so refreshes are serialised and every new pair is saved. Access tokens last 1 h, and the token in audio URLs is refreshed when the stream errors.
- **Session `sync` and `close` answer with plain-text `OK`**, not JSON.
- **Listening time goes in `timeListened`** (the seconds since the last sync), not `timeListening`. With the wrong name, the server still saves the position and answers 200 but records no listening time, and a session with none is never saved to history.
- **Sessions only count once closed.** The app closes them when it's hidden or exits, after 10 paused minutes, and at the end of a book; Play then opens a new one.
