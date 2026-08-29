# YouTube long description paragraph placement

Fixture: ../fixtures/youtube-description-paragraphs-repro.html and
../fixtures/youtube-description-paragraphs-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/youtube-description-paragraphs-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied YouTube video at
https://www.youtube.com/watch?v=h9QaF2X74H0. YouTube renders the expanded
description inside expanded and yt-attributed-string as nested inline spans;
paragraphs are separated by blank lines in a text node rather than by p or br
elements. Each generated translation must follow its own source paragraph
instead of being inserted once after the entire description.

The repaired case must report translationCount: 3, interleaved: true,
testPassed: true, and restoredAfterStop: true.

## Cleanup and limitations

Stop the session and confirm that the expanded description returns to its
original markup. The fixture is deterministic and does not replace a live
YouTube check.
