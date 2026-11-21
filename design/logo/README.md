# Vox Folio logo

A VF monogram drawn as an open book, in brass (`#F2B84B`) on ink (`#0F1115`).

| File | Use |
| --- | --- |
| `vox-folio-mark-gemini.png` | The original concept, generated with Gemini |
| `vox-folio-mark.svg` | A vector traced from it, without the glow. Used in the app (`src/assets/`) |
| `vox-folio-mark-bold.svg` | Heavier strokes so the mark still reads at 80×80 from across a room. Used for the TV icons (`webos-meta/icon.png`, `largeIcon.png`) |

The vectors were traced with potrace from a thresholded crop of the concept image. To regenerate an icon:

```sh
magick -background '#0F1115' -density 96 vox-folio-mark-bold.svg -resize 96x96 -gravity center -extent 130x130 largeIcon.png
```

## Wordmark

"Vox Folio" is set in **Newsreader 600, upright**, in paper (`#F3EEE6`), beside the brass mark. It's the same serif the app uses for book titles, so the brand and the content read as one family. The UI text is Figtree.
