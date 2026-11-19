# Homebrew delivery plan

## MVP acceptance on the rooted TV

Package Vox Folio as an IPK and connect it to the same Audiobookshelf account as Absorb on the phone. Record the TV firmware, webOS version and server version alongside the results. Use one M4B with embedded chapters and one book split across files. These checks are pending until exercised on hardware.

- [ ] **Phone → TV → phone.** Pause mid-chapter on the phone. Launch that title on the TV, confirm the opening passage, listen past a recognisable sentence and pause. Reopen it on the phone and confirm it resumes at the new passage. Repeat across a file boundary and at a speed above 1×.
- [ ] **External title launch.** Send the [documented item ID](playback-and-launch.md) from outside the app. Test a cold start, an already open player and a different book playing. Advance the book on the phone after preparing the launch request and check that Vox Folio uses the newer position. A first-time launch should retain the requested title through sign-in.
- [ ] **Remote playback controls.** Play, pause, skip in both directions, seek to a later position, change chapters and select a playback speed. Check that skipping chapters works inside the single M4B and that audio continues across files in the multi-file book. Pausing should save the position and stop adding listening time.

During development, check the packaged app against the target TV's browser engine. Polaris targets Chromium 79 on this setup. Try an unknown item ID followed by a valid request. Interrupt the network during playback, advance the book on the phone, then reconnect the TV and check that the phone's newer position survives.

Polaris can exercise the external launch contract through its Continue card once its audiobook target is updated in that project's repository. The same request can be issued independently to test Vox Folio.

## Complete app acceptance on the rooted TV

Run the MVP checks again, then verify the complete listening experience.

- [ ] From the app tile, open a library, browse titles, open title details and start playback. Check the home screen with and without in-progress books.
- [ ] Browse to a series, open a title, then use the series name on that title to reach the ordered series list. Use Back to return to the same title with focus restored.
- [ ] Verify the next title shown for books 2, 2.5 and 3 in a sample series. With autoplay enabled, finish book 2 and confirm the displayed successor starts and book 2 is marked complete on the phone. With autoplay disabled, confirm the successor remains visible for manual selection. At the final book or a standalone title, playback ends cleanly.
- [ ] Leave a book playing until the in-app screensaver appears. Verify the entire cover and text move within the screen edges, the percentage advances and audio continues. Wake the player with the remote and confirm the first wake press preserves the play state. Repeat across an autoplay transition and verify the cover and progress switch to the new book.
- [ ] Install the release IPK over the MVP and check that the server connection and listening progress survive. Record the tested TV and server versions with the installation steps.
