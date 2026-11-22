# Interface and interaction

Vox Folio is used from a sofa, three metres from a 1920×1080 panel, with an LG remote. People mostly look away from the screen while they listen. So the UI has to answer "where am I in this book?" at a glance, and it has to work with a D-pad without anyone having to think about it. The [design mockups](https://claude.ai/artifact/8cxgCX16T6XwtciZtL2NBK) show each screen below.

## Principles

1. **The player is home base.** Playing is the main job. Every other screen gets you to the player and then gets out of the way. When a book is playing, Back from the root screens opens the player instead of quitting.
2. **One focus, always visible.** Something always has focus. It is shown by scale plus a brass ring that holds up on bright covers. When a screen opens, focus lands on the most likely next action: Resume, Play, or the book you came from.
3. **Back always goes back.** Back returns to the previous screen and restores focus to the item you left. It never leaves a screen without focus. It only exits the app from the root screens, and only when nothing is playing.
4. **Book time, everywhere.** Positions and percentages count from the start of the whole book, not the current file. Chapter time is a secondary readout.
5. **Calm by default.** A dark warm ground, no autoplaying previews, one accent. The screensaver keeps the panel from burning in and still shows what's playing.

## Layout and type at 1080p

| Token | Value | Use |
| --- | --- | --- |
| Safe area | 96px sides, 54px top/bottom (5%) | Nothing interactive outside it |
| Grid | 12 columns, 32px gutter, inside the safe area | Rows of covers, detail layouts |
| Display | Newsreader 64–88px | Book titles on details and the player |
| Heading | Figtree 600, 40px | Row and section headings |
| Body | Figtree 28px, minimum 24px | Metadata, lists |
| Ground | `#0F1115` | Default background |
| Surface | `#1A1D23` / raised `#242831` | Cards, panels |
| Text | `#F3EEE6`, secondary `#A9A39A` | Both pass 4.5:1 on the ground |
| Focus | `#F2B84B` brass, 4px ring + 1.06 scale | The only accent colour |

Covers are square everywhere, because that's the shape Audiobookshelf usually stores them in. A portrait cover is letterboxed against a blurred copy of itself rather than cropped. The player and details screens tint their background with a dark colour taken from the cover.

## Remote mapping

| Key | Browse screens | Player |
| --- | --- | --- |
| D-pad / OK | Move focus, select | Move between controls |
| Back | Previous screen, focus restored | Previous screen; from the root, stay on the player |
| Play/Pause | Resume the focused book, or the current one | Toggle |
| ◀◀ / ▶▶ | — | Skip back 30s / forward 30s (configurable) |
| Channel ▲/▼ | Page the grid | Next / previous chapter |
| Red / Green / Yellow / Blue | Blue: back to the player (when a book is loaded) | Chapters / Speed / Sleep timer (with the autoplay toggle) / Bookmark here |
| Magic Remote pointer | Hover gives focus | Click the scrubber to seek |

On the player, Up/Down moves between rows: transport, then scrubber, then secondary actions. Left/Right on the focused scrubber steps 10s, holding it accelerates to 1 min and then to 5 min steps, and OK confirms the seek. While a seek is pending, a preview shows the target chapter and time, and Back cancels it.

## Screens

| Screen | Purpose | First focus |
| --- | --- | --- |
| Setup | Server URL, then username and password, then test. Explains why a title launch is waiting. | Server URL field |
| Ready (MVP) | Signed in, waiting for a launch. Shows the last book with a Resume button. | Resume |
| Home | A Continue Listening hero card, then rows for Continue, Recently Added and Series. Without in-progress books, Recently Added becomes the hero. | Hero Resume |
| Library | A left rail (Home, Library, Series, Search, Settings) and a cover grid with sort. | First cover, or the last one focused |
| Title details | Cover, metadata, progress, Resume/Play, the series link, Next in Series and chapters. | Resume / Play |
| Series | Ordered list showing sequence numbers, including 2.5, plus each book's progress and finished state. | The book you came from |
| Player | Cover, title, chapter, book position, scrubber with chapter ticks, transport, speed, autoplay. | Play/Pause |
| Chapters panel | Slides over the right third of the player. The current chapter is marked. | Current chapter |
| Speed panel | Steps from 0.5× to 2.0× in 0.05× increments, with presets. Rate changes go through the TV media service so the sound stays on. | Current rate |
| Up Next | Shows 15s before the end when autoplay is on: the next cover, a countdown, and Play now or Not now. | Play now |
| Screensaver | A floating cover, title and percentage of the book. Any key wakes it without acting on that key. | — |
| Errors | Title unavailable, connection lost (shows unsynced time), server unreachable. | Retry or Home |

## States worth designing for

- **Launch while a different book plays.** Show a short "Switching to …" toast on the player. Don't show a confirmation dialog: the launch request is the user's intent.
- **Newer position on another device.** If the server is ahead of the local position after reconnecting, show "Picked up from your phone: 2h 14m" for 4s. Don't ask.
- **Unsynced.** A small cloud-off glyph next to the position, with the time since the last sync. It clears silently.
- **Loading.** Use skeleton cover tiles, never spinners over the content. The player shows the cover and title as soon as they are known, before the audio is ready.

## Implementation notes for Chromium 79

The rooted TV's engine is Chromium 79, which doesn't support several modern CSS features: flexbox `gap` (84), `aspect-ratio` (88), `:focus-visible` (86) and `inset` (87). Use margins, padding-box ratio wrappers, a JS-managed `.focused` class and explicit offsets instead. Animate only `transform` and `opacity`. Keep focus transitions at 120–160ms and turn off the screensaver drift while the remote is in use.
