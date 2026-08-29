# Booking nested inline residual paragraphs

Fixture: ../fixtures/booking-nested-inline-residual-repro.html and
../fixtures/booking-nested-inline-residual-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/booking-nested-inline-residual-repro.html
in Chrome.

## Scenario and expected result

This fixture models the post-review Booking case where paragraph labels and
blank-line text are nested inside inline containers, while introduction,
interstitial, and concluding prose remains outside those containers. It also
includes two sibling inline containers to verify source coverage and order.
The runner checks rendered source/translation pairs for vertical overlap, stops
and restarts the same session, and verifies cleanup without duplicate segments.

The repaired case must report segmentCount: 11, translationCount: 11,
interleaved: true, restoredAfterStop: true, restoredAfterRestart: true,
restartHasNoDuplicates: true, and testPassed: true.

## Cleanup and limitations

Stop the restarted session and confirm that the original markup is restored.
The fixture covers the saved DOM shape and not a live Booking page.
