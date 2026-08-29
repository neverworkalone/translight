# Generic grid layout safety

Fixture: ../fixtures/grid-layout-safety-repro.html and
../fixtures/grid-layout-safety-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/grid-layout-safety-repro.html
in Chrome.

## Scenario and expected result

This fixture covers generic cases that must not use the AP single-row anchored
placement: a two-row grid and a flex source with overflow hidden. Unsafe
translations are placed outside the grid so existing host items keep their
positions. It also covers the translation-only fallback for a safe single-row
grid source and a one-row-to-two-row responsive transition.

The repaired case must report external placement without overlap, clipping, or
host layout movement for the unsafe cases; visible anchored fallback text with
the source hidden; a safe re-evaluation after the responsive transition;
restoredAfterStop: true; and testPassed: true.

## Cleanup and limitations

Stop the session and confirm that source content and host layout are restored.
Use a real browser for responsive, clipping, and geometry observations.
