# YouTube collector mutation performance

Fixture: ../fixtures/youtube-collector-mutation-repro.html and
../fixtures/youtube-collector-mutation-repro.js

## Prerequisites

Start the Vite development server from the repository root with npm run dev.

## Run

Open http://127.0.0.1:5173/tests/fixtures/youtube-collector-mutation-repro.html
in Chrome.

## Scenario and expected result

The fixture models the initial YouTube comment and description collection,
then appends one description paragraph and one comment after the first
translation pass. The collector must translate only the two initial blocks and
the two newly added blocks, without repeatedly traversing the whole page.

The repaired case must report initialTranslationCount: 2,
mutationTranslationCount: 4, testPassed: true, and restoredAfterStop: true.

## Cleanup and limitations

Stop the session and confirm that all generated nodes are removed. The
performance check uses deterministic collection and translation counts; use
the CFT or browser runner for actual CPU and responsiveness measurements.
