# IMDb native scroll-anchor observation

Fixture: ../fixtures/imdb-jitter-repro.html and
../fixtures/imdb-jitter-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open this URL in Chrome:

http://127.0.0.1:5173/tests/fixtures/imdb-jitter-repro.html?scenario=recovery&top=3100

## Scenario and expected result

The fixture simulates an IMDb-style long page where the host briefly displays a
generated translation and removes it during the next reconciliation. It samples
scrollY while the session translates the page and reports the result in the
fixed panel. The renderer keeps the document's native scroll anchoring enabled;
only generated translation nodes opt out of anchoring.

This is an observation of the browser's native compensation during generic
content churn. jitterDetected is diagnostic and can be true by design. The
configuration check must report rootOverflowAnchor: auto and testPassed: true.

## Cleanup and limitations

Stop the session and confirm the fixture returns to its original content. Use a
real browser for this observation; mocked layout values are not equivalent to
native scroll anchoring.
