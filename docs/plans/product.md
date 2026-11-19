# Vox Folio

Vox Folio is an audiobook player for LG webOS TVs from Odd Orbit Software Group. The first release will be a homebrew app for the group's rooted TV, packaged as an installable IPK. Vox Folio owns its player, server connection, settings and release cycle. It connects directly to Audiobookshelf.

## Listening on the TV

Opening Vox Folio from the TV's app list shows **Continue Listening** and a way to choose a book from the library. On first use, the listener connects their Audiobookshelf server and signs in. A listener with no books in progress lands on the library.

Selecting a book on a launcher's listening-progress card opens that book in Vox Folio. If the listener advanced two chapters on their phone after the card appeared, the TV starts at the newer position. The player shows the title, current chapter and time remaining. The remote's OK button pauses or resumes, and the player provides controls for seeking and changing chapters.

## First release decisions

- Support one server and one listening account per installation. A launcher and Vox Folio should point to the same library and account for progress to match.
- Handle both a single M4B with embedded chapters and a book split across audio files. Moving to the next chapter should work even when both chapters are in the same file.
- Give the standalone app and the launch shortcut equal access to the same player. A listener can use the full app on a TV with the stock launcher.
- Start with audiobooks. Episode selection, additional TV generations and an LG Apps submission can each be considered after the first homebrew release.

The [playback and launch plan](playback-and-launch.md) defines how the player opens a title. The [delivery plan](delivery.md) sets out what to verify on the TV.
