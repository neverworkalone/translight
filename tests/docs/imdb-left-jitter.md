# IMDb left-column Awards jitter

Fixture: ../fixtures/imdb-left-jitter-repro.html and
../fixtures/imdb-left-jitter-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open this URL in Chrome while the Vite development server is running:

http://127.0.0.1:5173/tests/fixtures/imdb-left-jitter-repro.html?scenario=rerender&top=600

## Scenario and expected result

This fixture models the Awards card DOM from the supplied IMDb snapshot at
https://www.imdb.com/name/nm0005370/. The supplied recording uses another IMDb
profile, https://www.imdb.com/name/nm1296883/?ref_=hm_mpc_rnk_2, but both pages
use the same inline-list Awards pattern. During the run, the host replaces the
inner award-content markup six times, matching the reconciliation that caused
the left card to oscillate.

The repaired case must report cardHeight.distinctHeights: [49],
stablePlacement: true, and testPassed: true. Before the fix, the same scenario
reported alternating card heights [49, 95] and kept the generated translation
inside the replaceable card.

## Cleanup and limitations

Stop the session and confirm that the original Awards markup is restored. The
fixture models the saved DOM and does not validate the live IMDb site.
