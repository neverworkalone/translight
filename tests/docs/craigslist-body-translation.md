# Craigslist posting-body translation

Fixture: ../fixtures/craigslist-body-translation-repro.html and
../fixtures/craigslist-body-translation-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/craigslist-body-translation-repro.html
in Chrome.

## Scenario and expected result

The fixture models the supplied Craigslist page at
https://www.craigslist.org/view/d/play-organised-soccer-fooball-in-seoul/hfuqhkJcBAZYkn7k6SwE55.
Its posting body is a semantic section with id postingbody whose English
paragraphs are direct text nodes separated by br elements, with a hidden
print-only div before them. The collector must split the three visible
paragraphs and place all three generated translations inside postingbody.

The repaired case must report sourceSegmentCount: 3,
bodyTranslationCount: 3, rootOverflowAnchor: auto, and testPassed: true.

## Cleanup and limitations

Stop the session and confirm the posting body is restored. The fixture is a
deterministic reproduction of the supplied page structure, not a live Craigslist
browser test.
