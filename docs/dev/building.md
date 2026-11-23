---
title: Building and testing
parent: Developer guide
nav_order: 5
---

# Building and testing

```sh
npm install
npm test           # Jest unit tests
npm run typecheck
npm run lint       # project eslint.config.mjs; any warning fails
npm run build      # lint, production build into dist/, then the ES2019 check
npm run package    # build, then ares-package into build/
```

## Lint

`eslint.config.mjs` uses Enact's rules without `enact/jsx-no-bind` (inline handlers in JSX are fine, and list tiles are memoised). `npm run lint` runs with `--max-warnings 0`, and the build runs it first, then packs with Enact's own lint pass turned off.

## On a TV

The scripts read `TV_HOST` and `TV_KEY` from `./tv.conf` (git-ignored) and need SSH access to a rooted TV.

```sh
tools/deploy.sh [--no-build] ['<launch params>']   # build, copy, install and launch
tools/tv-launch.sh [--cold] '<launch params>'      # launch or relaunch
tools/tv-screenshot.sh out.png                    # capture the screen
```

## Development launch parameters

These only work alongside `probe`, so a normal launch never triggers them. `tools/probe_listener.py` (port 8766) receives the reports.

| Param | Effect |
| --- | --- |
| `probe` | URL to post diagnostics to: errors, sync failures, audio state, key focus, frame timing |
| `devLogin` | `{server, username, password}` to sign in without typing |
| `keys` | Replays remote presses, for example `"down,ok,wait,red,back"`, and reports where focus landed |
| `perf` | Measures frame rate while `keys` play |
| `searchText` | Pre-fills Search |
| `idle` | Seconds before the screensaver appears |
| `yearPrompt` | Shows the Year in Review prompt on Home out of season |

## Against a real server

`.abs-test.env` (git-ignored) holds test account details. `tools/abs-progress.sh` prints what the server has saved for an item, and `tools/abs-simulate-phone.sh` acts as another device saving a position, which exercises live updates and catch-up.

## In a desktop browser

`npm run serve`, or any static server on `dist/`, runs the app in Chrome. Launch parameters come from the query string. The browser needs `--disable-web-security`, since the server sends no CORS headers.

## CI and releases

- **Build** (`.github/workflows/build.yml`) runs on every push and pull request: typecheck, tests, the production build with its ES2019 check, and packaging. The `.ipk` is attached to each run.
- **Release** (`.github/workflows/release.yml`) runs on a `v*` tag, packages the app, writes the Homebrew Channel manifest (`tools/hbchannel-manifest.sh`), and publishes both to a GitHub release.

Versions follow a simple rule: a fix or tidy-up bumps the last number, a feature bumps the middle one, and a large change of technology bumps the first. `package.json` and `webos-meta/appinfo.json` carry the same version.
