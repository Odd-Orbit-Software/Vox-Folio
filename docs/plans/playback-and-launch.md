# Playback and title launches

The proposed webOS app ID is `software.oddorbit.voxfolio`. The display name is **Vox Folio**.

## Entry points

| Action | Expected behaviour |
| --- | --- |
| Open the app tile | Show setup on first use, then Continue Listening or the library. |
| Open a title by ID | Start a playback session for that book and resume at the server's current position. A new book starts at the beginning. |
| Open a title before signing in | Carry the requested ID through setup and then open it. |
| Request the currently playing book again | Bring its player forward and preserve the position and play/pause state. |
| Request a different book while playing | Resolve the requested book, save and close the previous session, then switch audio. A repeated request must not start a second audio stream. |
| Open an unavailable book | Explain that the title could not be opened and offer a return to the library. Offer Retry for connection failures. |

## Optional launcher integration

Use the existing Polaris audiobook card payload for the first integration. This example represents the application manager launch request a caller would send.

```json
{
  "id": "software.oddorbit.voxfolio",
  "params": { "abs": "example-library-item-id" }
}
```

`abs` identifies an Audiobookshelf library item on the configured server. Vox Folio accepts a nonempty item ID, uses its own signed-in account, and fetches the current playback position. Route cold launches and relaunches of an already running app through the same title handler. Check both paths on the target firmware. [LG app lifecycle guide](https://webostv.developer.lge.com/develop/guides/app-lifecycle-management)

Polaris already puts the item ID into `params.abs` and currently points audiobook cards at Tonalo. Once Vox Folio passes a direct launch test on the TV, a separate change in Polaris can point audiobook cards at the new ID and update their displayed source. Its music and podcast cards have their own routing considerations.

## Playback session

1. Start a session with `POST /api/items/{id}/play` and advertise the audio types verified on the TV. Read the starting position and ordered audio tracks from the response. Exercise server transcoding with a format the TV cannot play directly.
2. Keep the user's position in seconds from the beginning of the book. Use each track's start offset to translate that position into a seek within the active file. Use chapter timestamps for chapter controls.
3. Send the book position and actual time spent listening to `POST /api/session/{id}/sync` periodically and on pause. A paused minute contributes zero listening time. Save during playback so an abrupt TV shutdown loses at most the interval since the last successful sync.
4. On a normal exit or a title change, flush the latest position and close the session. On a lost connection, show the unsynced state. Before writing a delayed update after reconnecting, check whether another device has already advanced the book.

Verify response fields and session behaviour against the installed server during the first playback test. [Audiobookshelf API reference](https://api.audiobookshelf.org/)
