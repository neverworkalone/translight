# YouTube comment translation placement

Fixture: ../fixtures/youtube-comment-placement-repro.html and
../fixtures/youtube-comment-placement-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/youtube-comment-placement-repro.html
in Chrome.

## Scenario and expected result

The fixture models the supplied YouTube video at
https://www.youtube.com/watch?v=lzopkfaUcKs. YouTube places a hidden
yt-pdg-comment-chip-renderer inside the comment body before the visible
yt-attributed-string comment text, while the visible text wrapper can use a
larger font than its parent block. The hidden chip must not make the comment
look like a mixed block; the generated translation must follow the original
comment and match the visible text wrapper typography.

The repaired case must report translationCount: 1,
translationAfterOriginal: true, matching source and translation font and line
height values, testPassed: true, and restoredAfterStop: true.

## Cleanup and limitations

Stop the session and confirm that the original comment markup is restored. The
fixture checks browser typography and placement for the saved DOM shape.
