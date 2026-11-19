# Homebrew delivery plan

## 1. Open and resume one real book

Build an IPK with the proposed app ID and install it on the rooted TV. Record the TV firmware, webOS version and Audiobookshelf server version used for the test. Polaris targets Chromium 79 on this setup, so check the packaged app against that engine early. Connect one listener account and implement the title launch and player before expanding the library screen.

**On-TV check.** Start a book on a phone and pause mid-chapter. Launch Vox Folio with its item ID, listen past a recognisable sentence, pause, and reopen the book on the phone. It should resume at the sentence reached on the TV. Repeat the TV launch while Vox Folio is already open.

## 2. Make the standalone app usable

Add Continue Listening, library selection and a remote-navigable player. Test play/pause, short seeks, chapter changes and Back. Keep focus visible when moving between the book list and the player. Make connection failures recoverable from the TV.

**On-TV checks**

- Open the app tile with a fresh installation, connect to the server, choose a book and play it. Repeat with an account that has no listening history.
- Skip an embedded chapter in a single M4B. With a multi-file book, seek across a file boundary, exit and resume on the other side.
- Pause for a minute and check the server's listening history. Test a network interruption during playback and a newer position saved from the phone.
- Open the player with an unknown item ID, then choose a valid book. Request a different book during playback and check that only the selected book is audible.

## 3. Connect the card and package the first release

Test the public launch payload independently first. Then update the audiobook card target in the separate Polaris project and select an actual Continue card using the remote. Advance the book from the phone after the card renders and verify that the TV picks up that newer position. Open Vox Folio from its own tile again as a final standalone check.

Package the tested IPK with its version, installation steps and the TV/server versions used. Test an upgrade over the previous development build to check that setup and server-side progress survive. LG Apps distribution is a possible later milestone.
