# Guardian card translation placement

Fixture: ../fixtures/guardian-translation-placement-repro.html and
../fixtures/guardian-translation-placement-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/guardian-translation-placement-repro.html
in Chrome.

## Scenario and expected result

This fixture models the supplied Guardian front page at
https://www.theguardian.com/international. Guardian story cards can render a
category as a block child before the headline text inside the same heading.
The headline translation must stay after the original headline, while the
category remains before the headline.

The repaired case must report translationAfterOriginal: true,
categoryStillBeforeHeadline: true, translationCount: 2, testPassed: true, and
restoredAfterStop: true.

## Cleanup and limitations

Stop the translation session and confirm that the generated nodes are removed.
The fixture models the supplied page; it does not replace validation on the
live Guardian site.
