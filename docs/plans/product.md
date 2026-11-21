# Vox Folio

Vox Folio is an audiobook player for LG webOS TVs from Odd Orbit Software Group. The first release will be a homebrew app for the group's rooted TV, packaged as an installable IPK. Vox Folio owns its player, server connection, settings and release cycle. It connects directly to Audiobookshelf.

Odd Orbit uses the domains `oddorbit.software` and `oddorbitsoftware.com`. Vox Folio's proposed app ID uses the reverse of `oddorbit.software` as its namespace.

## MVP

The first playable build answers three questions on the rooted TV.

- **Does my place follow me?** Pause a book in Absorb on Android, continue it in Vox Folio, then return to the same passage on the phone. Both clients use the same Audiobookshelf account.
- **Can another app open my book?** Selecting a listening-progress card opens the requested title and starts from the server's current position, even when the card shows older progress. This works on first launch and when Vox Folio is already running.
- **Can I listen with the remote?** Play and pause, skip backward and forward, seek to a position, move between chapters and change playback speed. Show the title, chapter and current position so the listener can tell where they landed.

## Complete homebrew app

Absorb on Android is the feature reference for browsing and listening. Vox Folio streams books from Audiobookshelf. Downloading books to the TV for offline playback is outside the product scope. [Absorb feature list](https://github.com/pounat/absorb#readme)

| Required feature | What the listener can do |
| --- | --- |
| Library and titles | Open Vox Folio from the TV's app list, choose a library, browse titles, see title details and play or resume a book. Continue Listening offers a shortcut when books are in progress. |
| Series navigation | Browse series, open an ordered list of its books and select a title. From a title, select its series name to return directly to that series. |
| Next in series | See which book comes next on the title screen and select it. Use the series sequence from Audiobookshelf, including fractional entries such as book 2.5. |
| Series autoplay | Turn autoplay on or off. When a book finishes with autoplay on, save its completion and start the same next book shown on screen. At the end of a series, playback stops. |
| Playback speed | Adjust narration speed with the remote and see the active rate. The position used for cross-device resume stays in book time at every speed. |
| Listening screensaver | After inactivity during playback, float the current cover, title and percentage of the whole book completed around the screen. The details update as the narration continues. Wake the controls with the remote and keep listening from the same point. |

The first installation targets one server and one listening account. The proposed meaning of “next” is the next title available in that library's series order. LG Apps distribution can be considered after the homebrew release.

The [playback and launch plan](playback-and-launch.md) defines how the player opens a title. The [delivery plan](delivery.md) sets out what to verify on the TV.

The [roadmap](roadmap.md) lists the features planned after the homebrew app.
